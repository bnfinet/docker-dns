var pkg = require('./package.json');
var config = require('./config/config.js');
var esl = require('./lib/etc-services-lookup.js');
var Docker = require('dockerode');
var docker = new Docker(config.dockerode);
var async = require('async');

var named = require('node-named');
var server = named.createServer();

server.listen(config.node_named.port, config.node_named.bindip, function() {
	console.log('listening for dns queries on %s:%s', config.node_named.bindip,
			config.node_named.port);
});

var _storage = [];
var init = function(cb) {
	// do a big lookup and store what's there to store
	docker.listContainers({
		all : 1
	}, function(err, containers) {
		// TODO create a temp var to hold the recs while they get built
		async.map(containers, buildrecs, function(err, res) {
			if (err) {
				console.log(err);
			} else {
				cb(res);
			}
		});
	});
};

// TODO move to something like recs = { a: [], cname: [], srv: [] }
var soa = new named.SOARecord(config.faketld, {
	ttl : 10
});
var a = [];
var cname = [];
var srv = [];

var refreshRecs = function() {
	a = [];
	cname = [];
	srv = [];
	init(function() {
		console.log("refreshed records");
	});
};

var buildrecs = function(c, cb) {
	// console.log(c);
	var cont = docker.getContainer(c.Id);
	cont.inspect(function(err, insp) {
		if (err) {
			console.log(err);
		} else {
			var ip = getip(insp);

			// a record for UUID -> ipadress
			a[fqdn(c.Id)] = new named.ARecord(ip);

			// a record for first12(UUID) -> ipadress
			var uuid12 = c.Id.substring(0, 12);
			a[fqdn(uuid12)] = new named.ARecord(ip);

			// cname hostname -> first12(UUID)
			if (insp.Config.Hostname) {
				cname[fqdn(insp.Config.Hostname)] = new named.CNAMERecord(
						fqdn(uuid12));
			}

		if (insp.Name) {
		    var clean = cleanName(insp.Name);
		    cname[fqdn(clean)] = new named.CNAMERecord(
			fqdn(uuid12));
		}
			var iHPb = insp.HostConfig.PortBindings;
			if (iHPb) {
				async.each(Object.keys(iHPb),
						function(portproto, done) {
							// foreach portbinding
							if (portproto && iHPb[portproto]) {
								if (config.debug) {
									console.log('ports: ', iHPb[portproto]);
								}
								var port = iHPb[portproto][0].HostPort;
								putsrvrec(portproto, uuid12, uuid12, port);
								// SRV record _service._proto.hostname.faketld port
								// first12.faketld
								if (insp.Config.Hostname) {
									putsrvrec(portproto, insp.Config.Hostname, uuid12, port);
									putsrvrecForServiceName(portproto, insp.Config.Hostname, uuid12, port);
								}
								if (insp.Name) {
									putsrvrec(portproto, clean ,uuid12, port);
									putsrvrecForServiceName(portproto, clean ,uuid12, port);
								}
							}
							done();
						}, function() {
							cb();
						});
			}
		}
	});
};

var rxdotsorslashorcolon = /\.|\/|:/g;
var cleanName = function(name) {
	return name.replace(rxdotsorslashorcolon, "");
};

var fqdn = function(host) {
	return host + '.' + config.faketld;
};

var putsrvrecForServiceName = function(portproto, name, uuid12, port) {
	var s = esl.getService(portproto);
	// add a traditional host specific RFC compliant SRV record
	if (s) {
		var srvname = '_' + s.service + '._' + s.proto + '.' + name;
		putsrvrec(portproto, srvname, uuid12, port);
	}
};

var putsrvrec = function(portproto, name, uuid12, port) {
	// and do a 'skydns' style service record generalized for the host
	if (!srv[fqdn(name)]) {
		srv[fqdn(name)] = [];
	}
	// but see if it exists already before we push
	var newrec = new named.SRVRecord(fqdn(uuid12), parseInt(port));
	async.some(srv[fqdn(name)], function(rec, done) {
		if (rec === newrec) {
			done(true);
		} else {
			done(false);
		}
	}, function(res) {
		if (!res) {
			srv[fqdn(name)].push(newrec);
		}
	});
};


var getip = function(insp) {
	if (insp.HostConfig.PortBindings
			&& Object.keys(insp.HostConfig.PortBindings).length > 0) {
		var ip = insp.HostConfig.PortBindings[Object
				.keys(insp.HostConfig.PortBindings)[0]][0].HostIp;
		// console.log('getip ip: ', ip);
		if (ip === '0.0.0.0') {
			return config.publicip;
		} else {
			return ip;
		}
	} else {
		return insp.NetworkSettings.IPAddress;
	}
};

var pollInterval = config.pollinterval;
var last = Date.now() - pollInterval;
var pollForEvents = function() {
	var time = Date.now();
	docker.getEvents({
		since : last
	}, function(err, data) {
		if (config.debug) {
			console.log("---EVENT---", last, data);
		}
		if (err) {
			console.log("event error: ", err);
		} else {

		}
		last = time - pollInterval;
	});
};

init(function(res) {
	console.log('initialized');
	if (config.debug) {
		console.log(a);
		console.log(cname);
		console.log(srv);
	}
	// pollForEvents();
	// setInterval(pollForEvents, pollInterval);
	setInterval(refreshRecs, pollInterval);
});

server.on('query', function(query) {
	var domain = query.name();
	var type = query.type();
	console.log('DNS Query: (%s) %s', type, domain);
	switch (type) {
	case 'A':
		if (a[domain]) {
			query.addAnswer(domain, a[domain]);
		} else if (cname[domain]) {
			query.addAnswer(domain, cname[domain]);
			if (config.debug) {
				console.log('cname a: ',cname[domain].target, a[cname[domain].target]);
			}
			query.addAnswer(cname[domain].target, a[cname[domain].target]);
		}
		server.send(query);
		break;
	case 'CNAME':
		query.addAnswer(domain, cname[domain]);
		if (config.debug) {
			console.log('cname a: ',cname[domain].target, a[cname[domain].target]);
		}
		query.addAnswer(cname[domain].target, a[cname[domain].target]);
		server.send(query);
		break;
	case 'SOA':
		query.addAnswer(domain, soa);
		server.send(query);
		break;
	case 'SRV':
		async.each(srv[domain], function(rec, done) {
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
