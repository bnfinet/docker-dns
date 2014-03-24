var pkg = require('./package.json');
var config = require('./config/config.js');
var Docker = require('dockerode');
var docker = new Docker(config.dockerode);
var async = require('async');

var named = require('node-named');
var server = named.createServer();

var SOArec = new named.SOARecord(config.faketld);

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

var buildrecs = function(c, cb) {
//    console.log(c);
    var cont = docker.getContainer(c.Id)
    cont.inspect(function(err, insp){
	if (err) {
	    console.log(err);
	} else {
	    console.log('INSPECT INSPECT ', insp.Config.Hostname, insp.NetworkSettings.IPAddress, insp.NetworkSettings.Ports);
	    console.log(insp.HostConfig.PortBindings);
	}
    });
};

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
        var record = new named.ARecord('127.0.0.1');
        query.addAnswer(domain, record, 'A');
        break;
    case 'CNAME':
        var record = new named.CNAMERecord('cname.example.com');
        query.addAnswer(domain, record, 'CNAME');
        break;
    case 'SOA':
        query.addAnswer(domain, SOArec, 'SOA');
        break;
    case 'SRV':
        var record = new named.SRVRecord('sip.example.com', 5060);
        query.addAnswer(domain, record, 'SRV');
        break;
    case 'TXT':
        var record = new named.TXTRecord('hello world');
        query.addAnswer(domain, record, 'TXT');
        break;
    }
    server.send(query);
});


