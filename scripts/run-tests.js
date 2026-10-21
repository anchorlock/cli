'use strict';

// 不依赖 shell 展开通配符：Windows cmd 与各 Node 版本行为一致
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = path.join(__dirname, '..', 'test');
const files = fs
  .readdirSync(dir)
  .filter(function (f) {
    return f.endsWith('.test.js');
  })
  .sort()
  .map(function (f) {
    return path.join(dir, f);
  });

const r = spawnSync(process.execPath, ['--test'].concat(files), { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
