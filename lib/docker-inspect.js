"use strict";
var DockerOde = require('dockerode');
var async = require('async');
var _ = require('lodash');
var ContainerInspect = require(__dirname + '/../lib/container-inspect.js');

// TODO
/*
 * establish A record(s) for the docker itself
 * 
 */
function DockerInspect(config) {
  var self = this;
  if (self.configure(config)) {
    self.DockerOde = new DockerOde(self.config.dockerOde);
    self.logger.debug(
      self.name,
      "new dockerInspect for docker " + self.config.publicName
    );
  }
}

DockerInspect.prototype.configure = function(config) {
  var self = this;

  if (!config) {
    console.error('BAD no config found! returning');
    return false;
  }

  self.config = config;
  self.debug = self.config.debug;
  self.logger = self.config.logger;
  self.name = self.config.publicName;

  return true;
};

DockerInspect.prototype.buildRecords = function(cb) {
  var self = this;
  self._recs = {
    a : [],
    cname : [],
    srv : []
  };

  // TODO lookup the ip address of docker0
  // create an A record for local fqdn
  if (self.config.publicIp) {
    self._recs.a.push({
      fqdn : self.publicFQDN(),
      ip : self.config.publicIp
    });
  }
  
  async.each(self.containers, function(container, next) {
    container.buildRecords(function(err, recs) {
      self._recs.a = _.union(self._recs.a, recs.a);
      self._recs.cname = _.union(self._recs.cname, recs.cname);
      self._recs.srv = _.union(self._recs.srv, recs.srv);
      self.logger.debug(self.config.publicName, '_.union of records finished');
      next();
    });
  }, function(err) {
    if (err) {
      self.logger.error(err);
    }
    self.logger.info(self.config.publicName,'built records');
    cb(err, self._recs);
  });
};

DockerInspect.prototype.inspectContainers = function(cb) {
  var self = this;
  self.logger.debug(self.name, "getting containers for docker " + self.config.publicName);
  self.containers = [];

  var options = {all : 1};
  self.DockerOde.listContainers(options, function(err, containers) {
    if (containers !== undefined && containers !== null) {
      self.logger.debug(self.name, "inspecting " + containers.length +" containers");

      async.each(containers, function(container, next) {
        var newC = new ContainerInspect(self, container.Id);

        if (newC) {
          newC.gatherInfo(function() {
            self.containers.push(newC);
            next();
          });
        } else {
          self.logger.error(self.name, "container inspection failed for " + container.Id);
          next("container inspection failed for " + container.Id);
        }
      }, cb);
    }
  });
};

// the public fqdn
DockerInspect.prototype.publicFQDN = function(host) {
  return this._actualFQDN(host, this.config.publicName);
};

// usually resolving to an ip associated with docker0 172.17.42.0/16
DockerInspect.prototype.localFQDN = function(host) {
  return this._actualFQDN(host, this.config.localName);
};

DockerInspect.prototype._actualFQDN = function(host, extra) {
  var fqdn = '';

  if (host) {
    fqdn = fqdn + host + '.';
  }

  if (extra) {
    fqdn = fqdn + extra + '.';
  }

  return fqdn + this.config.faketld;
};

module.exports = DockerInspect;