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

	self.log.debug(self.uuid12, "new containter object with uuid12:", self.uuid12);
}

module.exports = Cinspect;

var proto = Cinspect.prototype;

proto.configure = function(c) {
	var self = this;
	self.config = c;
	if (!c) {
		console.log('BAD no config found! returning');
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
			self.log.error(err);
			return cb();
		}
		self.insp = insp;
		self.getIps();
		self.getImgName();
		self.log.debug(self.uuid12, 'imgname:', self.imgname);

		self.hostname = insp.Config.Hostname;
		self.log.debug(self.uuid12, 'hostname:', self.hostname);

		self.services = [];

		// discover services and their port bindings
		var iHPb = self.insp.HostConfig.PortBindings;
		if (!iHPb) {
			self.log.debug(self.uuid12, "no portbindings found");
//			console.log(insp);
			cb();
		} else {
			async.each(Object.keys(iHPb), function(portproto, done) {
				if (portproto && iHPb[portproto]) {
					self.log.debug(self.uuid12, 'ports: ', portproto, iHPb[portproto]);
					var lookup = esl.getService(portproto);
					if (!lookup) {
						self.log.warn(self.uuid12,
								'could not find service name for ', portproto,
								'on', self.uuid12);
					} else {
						self.services.push({
							port : iHPb[portproto][0].HostPort,
							boundip:	iHPb[portproto][0].HostIp,
							portproto : portproto,
							lookup : lookup
						});
					}
				}
				done();
			}, function() {
				self.log.debug(self.uuid12, "services: ", self.services);
				cb();

			});
		}

	});
};

proto.buildRecords = function(cb) {
	var self = this;

	async.parallel([
			function(done) {
				// TODO for internal ips, SRV records should show the non
				// public side port
				self._buildAnCNAMERecords(self.ips.internal, self.docker.localfqdn, function() {
					self.log.debug(self.uuid12, "done with A and CNAME records for local ip",
								self.ips.internal);
					done();
				});
			},
			function(done) {
				self._buildAnCNAMERecords(self.ips.exposed, self.docker.publicfqdn, function() {
						self.log.debug(self.uuid12,
								"done with A and CNAME records for exposed ip",
								self.ips.exposed);
					done();
				});
			},
			function(done) {
				self._buildSRVRecords(function() {
					self.log.debug(self.uuid12,	"done with SRVrecords");
					done();
				});
			}], 
			function(err) {
				self.log.debug(self.uuid12, 'all records built, calling back');
				cb(err, self._recs);
			}
	);

};

proto._buildAnCNAMERecords = function(ip, fqdnFnRaw, cb) {
	var self = this;
	self.log.debug(self.uuid12, "starting _buildAnCNAMERecords");
	if (!ip) {
		self.log.debug(self.uuid12, "no ip, calling back");
		return cb();
	}

	// bind the passed function to the proper namespace
	var fqdnFn = _.bind(fqdnFnRaw, self.docker);
	
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
	
	cb();
};

var rxdotsorslashorcolon = /\.|\/|:/g;
proto.getImgName = function() {
	this.imgname = this.insp.Name.replace(rxdotsorslashorcolon, "");
};


proto._buildSRVRecords = function(cb) {
	var self = this;
	if (self.services.length === 0) {
		self.log.debug(self.uuid12, 'no service records');
		return cb();
	} 
	async.each(self.services, function(service, done) {
		async.each(["", self.uuid12, self.hostname, self.imgname], function(name, next) {
			if (typeof name !== 'undefined') {
				self.putsrvrec(service, name);
				self.putsrvrecForServiceName(service, name);
			};
			next();
		}, done);
	}, function(err) {
		self.log.debug(self.uuid12, "calling back from _buildSRVRecords");
		// self.log(self._recs);
		cb(err);
	});
};


//anatomy of a self.service object:
//{   port: '49160',
//		  boundip: '0.0.0.0',
//portproto: '22/tcp',
//lookup: { name: 'ssh', port: 22, proto: 'tcp', portproto: '22/tcp' } } 

proto.putsrvrecForServiceName = function(service, name) {
	var self = this;
	// add a traditional host specific RFC compliant SRV record
	// SRV name -> _srv._proto.fqdn -> (port, fqdn)
	if (service && service.lookup && service.lookup.name) {
		var srvname = '_' + service.lookup.name + '._' + service.lookup.proto
				+ '.' + name;
		self.putsrvrec(service, srvname);
	}
};

proto.putsrvrec = function(service, name) {
	var self = this;

	// do one record for the inside with inside port
	if (!self._recs.srv[self.docker.localfqdn(name)]) {
		self._recs.srv[self.docker.localfqdn(name)] = [];
	}
	self._recs.srv.push({
		fqdn : self.docker.localfqdn(name),
		port : parseInt(service.lookup.port),
		name : self.docker.localfqdn(self.uuid12)
	});

	// do one record for the outside with outside port
	if (!self._recs.srv[self.docker.publicfqdn(name)]) {
		self._recs.srv[self.docker.publicfqdn(name)] = [];
	}
	self._recs.srv.push({
		fqdn : self.docker.publicfqdn(name),
		port : parseInt(service.port),
		name : self.docker.publicfqdn(self.uuid12)
	});
};

proto.getIps = function() {
	var self = this;
	var ips = {
		internal : self.insp.NetworkSettings.IPAddress,
		exposed : null
	};
	if (self.insp.HostConfig.PortBindings
		&& Object.keys(self.insp.HostConfig.PortBindings).length > 0
		&& self.insp.HostConfig.PortBindings[Object.keys(self.insp.HostConfig.PortBindings)[0]]
		&& self.insp.HostConfig.PortBindings[Object.keys(self.insp.HostConfig.PortBindings)[0]][0]
		&& self.insp.HostConfig.PortBindings[Object.keys(self.insp.HostConfig.PortBindings)[0]][0].HostIp
	) {
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
	self.log.debug("ip ", self.ips);
};
