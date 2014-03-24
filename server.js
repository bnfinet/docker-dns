var config = require('config/config.js');
var Docker = require('dockerode');
var docker = new Docker(config.dockerode);
var async = require('async');

var named = require('node-named');
var server = named.createServer();

server.listen(config.node - named.port, config.node - named.bindip, function() {
	console.log('listening for dns queries on %s:%s', config.node
			- named.bindip, config.node - named.port);
});

server.on('query', function(query) {
	var domain = query.name();
	console.log('DNS Query: %s', domain)
	var target = new SoaRecord(domain, {
		serial : 12345
	});
	query.addAnswer(domain, target, 'SOA');
	server.send(query);
});


var _storage = [];
var init = function() {
	// do a big lookup and store what's there to store
	docker.listContainers(function(err, containers) {
		async.each(containers, buildrecs, function(err) {
			if (err) {
				console.log(err);
			} 
			console.log('initialized');
		});
	}
}

var buildrecs = function(c, cb) {
	console.log(c);
}
