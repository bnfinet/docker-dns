"use strict";
var DockerOde = require('dockerode');
var async = require('async');
var _ = require('lodash');
var Cinspect = require(__dirname + '/../lib/container-inspect.js');

// TODO
/*
 * establish A record(s) for the docker itself
 * 
 */

function Dinspect(config) {
	var self = this;
	if (self.configure(config)) {
		self.D = new DockerOde(self.config.dockerode);
		self.log.debug(self.name, "new Dinspect for docker "
				+ self.config.publicname);
	}
}

module.exports = Dinspect;

var proto = Dinspect.prototype;

proto.configure = function(c) {
	var self = this;
	if (!c) {
		console.error('BAD no config found! returning');
		return false;
	}
	self.config = c;
	self.debug = self.config.debug;
	self.log = self.config.logger;
	self.name = self.config.publicname;
	return true;
};

proto.buildRecords = function(cb) {
	var self = this;
	self._recs = {
		a : [],
		cname : [],
		srv : []
	};
	// TODO lookup the ip address of docker0
	// create an A record for locafqdn

	if (self.config.publicip) {
		self._recs.a.push({
			fqdn : self.publicfqdn(),
			ip : self.config.publicip
		});
	}
	
	async.each(self.containers, function(container, next) {
		container.buildRecords(function(err, recs) {
			self._recs.a = _.union(self._recs.a, recs.a);
			self._recs.cname = _.union(self._recs.cname, recs.cname);
			self._recs.srv = _.union(self._recs.srv, recs.srv);
			self.log.debug(self.config.publicname, '_.union of records finished');
			next();
		});
	}, function(err) {
		if (err) {
			self.log.error(err);
		}
		self.log.info(self.config.publicname,'built records');
		cb(err, self._recs);
	});
};

proto.inspectContainers = function(cb) {
	var self = this;
	self.log.debug(self.name, "getting containers for docker " + self.config.publicname);
	self.containers = [];
	self.D.listContainers({	all : 1	}, function(err, containers) {
		self.log.debug(self.name, "inspecting " + containers.length +" containers");
		async.each(containers, function(container, next) {
			var newC = new Cinspect(self, container.Id);
			if (newC) {
				newC.gatherInfo(function() {
					self.containers.push(newC);
					next();
				});
			} else {
				self.log.error(self.name, "container inspection failed for " + container.Id);
				next("container inspection failed for " + container.Id);
			}
		}, cb);
	});
};

// the public fqdn
proto.publicfqdn = function(host) {
	return this._actualfqdn(host, this.config.publicname);
};

// usually resolving to an ip associated with docker0 172.17.42.0/16
proto.localfqdn = function(host) {
	return this._actualfqdn(host, this.config.localname);
};

proto._actualfqdn = function(host, extra) {
	var ret = '';
	if (host) {
		ret = ret + host + '.';
	}
	if (extra) {
		ret = ret + extra + '.';
	}
	ret = ret + this.config.faketld;
	return ret;
};
