'use strict';

const path = require('path');

function loadEngine() {
  const tried = [];
  const candidates = [
    path.resolve(__dirname, '../../anchorlock-core'),
    '@anchorlock/core',
    path.resolve(__dirname, '../../spec-forge'),
    '@keelforge/spec-forge',
  ];
  for (let i = 0; i < candidates.length; i++) {
    const id = candidates[i];
    try {
      const spec = require(id);
      if (
        spec &&
        typeof spec.checkNames === 'function' &&
        typeof spec.draftIds === 'function' &&
        typeof spec.writeConstraintsFromOpenApi === 'function' &&
        typeof spec.draftConstraintsFromCode === 'function' &&
        typeof spec.writePin === 'function'
      ) {
        return spec;
      }
      tried.push(id + ' (missing checkNames/draftIds/writeConstraintsFromOpenApi; need >= 0.5.17)');
    } catch (e) {
      tried.push(id + ' (' + (e && e.code ? e.code : e.message) + ')');
    }
  }
  throw new Error(
    'Anchorlock needs @anchorlock/core or @keelforge/spec-forge >= 0.5.19 (checkNames / pin / constraints).\n  tried: ' +
      tried.join('\n  tried: '),
  );
}

module.exports = { loadEngine };
