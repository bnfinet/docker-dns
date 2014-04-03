"use strict";
var async = require('async');
var named = require('node-named');
var _ = require('lodash');
var server = named.createServer();
var logger = require('./logger.js');

var _recs = {};
var config;

var allowedChars = /[A-Za-z0-9\.\*-_]*/;
server.on('query', function(query) {
	var domain = query.name();

	if (!domain.match(allowedChars)) {
		logger.error('bad query',domain);
		server.send(query);
		return;
	}
	
	var type = query.type();
	logger.info('DNS Query:', type, domain);
	switch (type) {
	case 'A':
		if (_recs.a[domain]) {
			query.addAnswer(domain, _recs.a[domain]);
		} else if (_recs.cname[domain]) {
			query.addAnswer(domain, _recs.cname[domain]);
			logger.debug('cname a: ', _recs.cname[domain].target,
						_recs.a[_recs.cname[domain].target]);
			query.addAnswer(_recs.cname[domain].target,
					_recs.a[_recs.cname[domain].target]);
		}
		server.send(query);
		break;
	case 'CNAME':
		query.addAnswer(domain, _recs.cname[domain]);
		logger.debug('cname a: ', _recs.cname[domain].target,
					_recs.a[_recs.cname[domain].target]);
		query.addAnswer(_recs.cname[domain].target,
				_recs.a[_recs.cname[domain].target]);
		server.send(query);
		break;
	case 'SOA':
		query.addAnswer(domain, soa);
		server.send(query);
		break;
	case 'SRV':
		console.log(_recs.srv[domain]);
		findMatchingSRVRecords(domain, function(err, recs) {
			async.each(recs, function(rec, done) {
				logger.debug("srv match:", rec);
				query.addAnswer(domain, rec);
				done();
			}, function() {
				server.send(query);
			});
		});
		break;
	// case 'TXT':
	// var record = new named.TXTRecord('hello world');
	// query.addAnswer(domain, record, 'TXT');
	// break;
	default:
		server.send(query);
	}
});

var findMatchingSRVRecords = function(domain, cb) {
	var ret = [];
	// return the common case immediately
	if (_recs.srv[domain]) {
		logger.debug("found domain " + domain);
		cb(null, _recs.srv[domain]);
	} else {
		// otherwise search for it
		var rx = domainToRegex(domain);
//		console.log(rx);
		async.each(Object.keys(_recs.srv), function(d, done) {
			if (d.match(rx)) {
				logger.debug("match:", d);
				ret = _.union(ret, _recs.srv[d]);
			}
			done();
		}, function(err) {
			// consolidate the results to one target
			ret = _.uniq(ret, 'target');
			cb(err, ret);
		});
	}
	
};

var rxwildcard = /\*/g;
var domainToRegex = function(domain) {
	domain = domain.replace(rxwildcard, ".*");
	return new RegExp(domain);
};


server.on('clientError', function(error) {
	logger.error("there was a clientError: ", error);
});

server.on('uncaughtException', function(error) {
	logger.error("there was an excepton: ", error.message);
});

module.exports.newrecords = function(recs, cb) {
	logger.info("loading new dns records");
	_transformRecords(recs, cb);
};

var _transformRecords = function(recs, cb) {
	async.parallel([ function(done) {
		_buildArecords(recs, done);
//		console.log("a records", _recs.a);
	},
	function(done) {
		_buildCNAMErecords(recs, done);
//		console.log("cname records", _recs.cname);
	},
	function(done) {
		_buildSRVrecords(recs, done);
	} ], cb);
};

var _buildArecords = function(recs, cb) {
	_recs.a = {};
	async.each(recs.a, function(a, done) {
		_recs.a[a.fqdn] = new named.ARecord(a.ip);
		done();
	}, cb);

};

var _buildCNAMErecords = function(recs, cb) {
	_recs.cname = {};
	async.each(recs.cname, function(cname, done) {
//		console.log("buildCNAME", cname);
		_recs.cname[cname.fqdn] = new named.CNAMERecord(cname.a);
		done();
	}, cb);
};

var _buildSRVrecords = function(recs, cb) {
	_recs.srv = {};
	async.each(recs.srv, function(srv, done) {
			logger.debug("servicename: ", srv.name);
			// TODO add weight and priority
			if (!_recs.srv[srv.fqdn]) {
				_recs.srv[srv.fqdn] = [];
			}
			_recs.srv[srv.fqdn].push(new named.SRVRecord(srv.name, srv.port));
			done();
	}, cb);
};

module.exports.startservice = function(c, cb) {
	config = c;
	logger = config.logger;
	_recs.soa = new named.SOARecord(config.faketld, {
		ttl : 10
	});
	server.listen(config.node_named.port, config.node_named.bindip, function() {
		logger.info('listening for dns queries on', config.node_named.bindip, config.node_named.port);
	});
};
