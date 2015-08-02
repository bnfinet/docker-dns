"use strict";
var async = require('async');
var named = require('named');
var _ = require('lodash');
var Logger = require('./logger.js');

function DnsService(config) {
  var self = this;
  
  self._recs = {};
  self.config = config;
  self.logger = new Logger();
  self.logger.setPrepend('DS');
  self.server = named.createServer();
  self._registerEvents();
}

DnsService.prototype.findMatchingSRVRecords = function (domain, cb) {
  var self = this;

  var ret = [];
  // return the common case immediately
  if (self._recs.srv[domain]) {
    self.logger.debug("found domain " + domain);
    cb(null, self._recs.srv[domain]);
  } else {
    // otherwise search for it
    var rx = self.domainToRegex(domain);

    async.each(Object.keys(self._recs.srv), function (d, done) {
      if (d.match(rx)) {
        self.logger.debug("match:", d);
        ret = _.union(ret, self._recs.srv[d]);
      }
      done();
    }, function(err) {
      // consolidate the results to one target
      ret = _.uniq(ret, 'target');
      cb(err, ret);
    });
  }
};

DnsService.prototype.domainToRegex = function (domain) {
  domain = domain.replace(/\*/g, ".*");
  return new RegExp(domain);
};

DnsService.prototype._transformRecords = function (recs, cb) {
  var self = this;
  
  async.parallel(
    [
      function(done) {
        self._buildARecords(recs, done);
      },
      function(done) {
        self._buildAAAARecords(recs, done);
      },
      function(done) {
        self._buildCNAMErecords(recs, done);
      },
      function(done) {
        self._buildSRVRecords(recs, done);
      }
    ]
  , cb);
};

DnsService.prototype._buildARecords = function (recs, cb) {
  var self = this;
  self._recs.a = {};
  
  async.each(recs.a, function(a, done) {
    self._recs.a[a.fqdn] = new named.ARecord(a.ip);
    done();
  }, cb);
};

DnsService.prototype._buildAAAARecords = function (recs, cb) {
  var self = this;
  self._recs.aaaa = {};
  
  async.each(recs.a, function(a, done) {
    self._recs.aaaa[a.fqdn] = new named.AAAARecord('::ffff:' + a.ip);
    done();
  }, cb);

};

DnsService.prototype._buildCNAMErecords = function (recs, cb) {
  var self = this;
  self._recs.cname = {};
  
  async.each(recs.cname, function(cname, done) {
    self._recs.cname[cname.fqdn] = new named.CNAMERecord(cname.a);
    done();
  }, cb);
};

DnsService.prototype._buildSRVRecords = function (recs, cb) {
  var self = this;
  self._recs.srv = {};
  
  async.each(recs.srv, function(srv, done) {
    self.logger.debug("service name: ", srv.name);
  
    // TODO add weight and priority
    if (!self._recs.srv[srv.fqdn]) {
      self._recs.srv[srv.fqdn] = [];
    }
  
    self._recs.srv[srv.fqdn].push(new named.SRVRecord(srv.name, srv.port));
    done();
  }, cb);
};

DnsService.prototype.startService = function (config, cb) {
  var self = this;

  self._recs.soa = new named.SOARecord(config.faketld, {
    ttl : 10
  });

  self.server.listen(config.named.port, config.named.bindIp, function() {
    self.logger.info('listening for dns queries on', config.named.bindIp, config.named.port);
  });

  if (typeof cb === 'function') {
    cb();
  }
};

DnsService.prototype.newRecords = function(recs, cb) {
  var self = this;
  self.logger.info("loading new dns records");
  self._transformRecords(recs, cb);
};

DnsService.prototype._registerEvents = function () {
  var self = this;
  
  self.server.on('query', function(query) {
    var domain = query.name();

    if (!domain.match(/[A-Za-z0-9\.\*-_]*/)) {
      self.logger.error('bad query',domain);
      self.server.send(query);
      return;
    }

    var type = query.type();
    self.logger.info('DNS Query:', type, domain);

    switch (type) {
      case 'A':
        if (self._recs.a[domain]) {
          query.addAnswer(domain, self._recs.a[domain]);
        } else if (self._recs.cname[domain]) {
          query.addAnswer(domain, self._recs.cname[domain]);
          self.logger.debug('cname a: ', self._recs.cname[domain].target,
            self._recs.a[self._recs.cname[domain].target]);
          query.addAnswer(self._recs.cname[domain].target,
            self._recs.a[self._recs.cname[domain].target]);
        }

        self.server.send(query);
        break;
      case 'AAAA':
        if (self._recs.aaaa[domain]) {
          query.addAnswer(domain, self._recs.aaaa[domain]);
        } else if (self._recs.cname[domain]) {
          query.addAnswer(domain, self._recs.cname[domain]);

          self.logger.debug(
            'cname aaaa: ',
            self._recs.cname[domain].target,
            self._recs.aaaa[self._recs.cname[domain].target]
          );

          query.addAnswer(
            self._recs.cname[domain].target,
            self._recs.aaaa[self._recs.cname[domain].target]
          );
        }
        self.server.send(query);
        break;
      case 'CNAME':
        query.addAnswer(domain, self._recs.cname[domain]);
        self.logger.debug('cname a + aaaa: ', self._recs.cname[domain].target,
          self._recs.a[self._recs.cname[domain].target]);
        query.addAnswer(self._recs.cname[domain].target,
          self._recs.a[self._recs.cname[domain].target]);
        query.addAnswer(self._recs.cname[domain].target,
          self._recs.aaaa[self._recs.cname[domain].target]);
        self.server.send(query);
        break;
      case 'SOA':
        query.addAnswer(domain, self._recs.soa);
        self.server.send(query);
        break;
      case 'SRV':
        console.log(self._recs.srv[domain]);

        self.findMatchingSRVRecords(domain, function(err, recs) {
          async.each(recs, function(rec, done) {
            self.logger.debug("srv match:", rec);
            query.addAnswer(domain, rec);
            done();
          }, function() {
            self.server.send(query);
          });
        });
        break;
      // case 'TXT':
      // var record = new named.TXTRecord('hello world');
      // query.addAnswer(domain, record, 'TXT');
      // break;
      default:
        self.server.send(query);
    }
  });

  self.server.on('clientError', function(error) {
    self.logger.error("there was a clientError: ", error);
  });

  self.server.on('uncaughtException', function(error) {
    self.logger.error("there was an exception: ", error.message);
  });
};

module.exports = DnsService;