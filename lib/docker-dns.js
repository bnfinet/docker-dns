'use strict';

var pkg = require('../package.json');
var fs = require('fs');
var path = require('path');
var util = require('util');
var async = require('async');

var DnsService = require(__dirname + '/../lib/dns-service.js');
var Logger = require(__dirname + '/../lib/logger.js');
var DockerInspect = require(__dirname + '/../lib/docker-inspect.js');

// application level object
function DockerDns(config) {
  var self = this;

  self.config = null;
  self.dockers = [];
  self.logger = new Logger();
  self.logger.setPrepend('DD');
  self.dnsService = null;

  self._init(config);
}

DockerDns.prototype.showHelp = function () {
  var help = [
    'usage: docker-dns [options]',
    '',
    'Starts a docker-dns server',
    '',
    'options:',
    '  -c, --config    location of the configuration file',
    '  -d, --debug     turn on debugging',
    '  -h, --help      display this message',
    '  -v, --version   version information',
    '',
    'more info:',
    'https://github.com/bnfinet/docker-dns',
    ''
  ].join('\n');

  util.puts(help);
};

DockerDns.prototype.showVersion = function () {
  util.puts('docker-dns version ' + pkg.version);
};

DockerDns.prototype._init = function (config) {
  var self = this;
  var configFile = config.configFile;
  var configFilePath = null;

  // if a config file was set, and it's relative to CWD, set absolute path
  if (configFile !== null && fs.existsSync(configFile)) {
    configFilePath = path.resolve(configFile);
  }

  if (configFilePath === null) {
    // look for ./config/.default.config.js
    configFilePath = path.resolve(__dirname, '..', 'config', 'config.default.js');
  }

  if (configFilePath === null && !fs.existsSync(configFilePath)) {
    throw new Error('can\'t find ' + self.configFile);
  }

  self.logger.info('Loading config from ' + configFilePath);
  self.config = require(configFilePath);

  self.config.named.bindIp = '::ffff:' + self.config.named.bindIp;

  if (config.debug === true) {
    self.config.debug = true;
  }

  if (self.config.debug) {
    self.logger.setLevel('debug');
    self.logger.info('debugging enabled');
  }

  self.config.logger = self.logger;

  self.dnsService = new DnsService(self.config);
};

DockerDns.prototype.initializeDockers = function (cb) {
  var self = this;

  async.each(self.config.dockers, function (config, done) {
    config.debug = self.config.debug;
    config.faketld = self.config.faketld;
    config.logger = self.config.logger;

    var dockerInspect = new DockerInspect(config);

    if (dockerInspect) {
      self.dockers.push(dockerInspect);
      done();
    } else {
      self.logger.error("initialization of docker " + config.publicName + " failed");
      done();
    }
  }, cb);
};

DockerDns.prototype.pollDockers = function (cb) {
  var self = this;

  if (self.dockers !== undefined) {
    async.each(self.dockers, function (docker, done) {
      docker.inspectContainers(function (err) {
        if (err) {
          self.logger.error("docker inspect err: " + err);
          done(err);
        } else {
          self.logger.debug("back from inspection, off to build");
          docker.buildRecords(function (err, recs) {
            self.logger.debug("back from build, deliver recs to dns server");
            self.dnsService.newRecords(recs, done);
          });
        }
      });
    }, function (err) {
      if (typeof cb === 'function') {
        cb(err);
      }
    });
  }
};

module.exports = DockerDns;