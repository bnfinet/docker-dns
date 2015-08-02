function Logger() {
  var self = this;

  self.prepend = '';
  self.level = 'info';
}

// make the logging a little easier on the eyes
Logger.prototype._log = function (logFn, args, type) {
  var self = this;

  if (self.prepend) {
    Array.prototype.unshift.call(args, '[' + self.prepend + ']', type);
  }

  logFn.apply(console, args);
};

Logger.prototype.setLevel = function (level) {
  var self = this;
  self.level = level;
};

Logger.prototype.setPrepend = function (prepend) {
  var self = this;
  self.prepend = prepend;
};


Logger.prototype.debug = function () {
  var self = this;

  if (self.level === 'debug') {
    self._log(console.log, arguments, 'debug');
  }
};

Logger.prototype.info = function () {
  var self = this;

  if (self.level === 'info'
      || self.level === 'debug'
  ) {
    self._log(console.log, arguments, 'info');
  }
};

Logger.prototype.warn = function () {
  var self = this;

  if (self.level === 'info'
      || self.level === 'debug'
      || self.level === 'warn'
  ) {
    self._log(console.error, arguments, 'warn');
  }
};

Logger.prototype.error = function () {
  self._log(console.error, arguments, 'error');
};

module.exports = Logger;

