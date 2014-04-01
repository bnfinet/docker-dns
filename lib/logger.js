




// make the logging a little easier on the eyes
var log = function (logFn, args, type) {
	if (logger.prepend) {
		Array.prototype.unshift.call(args, '[' + logger.prepend + ']',type);
	}
	logFn.apply(console, args);
};

var debug = function() {
	if (logger.level === 'debug') {
		log(console.log, arguments, 'debug');
	}
};

var info = function() {
	if (logger.level === 'info' || logger.level === 'debug') {
		log(console.log, arguments, 'info');
	}
};

var warn = function() {
	if (logger.level === 'info' || logger.level === 'debug' || logger.level === 'warn') {
		log(console.error, arguments, 'warn');
	}
};

var error = function() {
	log(console.error, arguments, 'error');
};

var logger;
module.exports = logger = {
		debug: debug,
		info: info,	
		warn: warn,
		error: error,
		prepend: '',
		level: 'info'
};

