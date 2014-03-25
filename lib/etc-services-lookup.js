'use strict';

var lazy = require("lazy");
var fs = require("fs");

var rxspaces = /\s+/;
var rxcomment = /^#/;
var rxslash = /\//;

var pps = [];

new lazy(fs.createReadStream('/etc/services')).lines.forEach(function(
		line) {
	var fields = line.toString().split(rxspaces);
	if (fields[0] && fields[1] && !rxcomment.test(fields[0])) {
		var service = fields[0];
		var portproto = fields[1];
		var pp = portproto.split(rxslash);
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