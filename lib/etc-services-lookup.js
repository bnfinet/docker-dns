'use strict';

var lazy = require('lazy');
var fs = require('fs');

var regexSpaces = /\s+/;
var regexComment = /^#/;
var regexSlash = /\//;

var portsWithProtocol = [];

// format of /etc/services is
// ssh 22/tcp
// dns 53/udp
// www 80/tcp
//
// parse it to become
// [ '22/tcp' : {
// service: 'ssh',
// port: '22',
// proto: 'tcp',
// portproto: '22/tcp' }]
//
new lazy(fs.createReadStream(__dirname + '/../config/etc-services')).lines
  .forEach(function (line) {
    var service = line.toString().split(regexSpaces);

    // must exist, weed out comments
    if (service[0] && service[1] && !regexComment.test(service[0])) {
      var portWithProtocol = service[1];
      var pp = portWithProtocol.split(regexSlash);

      portsWithProtocol[portWithProtocol] = {
        name: service[0],
        portWithProtocol: portWithProtocol,
        port: parseInt(pp[0], 10),
        protocol: pp[1]
      };
    }
  });

module.exports = {
  getService: function(portWithProtocol) {
    return portsWithProtocol[portWithProtocol];
  }
};