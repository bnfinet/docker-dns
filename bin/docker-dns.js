#!/usr/bin/env node

'use strict';
var parseArgs = require('minimist');
var Logger = require(__dirname + '/../lib/logger.js');
var logger = new Logger();
var DockerDns = require(__dirname + '/../lib/docker-dns.js');

/*
 * not implemented
 *
 * var pollInterval = config.pollinterval; var last = Date.now() - pollInterval;
 * var pollForEvents = function() { var time = Date.now(); docker.DockerOde.getEvents({
 * since : last }, function(err, data) { if (config.debug) {
 * dockerDns.logger("---EVENT---", last, data); } if (err) { dockerDns.logger("event error: ",
 * err); } else { } last = time - pollInterval; }); };
 */

var main = function () {
  var argv = parseArgs(process.argv);
  var configFile = argv.c || argv.config;

  var config = {
    debug: (argv.d || argv.debug),
    configFile: configFile
  };

  //try {
    var dockerDns = new DockerDns(config);
  /*} catch (e) {
    util.puts(e.message);
    process.exit();
  }*/

  if (argv.h || argv.help) {
    dockerDns.showHelp();
    process.exit();
  }

  if (argv.v || argv.version) {
    dockerDns.showVersion();
    process.exit();
  }

  dockerDns.initializeDockers(function (errI) {
    if (errI) {
      logger.error("initialization failed, exiting");
      process.exit(1);
    }

    dockerDns.pollDockers(function (errP) {
      if (errP) {
        logger.error('polling failed');
        process.exit(1);
      } else {
        logger.info('docker-dns initialized');
        dockerDns.dnsService.startService(dockerDns.config);

        setInterval(function() {
          dockerDns.pollDockers(function (errP) {
            if (errP) {
              logger.error('polling failed');
              process.exit(1);
            }
          });
        }, dockerDns.config.pollInterval);
      }
    });
  });
};

main();

process.on('SIGINT', function () {
  logger.info("\nGracefully shutting down from SIGINT (Ctrl-C)");
  logger.info('exiting');
  process.exit();
});
