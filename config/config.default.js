var config = {
  development: true,
  debug: false,
  faketld: "docker",
  pollInterval: 15 * 1000,
  dockers: [{
    publicIp: "10.20.0.100",
    publicName: "public",
    localName: "local",
    dockerOde: {
      socketPath: '/var/run/docker.sock'
    }
  }],
  named: {
    port: 53,
    bindIp: '0.0.0.0'
  }
};
module.exports = config;
