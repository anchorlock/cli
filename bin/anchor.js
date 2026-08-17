#!/usr/bin/env node
'use strict';

const { runCli } = require('../lib/cli');

runCli(process.argv)
  .then(function (code) {
    if (typeof code === 'number' && code !== 0) process.exit(code);
  })
  .catch(function (err) {
    const msg = err && err.message ? err.message : String(err);
    process.stderr.write('\nanchor  ' + msg + '\n');
    process.stderr.write('hint: anchor --help\n');
    process.exit(1);
  });
