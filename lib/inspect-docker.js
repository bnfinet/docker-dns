"use strict";

// TODO module.exports
// make this an object, per docker, and hang all sorts of stuff off it

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


var pollDocker = function(docker, cb) {
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
			}, cb);
		});
};
