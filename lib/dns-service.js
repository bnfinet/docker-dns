"use strict";

var named = require('node-named');
var server = named.createServer();
var _recs = {};

server.on('clientError', function(error) {
	console.log("there was a clientError: ", error);
});

server.on('uncaughtException', function(error) {
	console.log("there was an excepton: ", error.message);
});


server.on('query', function(query) {
	var domain = query.name();
	var type = query.type();
	console.log('DNS Query: (%s) %s', type, domain);
	switch (type) {
	case 'A':
		if (a[domain]) {
			query.addAnswer(domain, _recs.a[domain]);
		} else if (_recs.cname[domain]) {
			query.addAnswer(domain, _recs.cname[domain]);
			if (config.debug) {
				console.log('cname a: ',_recs.cname[domain].target, _recs.a[_recs.cname[domain].target]);
			}
			query.addAnswer(_recs.cname[domain].target, _recs.a[_recs.cname[domain].target]);
		}
		server.send(query);
		break;
	case 'CNAME':
		query.addAnswer(domain, _recs.cname[domain]);
		if (config.debug) {
			console.log('cname a: ',_recs.cname[domain].target, _recs.a[_recs.cname[domain].target]);
		}
		query.addAnswer(_recs.cname[domain].target, a[_recs.cname[domain].target]);
		server.send(query);
		break;
	case 'SOA':
		query.addAnswer(domain, soa);
		server.send(query);
		break;
	case 'SRV':
		async.each(_recs.srv[domain], function(rec, done) {
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


module.exports.newrecords = function(recs, cb) {
	_transformRecords(recs, cb);
};


module.exports.startservice = function(config, cb) {
	_recs.soa = new named.SOARecord(config.faketld, {
		ttl : 10
	});

	server.listen(config.node_named.port, config.node_named.bindip, function() {
		console.log('listening for dns queries on %s:%s', config.node_named.bindip,
				config.node_named.port);
	});
};


