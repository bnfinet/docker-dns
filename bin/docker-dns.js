#!/usr/bin/env node

'use strict';

var pkg = require('../package.json');
var parseArgs = require('minimist');
var fs = require('fs');
var path = require('path');
var util = require('util');
var async = require('async');
var Docker = require('dockerode');

var Dinspect = require(__dirname + '/../lib/docker-inspect.js');
var dnsserver = require(__dirname + '/../lib/dns-service.js');


// application level object
var ddns = {
	argv: parseArgs(process.argv),
	configFile: '',
	config: null,
	dockers: []
};

// make the logging a little easier on the eyes
ddns.log = function () {
	Array.prototype.unshift.call(arguments, '[DD]');
	console.log.apply(console, arguments);
};

var configureApp = function() {

	if (ddns.argv.h || ddns.argv.help) {
	    util.puts(help);
	    process.exit();
	}

	if (ddns.argv.v || ddns.argv.version) {
		util.puts('docker-dns version ' + pkg.version);
		process.exit();
	}

	ddns.configFile = ddns.argv.c || ddns.argv.config;

	if (!ddns.configFile) {
		// look for ./config/config.js
		ddns.configFile = path.resolve(__dirname, '..', 'config', 'config.js');
	    if (process.env.DOCKER_DNS_CONFIG !== undefined) {
	        ddns.configFile = ddns.configFile.replace(/\.js$/, '_' + process.env.DOCKER_DNS_CONFIG + '.js');
	    }
	}

	if (!ddns.configFile) {
	    util.puts(help);
		process.exit();
	}

	ddns.log('Loading config from ' + ddns.configFile);
	ddns.config = require(ddns.configFile);

	if (ddns.argv.d || ddns.argv.debug) {
		ddns.config.debug = true;
		ddns.log('debuging enabled');
	}

	ddns.config.logger = ddns.log;
};


var main = function() {
	configureApp();
	initializeDockers(function(errI) {
		if (errI) {
			ddns.log("initializaion failed, exiting");
			process.exit(1);
		}
		pollDockers(function(errP) {
			if (errP) {
				ddns.log('polling failed');
			} else {
				ddns.log('docker-dns initialized');
				dnsserver.startservice(ddns.config);
//				setInterval(pollDockers, ddns.config.pollinterval);
				// pollForEvents();
				// setInterval(pollForEvents, pollInterval);
				// setInterval(refreshRecs, config.pollinterval);
			}
		});
	});
};


var initializeDockers = function (cb) {
	async.each(ddns.config.dockers, function(dconfig, done) {
		dconfig.debug = ddns.config.debug;
		dconfig.faketld = ddns.config.faketld;
		dconfig.logger = ddns.config.logger;
		var newD = new Dinspect(dconfig);
		if (newD) {
			ddns.dockers.push(newD);
			done();
		} else {
			done("ERROR initialization of docker "+ dconfig.publicname + " failed");
		}
	}, cb);
};

var pollDockers = function(cb) {
	async.each(ddns.dockers, function(docker, done) {
		docker.inspectContainers(function(err) {
			if (!err) {
				if (ddns.config.debug) {
					ddns.log("back from inspection, off to build");
				}
				docker.buildRecords(function(err, recs) {
					if (ddns.config.debug) {
						ddns.log("back from build, deliver recs to dns server");
						console.log(recs);
					}
					dnsserver.newrecords(recs, done);
				});
			} else {
				done("docker inspect err: " + err);
			}
		});
	}, function(err) {
		if (typeof cb === 'function') {
			cb(err);
		}
	});	
};

/*
 * not implemented
 * 
 * var pollInterval = config.pollinterval; var last = Date.now() - pollInterval;
 * var pollForEvents = function() { var time = Date.now(); docker.D.getEvents({
 * since : last }, function(err, data) { if (config.debug) {
 * ddns.log("---EVENT---", last, data); } if (err) { ddns.log("event error: ",
 * err); } else { } last = time - pollInterval; }); };
 */

main();

process.on('SIGINT', function() {
	ddns.log("\nGracefully shutting down from SIGINT (Ctrl-C)");
	ddns.log('exiting');
	process.exit();
});


var help = [
            'usage: docker-dns [options]',
            '',
            'Starts a docker-dns server',
            '',
            'options:',
            '  -c, --config    location of the configuration file',
            '  -d, --debug     turn on debuging',
            '  -h, --help      display this message',
            '  -v, --version   version information',
            '',
            'more info:',
            'https://github.com/bnfinet/docker-dns',
            '',
        ].join('\n');


