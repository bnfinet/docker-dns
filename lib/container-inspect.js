"use strict";
var async = require('async');
var _ = require('lodash');
var esl = require(__dirname + '/etc-services-lookup.js');

function ContainerInspect(docker, cid) {
	var self = this;

	if (!self.configure(docker.config)) {
		return;
	}
	
	self.docker = docker;
	self.uuid = cid;
	self.uuid12 = self.uuid.substring(0, 12);

	/**
	 * @var Container
	 */
	self.cont = docker.DockerOde.getContainer(self.uuid);
	self.logger.debug(self.uuid12, "new containter object with uuid12:", self.uuid12);
}

ContainerInspect.prototype.configure = function(c) {
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

	self.logger = self.config.logger;
	return true;
};

ContainerInspect.prototype.gatherInfo = function(cb) {
	var self = this;
	// console.log(c);
	self.cont.inspect(function(err, insp) {
		if (err) {
			self.logger.error(err);
			return cb();
		}
		
		self.insp = insp;
		self.getIps();
		self.getImgName();
		self.logger.debug(self.uuid12, 'imgname:', self.imgname);

		self.hostname = insp.Config.Hostname;
		self.logger.debug(self.uuid12, 'hostname:', self.hostname);
		self.services = [];

		
		// discover services and their port bindings
		var iHPb = self.insp.NetworkSettings.Ports;
		
		if (!iHPb) {
			self.logger.debug(self.uuid12, "no portbindings found");
//			console.log(insp);
			cb();
		} else {
			async.each(Object.keys(iHPb), function(portWithProtocol, done) {
				if (portWithProtocol && iHPb[portWithProtocol]) {
					self.logger.debug(self.uuid12, 'ports: ', portWithProtocol, iHPb[portWithProtocol]);
					var lookup = esl.getService(portWithProtocol);

					if (!lookup) {
						self.logger.warn(self.uuid12, 'could not find service name for ', portWithProtocol, 'on', self.uuid12);
					} else {
						self.services.push({
							port : iHPb[portWithProtocol][0].HostPort,
							boundIp:	iHPb[portWithProtocol][0].HostIp,
							portWithProtocol : portWithProtocol,
							lookup : lookup
						});
					}
				}
				done();
			}, function() {
				self.logger.debug(self.uuid12, "services: ", self.services);
				cb();
			});
		}

	});
};

ContainerInspect.prototype.buildRecords = function(cb) {
	var self = this;

	async.parallel([
			function(done) {
				// TODO for internal ips, SRV records should show the non
				// public side port
				self._buildAnCNAMERecords(self.ips.internal, self.docker.localFQDN, function() {
					self.logger.debug(self.uuid12, "done with A and CNAME records for local ip",
								self.ips.internal);
					done();
				});
			},
			function(done) {
				self._buildAnCNAMERecords(self.ips.exposed, self.docker.publicFQDN, function() {
						self.logger.debug(self.uuid12,
								"done with A and CNAME records for exposed ip",
								self.ips.exposed);
					done();
				});
			},
			function(done) {
				self._buildSRVRecords(function() {
					self.logger.debug(self.uuid12,	"done with SRVrecords");
					done();
				});
			}], 
			function(err) {
				self.logger.debug(self.uuid12, 'all records built, calling back');
				cb(err, self._recs);
			}
	);

};

ContainerInspect.prototype._buildAnCNAMERecords = function(ip, fqdnFnRaw, cb) {
	var self = this;
	self.logger.debug(self.uuid12, "starting _buildAnCNAMERecords");
	if (!ip) {
		self.logger.debug(self.uuid12, "no ip, calling back");
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

ContainerInspect.prototype.getImgName = function() {
	this.imgname = this.insp.Name.replace(/\.|\/|:/g, '');
};


ContainerInspect.prototype._buildSRVRecords = function(cb) {
	var self = this;
	if (self.services.length === 0) {
		self.logger.debug(self.uuid12, 'no service records');
		return cb();
	} 
	async.each(self.services, function(service, done) {
		if (service.port && service.boundIp) {
			async.each(["", self.uuid12, self.hostname, self.imgname], function(name, next) {
				if (typeof name !== 'undefined') {
					self.putSrvRec(service, name);
					self.putSrvRecForServiceName(service, name);
				}
				next();
			}, done);
		} else {
			self.logger.debug("service port or bound ip missing: ", service);
			done();
		}
	}, function(err) {
		self.logger.debug(self.uuid12, "calling back from _buildSRVRecords");
		// self.logger(self._recs);
		cb(err);
	});
};


//anatomy of a self.service object:
//{   port: '49160',
//		  boundip: '0.0.0.0',
//portproto: '22/tcp',
//lookup: { name: 'ssh', port: 22, proto: 'tcp', portproto: '22/tcp' } } 

ContainerInspect.prototype.putSrvRecForServiceName = function(service, name) {
	var self = this;
	// add a traditional host specific RFC compliant SRV record
	// SRV name -> _srv._proto.fqdn -> (port, fqdn)
	if (service 
			&& service.lookup 
			&& service.lookup.name
	) {
		var srvName = '_' 
			+ service.lookup.name 
			+ '._' + service.lookup.protocol
			+ '.' + name;
		
		self.putSrvRec(service, srvName);
	}
};

ContainerInspect.prototype.putSrvRec = function(service, name) {
	var self = this;
	
	// do one record for the inside with inside port
	if (!self._recs.srv[self.docker.localFQDN(name)]) {
		self._recs.srv[self.docker.localFQDN(name)] = [];
	}
	
	self._recs.srv.push({
		fqdn : self.docker.localFQDN(name),
		port : parseInt(service.lookup.port),
		name : self.docker.localFQDN(self.uuid12)
	});

	// do one record for the outside with outside port
	if (!self._recs.srv[self.docker.publicFQDN(name)]) {
		self._recs.srv[self.docker.publicFQDN(name)] = [];
	}
	
	self._recs.srv.push({
		fqdn : self.docker.publicFQDN(name),
		port : parseInt(service.port),
		name : self.docker.publicFQDN(self.uuid12)
	});
};

ContainerInspect.prototype.getIps = function() {
	var self = this;
	var ips = {
		internal : self.insp.NetworkSettings.IPAddress,
		exposed : null
	};
	
	try {
		var iHp = self.insp.NetworkSettings.Ports;
		self.logger.debug("iHp", iHp);

		if (iHp
				&& Object.keys(iHp).length > 0
				&& iHp[Object.keys(iHp)[0]]
				&& iHp[Object.keys(iHp)[0]]
				&& iHp[Object.keys(iHp)[0]][0]
				&& iHp[Object.keys(iHp)[0]][0].HostIp
		) {
			var hostBoundIp = iHp[Object.keys(iHp)[0]][0].HostIp;

			self.logger.debug('getip ip: ', hostBoundIp);

			if (hostBoundIp === '0.0.0.0') {
				ips.exposed = self.config.publicIp;
			} else if (hostBoundIp !== ips.internal) {
				ips.exposed = hostBoundIp;
			}
		}
	} catch (err) {
		self.logger.error('port binding public ip lookup failed', err);
	}

	self.ips = ips;
	self.logger.debug("ips ", self.ips);
};

module.exports = ContainerInspect;