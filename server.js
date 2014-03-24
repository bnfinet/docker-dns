var pkg = require('package.json');
var config = require('config/config.js');
var Docker = require('dockerode');
var docker = new Docker(config.dockerode);
var async = require('async');

var named = require('node-named');
var server = named.createServer();

server.listen(config.node - named.port, config.node - named.bindip, function() {
	console.log('listening for dns queries on %s:%s', config.node_named.bindip, config.node_named.port);
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
	console.log("buildrec from containter: ", c);
}

docker.getEvents({}, function(e) {
	console.log("event: ", e);
});



