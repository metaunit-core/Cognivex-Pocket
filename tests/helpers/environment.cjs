'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
module.exports = function install(context) {
  const parser = context.URL;
  context.URL = URL;
  const previous = context.location;
  context.location = Object.assign(new URL('https://metaunit-core.github.io/Cognivex-Pocket/'), previous);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/environment.js'), 'utf8'), context);
  context.URL = parser;
  if (!context.PocketEnvironment) throw Error('Mock environment initialization failed');
};
