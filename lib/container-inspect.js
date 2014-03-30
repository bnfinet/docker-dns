"use strict";
var async = require('async');
var _ = require('lodash');
var esl = require(__dirname + '/etc-services-lookup.js');

function Cinspect(docker, cid) {
	var self = this;
	if (!self.configure(docker.config)) {
		return;
	}
	self.docker = docker;
	self.uuid = cid;
	self.uuid12 = self.uuid.substring(0, 12);
	self.cont = docker.D.getContainer(self.uuid);

	if (self.debug) {
		self
				.log(self.uuid12, "new containter object with uuid12:",
						self.uuid12);
	}
}

module.exports = Cinspect;

var proto = Cinspect.prototype;

proto.configure = function(c) {
	var self = this;
	self.config = c;
	if (!c) {
		console.log('no config found! returning');
		return false;
	}
	self.debug = self.config.debug;
	self._recs = {
		a : [],
		cname : [],
		srv : []
	};

	self.log = self.config.logger;
	return true;
};

proto.gatherInfo = function(cb) {
	var self = this;
	// console.log(c);
	self.cont.inspect(function(err, insp) {
		if (err) {
			console.log(err);
			return cb();
		}
		self.insp = insp;
		self.getIps();
		self.getImgName();
		if (self.debug) {
			self.log(self.uuid12, 'imgname:', self.imgname);
		}

		self.hostname = insp.Config.Hostname;
		if (self.debug) {
			self.log(self.uuid12, 'hostname:', self.hostname);
		}

		self.services = [];

		// discover services and their port bindings
		var iHPb = self.insp.HostConfig.PortBindings;
		if (!iHPb) {
			if (self.debug) {
				self.log(self.uuid12, "no portbindings found");
				console.log(insp);
			}
			cb();
		} else {
			async.each(Object.keys(iHPb), function(portproto, done) {
				if (portproto && iHPb[portproto]) {
					if (self.debug) {
						self.log(self.uuid12, 'ports: ', iHPb[portproto]);
					}
					var lookup = esl.getService(portproto);
					if (!lookup) {
						self.log(self.uuid12,
								'could not find service name for port',
								portproto, 'on', self.uuid12);
					} else {
						self.services.push({
							port : iHPb[portproto][0].HostPort,
							portproto : portproto,
							lookup : lookup
						});
					}
				}
				done();
			}, function() {
				if (self.debug) {
					self.log(self.uuid12, "services: ", self.services);
				}
				cb();

			});
		}

	});
};

proto.buildRecords = function(cb) {
	var self = this;
	// console.log(c);
	// see documentation for lodash's _.bind:
	// http://lodash.com/docs#bind

	async.parallel([
			function(done) {
				if (self.ips.internal) {
					self._buildRecords(_.bind(self.docker.localfqdn,
							self.docker), self.ips.internal, function() {
						if (self.debug) {
							self.log(self.uuid12, "built records for local ip",
									self.ips.internal);
						}
						done();
					});
				}
			},
			function(done) {
				if (self.ips.exposed) {
					self._buildRecords(_.bind(self.docker.publicfqdn,
							self.docker), self.ips.exposed, function() {
						if (self.debug) {
							self.log(self.uuid12,
									"built records for exposed ip",
									self.ips.exposed);
						}
						done();
					});
				}

			} ], function(err) {
		cb(err, self._recs);
	});

};

proto._buildRecords = function(fqdnFn, ip, cb) {
	var self = this;
	if (self.debug) {
		self.log(self.uuid12, "starting _buildRecords");
	}

	// A UUID -> ip
	self._recs.a.push({
		fqdn : fqdnFn(self.uuid),
		ip : ip
	});

	// A first12(UUID) -> ip
	self._recs.a.push({
		fqdn : fqdnFn(self.uuid12),
		ip : ip
	});

	// CNAME hostname -> first12(UUID)
	if (self.hostname) {
		self._recs.cname.push({
			fqdn : fqdnFn(self.hostname),
			a : fqdnFn(self.uuid12)
		});
	}

	// CNAME imgname -> first12(UUID)
	if (self.imgname) {
		self._recs.cname.push({
			fqdn : fqdnFn(self.imgname),
			a : fqdnFn(self.uuid12)
		});
	}

	async.each(self.services, function(service, done) {
		self.putsrvrec(service, self.uuid12, fqdnFn);
		// SRV record _service._proto.hostname.faketld port
		// first12.faketld
		if (self.hostname) {
			self.putsrvrec(service, self.hostname, fqdnFn);
			self.putsrvrecForServiceName(service, self.hostname, fqdnFn);
		}
		if (self.imgname) {
			self.putsrvrec(service, self.imgname, fqdnFn);
			self.putsrvrecForServiceName(service, self.imgname, fqdnFn);
		}
		done();
	}, function(err) {
		if (self.debug) {
			self.log(self.uuid12, "calling back from _buildRecord");
			// self.log(self._recs);
		}
		cb(err);
	});
};

var rxdotsorslashorcolon = /\.|\/|:/g;
proto.getImgName = function() {
	this.imgname = this.insp.Name.replace(rxdotsorslashorcolon, "");
};

proto.putsrvrecForServiceName = function(service, name, fqdnFn) {
	var self = this;
	// add a traditional host specific RFC compliant SRV record
	if (service && service.lookup && service.lookup.name) {
		var srvname = '_' + service.lookup.name + '._' + service.lookup.proto + '.'
				+ name;
		self.putsrvrec(service, srvname, fqdnFn);
	}
};

proto.putsrvrec = function(service, name, fqdnFn) {
	var self = this;
	// and do a 'skydns' style service record generalized for the host
	if (!self._recs.srv[fqdnFn(name)]) {
		self._recs.srv[fqdnFn(name)] = [];
	}
	var newrec = {
		fqdn : fqdnFn(name),
		port : parseInt(service.port),
		name : fqdnFn(self.uuid12)
	};
	self.log('newrec', name, newrec);
	self._recs.srv.push(newrec);
};

proto.getIps = function() {
	var self = this;
	var ips = {
		internal : self.insp.NetworkSettings.IPAddress,
		exposed : null
	};
	if (self.insp.HostConfig.PortBindings
			&& Object.keys(self.insp.HostConfig.PortBindings).length > 0) {
		var hostboundip = self.insp.HostConfig.PortBindings[Object
				.keys(self.insp.HostConfig.PortBindings)[0]][0].HostIp;
		// console.log('getip ip: ', ip);
		if (hostboundip === '0.0.0.0') {
			ips.exposed = self.config.publicip;
		} else if (hostboundip !== ips.internal) {
			ips.exposed = hostboundip;
		}
	}
	self.ips = ips;
	if (self.debug) {
		self.log("ip ", self.ips);
	}
};
