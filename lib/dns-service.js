"use strict";
var async = require('async');
var named = require('node-named');
var server = named.createServer();
var _recs = {};


server.on('query', function(query) {
	var domain = query.name();
	var type = query.type();
	console.log('DNS Query: (%s) %s', type, domain);
	switch (type) {
	case 'A':
		if (_recs.a[domain]) {
			query.addAnswer(domain, _recs.a[domain]);
		} else if (_recs.cname[domain]) {
			query.addAnswer(domain, _recs.cname[domain]);
			if (config.debug) {
				console.log('cname a: ', _recs.cname[domain].target,
						_recs.a[_recs.cname[domain].target]);
			}
			query.addAnswer(_recs.cname[domain].target,
					_recs.a[_recs.cname[domain].target]);
		}
		server.send(query);
		break;
	case 'CNAME':
		query.addAnswer(domain, _recs.cname[domain]);
		if (config.debug) {
			console.log('cname a: ', _recs.cname[domain].target,
					_recs.a[_recs.cname[domain].target]);
		}
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
		async.each(_recs.srv[domain], function(rec, done) {
			console.log(rec);
			query.addAnswer(domain, rec);
			done();
		}, function() {
			server.send(query);
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

server.on('clientError', function(error) {
	console.log("there was a clientError: ", error);
});

server.on('uncaughtException', function(error) {
	console.log("there was an excepton: ", error.message);
});

module.exports.newrecords = function(recs, cb) {
	console.log("new records");
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
			console.log("servicename: ", srv.name);
			// TODO add weight and priority
			if (!_recs.srv[srv.fqdn]) {
				_recs.srv[srv.fqdn] = [];
			}
			_recs.srv[srv.fqdn].push(new named.SRVRecord(srv.name, srv.port));
			done();
	}, cb);
};

module.exports.startservice = function(config, cb) {
	_recs.soa = new named.SOARecord(config.faketld, {
		ttl : 10
	});

	server.listen(config.node_named.port, config.node_named.bindip, function() {
		console.log('listening for dns queries on %s:%s',
				config.node_named.bindip, config.node_named.port);
	});
};
