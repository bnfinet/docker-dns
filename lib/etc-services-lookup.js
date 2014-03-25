'use strict';

var lazy = require("lazy");
var fs = require("fs");

var rxspaces = /\s+/;
var rxcomment = /^#/;
var rxslash = /\//;

var pps = [];

// format of /etc/services is
// ssh  22/tcp
// dns  53/udp
// www	80/tcp 
//
// parse it to beome
// [ '22/tcp' : {
//     service: 'ssh',
//     port:    '22',
//     proto:   'tcp',
//     portproto: '22/tcp' }]
//
new lazy(fs.createReadStream('/etc/services')).lines.forEach(function(
		line) {
	var fields = line.toString().split(rxspaces);
	// must exist, weed out comments
	if (fields[0] && fields[1] && !rxcomment.test(fields[0])) {
		var service = fields[0];
		var portpproto = fields[1];
		var pp = portpproto.split(rxslash);
		var port = pp[0];
		var proto = pp[1];

		pps[portproto] = {
				service: service,
				port: 	port,
				proto: proto,
				portproto: portproto
		};
	}
});


module.exports = {
		getService: function(portproto) {
			return pps[portproto];
		}
}