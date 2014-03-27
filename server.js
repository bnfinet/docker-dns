var pkg = require('./package.json');
var config = require('./config/config.js');
var esl = require('./lib/etc-services-lookup.js');
var Docker = require('dockerode');
var async = require('async');

var named = require('node-named');
var server = named.createServer();

//TODO move to something like recs = { a: [], cname: [], srv: [] }
var soa = new named.SOARecord(config.faketld, {
	ttl : 10
});
var a = [];
var cname = [];
var srv = [];


var main = function() {
	initializeDockers(function() {
		pollDockers(function(err) {
			if (config.debug) {
				console.log(a);
				console.log(cname);
				console.log(srv);
			}
			if (err) {
				console.log('initialization failed');
			} else {
				console.log('initialized');

				server.listen(config.node_named.port, config.node_named.bindip, function() {
					console.log('listening for dns queries on %s:%s', config.node_named.bindip,
							config.node_named.port);
				});

				// pollForEvents();
				// setInterval(pollForEvents, pollInterval);
//				setInterval(refreshRecs, config.pollinterval);

			}
		});
	});
};

var initializeDockers = function (cb) {
	async.each(config.dockers, function(docker, done) {
		docker.D = new Docker(docker.dockerode);
		done();
	}, cb);
};

var pollDockers = function(cb) {
	async.each(config.dockers, function(docker, done) {
	    if (config.debug) {
		console.log("pollling docker " + docker.publicname);
	    }
		docker.D.listContainers({
			all : 1
		}, function(err, containers) {
		    if (config.debug) {
			console.log("inspecting " + containers.length + " containers");
		    }

			// TODO create a temp var to hold the recs while they get built
			async.each(containers, function(container, next) {
			    if (config.debug) {
				console.log("inspecting " + container.Id);
			    }


				inspectAndBuild(docker, container, next);
			}, done);
		});
	}, cb);
};


var refreshRecs = function() {
	a = [];
	cname = [];
	srv = [];
	pollDockers(function() {
		console.log("refreshed records");
	});
};


var buildRecords = function (docker, insp, c, fqdnFn, ip, cb) {
    if (config.debug) {
	console.log("building records for " + c.Id);
    }


	// A UUID -> ip
	a[fqdnFn(docker, c.Id)] = new named.ARecord(ip);

	// A first12(UUID) -> ip
	var uuid12 = c.Id.substring(0, 12);
	a[fqdnFn(docker, uuid12)] = new named.ARecord(ip);

	// CNAME hostname -> first12(UUID)
	if (insp.Config.Hostname) {
	    if (config.debug) {
		console.log("hostname: " + insp.Config.Hostname);
	    }
			
		cname[fqdnFn(docker, insp.Config.Hostname)] = new named.CNAMERecord(
				fqdnFn(docker, uuid12));

	}
	// container name, or clean name
	var cName = cleanName(insp.Name);
	if (cName) {
		cname[fqdnFn(docker, cName)] = new named.CNAMERecord(fqdnFn(docker, uuid12));
	}
	var iHPb = insp.HostConfig.PortBindings;
	if (!iHPb) {
		cb();
	} else {
		async.each(Object.keys(iHPb), function(portproto, done) {
		    if (portproto && iHPb[portproto]) {
			if (config.debug) {
			    console.log('ports: ', iHPb[portproto]);
			}
			var port = iHPb[portproto][0].HostPort;
			putsrvrec(docker, portproto, uuid12, uuid12, port, fqdnFn);
			// SRV record _service._proto.hostname.faketld port
			// first12.faketld
			if (insp.Config.Hostname) {
			    putsrvrec(docker, portproto, insp.Config.Hostname, uuid12, port, fqdnFn);
			    putsrvrecForServiceName(docker, portproto, insp.Config.Hostname, uuid12, port, fqdnFn);
			}
			if (cName) {
			    putsrvrec(docker, portproto, cName ,uuid12, port, fqdnFn);
			    putsrvrecForServiceName(docker, portproto, cName ,uuid12, port, fqdnFn);
			}
		    }
		    done();
		}, function() {
			    if (config.debug) {
				console.log("calling back from buildRecord");
			    }

		    cb();
		});
	}
};




var inspectAndBuild = function(docker, c, cb) {
	// console.log(c);
	var cont = docker.D.getContainer(c.Id);
	cont.inspect(function(err, insp) {
		if (err) {
			console.log(err);
		} else {
		    var ip = getips(docker, insp);

		    if (config.debug) {
			console.log("ip ", ip);
		    }


		    if (ip.internal) {
			buildRecords(docker, insp, c, localfqdn, ip.internal, function() {

			});
		    }
		    
		    if (ip.exposed) {
			buildRecords(docker, insp, c, publicfqdn, ip.exposed, function() {

			});
		    } 
		    cb();
		    
		}
	});
};

var rxdotsorslashorcolon = /\.|\/|:/g;
var cleanName = function(name) {
	return name.replace(rxdotsorslashorcolon, "");
};

// the public fqdn
var publicfqdn = function(docker, host) {
	return _actualfqdn(host, docker.publicname);
};

// usually resolving to an ip associated with docker0 172.17.42.0/16
var localfqdn = function(docker, host) {
	return _actualfqdn(host, docker.localname);
};

var _actualfqdn = function(host, extra) {
	var ret = host + '.'; 
	if (extra) {
		ret = ret + extra + '.';
	}
	ret =  ret + config.faketld;
	return ret;
};

var putsrvrecForServiceName = function(docker, portproto, name, uuid12, port, fqdnFn) {
	var s = esl.getService(portproto);
	// add a traditional host specific RFC compliant SRV record
	if (s) {
		var srvname = '_' + s.service + '._' + s.proto + '.' + name;
	    putsrvrec(docker, portproto, srvname, uuid12, port, fqdnFn);
	}
};

var putsrvrec = function(docker, portproto, name, uuid12, port, fqdnFn) {
	// and do a 'skydns' style service record generalized for the host
	if (!srv[fqdnFn(docker, name)]) {
		srv[fqdnFn(docker, name)] = [];
	}
	// but see if it exists already before we push
	var newrec = new named.SRVRecord(fqdnFn(docker, uuid12), parseInt(port));
	async.some(srv[fqdnFn(docker, name)], function(rec, done) {
		if (rec.target === newrec.target && rec.port === newrec.port) {
			done(true);
		} else {
			done(false);
		}
	}, function(res) {
		if (!res) {
			srv[fqdnFn(docker, name)].push(newrec);
		}
	});
};


var getips = function(docker, insp) {
	var ip = {
			internal: insp.NetworkSettings.IPAddress,
			exposed: null
	};
	if (insp.HostConfig.PortBindings
			&& Object.keys(insp.HostConfig.PortBindings).length > 0) {
		var hostboundip = insp.HostConfig.PortBindings[Object
				.keys(insp.HostConfig.PortBindings)[0]][0].HostIp;
		// console.log('getip ip: ', ip);
		if (hostboundip === '0.0.0.0') {
			ip.exposed = docker.publicip;
		} else if (hostbound !== ips.internal){
			ip.exposed = hostboundip;
		}
	} 
	return ip;
};


/*
 *  not implemented
 *  
var pollInterval = config.pollinterval;
var last = Date.now() - pollInterval;
var pollForEvents = function() {
	var time = Date.now();
	docker.D.getEvents({
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
*/

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

main();
setInterval(main, config.pollinterval);