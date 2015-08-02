var config = {};

config.development = true;
config.debug = false;
config.faketld = "docker";
config.pollInterval = 17 * 1000;

config.dockers  = [{
	publicIp: "10.20.0.100",
	publicName: "public",
	localName: "local",
	dockerOde: {
		socketPath: '/var/run/docker.sock'
	}
}];

config.named = {
    port: 53,
    bindIp: '0.0.0.0'
};

module.exports = config;
