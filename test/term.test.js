'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const term = require('../lib/term');

test('term is plain without TTY or NO_COLOR', function () {
  term.setNoColor(true);
  assert.equal(term.red('FAIL'), 'FAIL');
  assert.equal(term.quote('orderId'), '"orderId"');
  term.setNoColor(false);
});
