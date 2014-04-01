var config = {};

config.debug = true;
config.development = true;

config.faketld = "docker.bnf";

config.pollinterval = 17 * 1000;

config.dockers = [ {
	publicip : "172.16.4.130",
	publicname : "frank",
	localname : "local.frank",
	dockerode : {
		socketPath : '/var/run/docker.sock'
	}
} ];


config.node_named = {
	port : 53,
	bindip : '0.0.0.0'
};

module.exports = config;