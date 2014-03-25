var pkg = require('./package.json');
var config = require('./config/config.js');
var esl = require('./lib/etc-services-lookup.js');
var Docker = require('dockerode');
var docker = new Docker(config.dockerode);
var async = require('async');

var named = require('node-named');
var server = named.createServer();



server.listen(config.node_named.port, config.node_named.bindip, function() {
    console.log('listening for dns queries on %s:%s', config.node_named.bindip, config.node_named.port);
});

server.on('clientError', function(error) {
    console.log("there was a clientError: %s", error);
});

server.on('uncaughtException', function(error) {
    console.log("there was an excepton: %s", error.message());
});

docker.info(function(err, data) {
    console.log("info: ", data);
});

var _storage = [];
var init = function(cb) {
    // do a big lookup and store what's there to store
    docker.listContainers({all: 1}, function(err, containers) {
	async.map(containers, buildrecs, function(err, res) {
		    if (err) {
		    	console.log(err);
		    } else {
		    	cb(res);
		    }	
		});
    });
};

var soa = new named.SOARecord(config.faketld);
var a = [];
var cname = [];
var srv = [];

var buildrecs = function(c, cb) {
//    console.log(c);
    var cont = docker.getContainer(c.Id)
    cont.inspect(function(err, insp){
	if (err) {
	    console.log(err);
	} else {
	    console.log('INSPECT INSPECT ', insp.Config.Hostname, insp.NetworkSettings.IPAddress, insp.NetworkSettings.Ports);
//	    insp.HostConfig.PortBindings
	    var ip = getip(insp);

	    // a record for UUID -> ipadress
	    a[fqdn(c.Id)] = new named.ARecord(ip);

	    // a record for first12(UUID) -> ipadress
	    var uuid12 = c.Id.substring(0,12);
	    a[fqdn(uuid12)] = a[fqdn(c.Id)];

	    // cname hostname -> first12(UUID)
	    if (insp.Config.Hostname) {
		cname[fqdn(insp.Config.Hostname)] = new named.CNAMERecord(fqdn(uuid12));
	    }

	    async.each(insp.HostConfig.PortBindings, function(e, done) {
		// foreach portbinding
		var portproto = Object.getKeys(e)[0];	
		putsrvrec(portproto, uuid12, uuid12, e[portproto][0].HostPort);
		// SRV record _service._proto.hostname.faketld port first12.faketld
		if (insp.Config.Hostname) {
		    putsrvrec(portproto, insp.Config.Hostname, uuid12, e[portproto][0].HostPort);
		}
//		if (insp.Name) {
//		    putsrvrec(portproto, cleanName(insp.Name), uuid12, e[portproto][0].HostPort);
//		}
	    });
	}
    });
};

var fqdn = function (host) {
    return host + '.' + config.faketld;
}

var putsrvrec = function(porproto, name, uuid12, port) {
    var s = esl.getServices(portproto);
    var srvname = '_' + s.service + '._' + s.proto + '.' + name;
    srv[fqdn(srvname)] = new named.SRVRecord(fqdn(uuid12), port);
}

var getip = function(insp) {
    if (insp.HostConfig.PortBindings && Object.keys(insp.HostConfig.PortBindings).length > 0) {
	var ip = insp.HostConfig.PortBindings[Object.keys(insp.HostConfig.PortBindings)[0]][0].HostIp;
//	console.log('getip ip: ', ip);
	if (ip === '0.0.0.0') {
	    return config.publicip;
	} else {
	    return ip;
	}
    } else {
	return insp.NetworkSettings.IPAddress;
    }
}
 

docker.getEvents({}, function(e) {
    console.log("event: ", e);
});

init(function(res){
    _storage = res;
    console.log('initialized');
});


server.on('query', function(query) {
    var domain = query.name()
    var type = query.type();
    console.log('DNS Query: (%s) %s', type, domain);
    switch (type) {
    case 'A':
        query.addAnswer(domain, a[domain], 'A');
        break;
    case 'CNAME':
        query.addAnswer(domain, cname[domain], 'CNAME');
        break;
    case 'SOA':
        query.addAnswer(domain, soa, 'SOA');
        break;
    case 'SRV':
        query.addAnswer(domain, record, 'SRV');
        break;
//    case 'TXT':
//       var record = new named.TXTRecord('hello world');
//        query.addAnswer(domain, record, 'TXT');
//        break;
    }
    server.send(query);
});


