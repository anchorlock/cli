'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  parseArgs,
  formatIssue,
  formatDraftText,
  identRole,
  urlForNextTag,
} = require('../lib/cli');
const term = require('../lib/term');

const BIN = path.join(__dirname, '..', 'bin', 'anchor.js');

function run(args, cwd) {
  return spawnSync(process.execPath, [BIN].concat(args), {
    encoding: 'utf8',
    cwd: cwd || path.join(__dirname, '..'),
  });
}

test('parseArgs reads check flags', function () {
  const a = parseArgs(['node', 'anchor', 'check', '--contract', 'a.txt', '--src', 'src', '--json']);
  assert.equal(a._[0], 'check');
  assert.equal(a.contract, 'a.txt');
  assert.equal(a.src, 'src');
  assert.equal(a.format, 'json');
});

test('parseArgs reads constraints --from and -o', function () {
  const a = parseArgs(['node', 'anchor', 'constraints', '--from', 'openapi.json', '-o', 'constraints.json']);
  assert.equal(a._[0], 'constraints');
  assert.equal(a.from, 'openapi.json');
  assert.equal(a.out, 'constraints.json');
});

test('parseArgs reads hash pin flags', function () {
  const a = parseArgs([
    'node',
    'anchor',
    'check',
    '--contract',
    'https://example.com/openapi.json',
    '--src',
    'src',
    '--hash',
    'sha256:' + 'a'.repeat(64),
    '--require-hash',
  ]);
  assert.equal(a.hash.slice(0, 7), 'sha256:');
  assert.equal(a.requireHash, true);
});

test('identRole treats calls and function assignments as non-fields', function () {
  const call = 'encodeURIComponent(orderSn)';
  assert.equal(identRole(call, 'encodeURIComponent'.length), 'call');
  const decl = 'function lookupMine(orderSn) {}';
  assert.equal(identRole(decl, 'function lookupMine'.length), 'call');
  const assigned = 'const fetchOrder = async () => 1';
  assert.equal(identRole(assigned, 'const fetchOrder'.length), 'fn');
  const field = 'const customerName = 1';
  assert.equal(identRole(field, 'const customerName'.length), 'value');
  const generic = 'lookupMine<Order>(id)';
  assert.equal(identRole(generic, 'lookupMine'.length), 'call');
});

test('help lists only the wedge commands', function () {
  const r = run(['--help']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /anchor pin --from/);
  assert.match(r.stdout, /anchor check --contract/);
  assert.match(r.stdout, /anchor constraints --from/);
  assert.match(r.stdout, /anchor init/);
  assert.match(r.stdout, /anchor demo/);
  assert.match(r.stdout, /抛锚/);
  assert.match(r.stdout, /收紧/);
  assert.match(r.stdout, /bind \/ verify_usage/);
  assert.match(r.stdout, /消费仓对照钉死的 OpenAPI/);
  assert.match(r.stdout, /Do not invent a field list/);
  assert.match(r.stdout, /human confirms/);
  assert.doesNotMatch(r.stdout, /pipeline/);
  assert.doesNotMatch(r.stdout, /new-change/);
});

test('pin writes pin.json from a local OpenAPI file', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-pin-'));
  const from = path.join(tmp, 'openapi.json');
  const out = path.join(tmp, 'order.pin.json');
  fs.writeFileSync(
    from,
    JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'order', version: '1.4.0' },
      components: { schemas: { Order: { properties: { order_id: { type: 'string' } } } } },
    }),
    'utf8',
  );
  const r = run([
    'pin',
    '--from',
    from,
    '--url',
    'https://git.example.com/releases/v1.4.0/downloads/openapi.json',
    '--tag',
    'v1.4.0',
    '-o',
    out,
  ]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const pin = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(pin.version, 'v1.4.0');
  assert.match(pin.hash, /^sha256:[0-9a-f]{64}$/);
  assert.ok(pin.path);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('unknown workshop command is rejected', function () {
  const r = run(['compile']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown command: compile/);
});

test('help documents the second round: repin', function () {
  const r = run(['--help']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /anchor repin --from/);
  assert.match(r.stdout, /不要往 pin 里手加字段/);
  assert.match(r.stdout, /--change/);
});

test('urlForNextTag carries the release tag in the download url', function () {
  assert.equal(
    urlForNextTag('https://git.example.com/x/-/releases/v1.4.0/downloads/openapi.json', 'v1.4.0', 'v1.5.0'),
    'https://git.example.com/x/-/releases/v1.5.0/downloads/openapi.json',
  );
  assert.equal(urlForNextTag('https://x/openapi.json', 'v1.4.0', 'v1.5.0'), 'https://x/openapi.json');
  assert.equal(urlForNextTag('https://x/v1.4.0/a.json', 'v1.4.0', null), 'https://x/v1.4.0/a.json');
});

test('check without --src is drift-only on cwd', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-drift-cwd-'));
  const contract = path.join(tmp, 'constraints.json');
  fs.writeFileSync(
    contract,
    JSON.stringify({
      schemaVersion: '1',
      units: [{ id: 'order_no', type: 'string', aliases: ['orderId'], provenance: 'declared' }],
    }) + '\n',
  );
  fs.writeFileSync(path.join(tmp, 'app.js'), 'const orderId = 1;\nconst customerName = 2;\n');
  const r = run(['check', '--contract', contract], tmp);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /orderId/);
  assert.doesNotMatch(r.stderr, /customerName/);
  assert.match(r.stderr, /drift-only/);
  assert.match(r.stderr, /scan /);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('init installs agent skill without writing a field list', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-starter-'));
  const r = run(['init'], tmp);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /skill/);
  assert.match(r.stdout, /不写字段名单/);
  assert.equal(fs.existsSync(path.join(tmp, 'constraints.json')), false);
  const skill = fs.readFileSync(path.join(tmp, '.claude', 'skills', 'anchorlock', 'SKILL.md'), 'utf8');
  assert.match(skill, /不要从工单/);
  assert.match(skill, /钉死的 OpenAPI/);
  assert.ok(fs.existsSync(path.join(tmp, '.cursor', 'skills', 'anchorlock', 'SKILL.md')));
  const agents = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8');
  assert.match(agents, /AnchorLock/);
  assert.match(agents, /pin\.json/);
  assert.doesNotMatch(agents, /根据任务写/);
  const again = run(['init'], tmp);
  assert.equal(again.status, 0, again.stderr);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('constraints --from projects OpenAPI', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-oa-'));
  const from = path.join(tmp, 'openapi.json');
  const out = path.join(tmp, 'constraints.json');
  fs.writeFileSync(
    from,
    JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'order', version: '1' },
      components: {
        schemas: {
          Order: { properties: { orderStatus: { type: 'string' }, pay_amount: { type: 'number' } } },
        },
      },
    }),
    'utf8',
  );
  const r = run(['constraints', '--from', from, '--out', out]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const doc = JSON.parse(fs.readFileSync(out, 'utf8'));
  const ids = doc.units.map(function (u) {
    return u.id;
  });
  assert.ok(ids.indexOf('order_status') >= 0);
  assert.ok(ids.indexOf('pay_amount') >= 0);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('check red then green', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-'));
  fs.writeFileSync(path.join(tmp, 'field-ids.txt'), 'order_status\npay_amount\n');
  fs.mkdirSync(path.join(tmp, 'src'));
  fs.writeFileSync(path.join(tmp, 'src', 'a.js'), 'const orderStatus = "paid";\n');
  const red = run(
    ['check', '--contract', path.join(tmp, 'field-ids.txt'), '--src', path.join(tmp, 'src')],
  );
  assert.equal(red.status, 1);
  assert.match(red.stderr, /orderStatus/);
  assert.match(red.stderr, /不要改 pin/);
  assert.match(red.stderr, /贴给编码 Agent/);
  fs.writeFileSync(path.join(tmp, 'src', 'a.js'), 'const order_status = "paid";\n');
  const green = run(
    ['check', '--contract', path.join(tmp, 'field-ids.txt'), '--src', path.join(tmp, 'src')],
  );
  assert.equal(green.status, 0, green.stderr);
  assert.match(green.stdout, /PASS/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('check maps aliases orderId / order_sn to order_no', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-alias-'));
  fs.writeFileSync(
    path.join(tmp, 'constraints.json'),
    JSON.stringify({
      schemaVersion: '1',
      units: [
        { id: 'order_no', aliases: ['orderId', 'order_sn'] },
        { id: 'trade_no' },
      ],
    }),
    'utf8',
  );
  fs.mkdirSync(path.join(tmp, 'src'));
  fs.writeFileSync(
    path.join(tmp, 'src', 'order.js'),
    'export function row() { return { orderId: "A1", order_sn: "S1" }; }\n',
  );
  const red = run(
    ['check', '--contract', path.join(tmp, 'constraints.json'), '--src', path.join(tmp, 'src')],
    tmp,
  );
  assert.equal(red.status, 1);
  assert.match(red.stderr, /"orderId" should be "order_no"/);
  assert.match(red.stderr, /"order_sn" should be "order_no"/);
  fs.writeFileSync(
    path.join(tmp, 'src', 'order.js'),
    'export function row() { return { order_no: "A1", trade_no: "T1" }; }\n',
  );
  const green = run(
    ['check', '--contract', path.join(tmp, 'constraints.json'), '--src', path.join(tmp, 'src')],
    tmp,
  );
  assert.equal(green.status, 0, green.stderr);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('init --from-code drafts constraints.json from source', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-draft-'));
  fs.mkdirSync(path.join(tmp, 'src'));
  fs.writeFileSync(path.join(tmp, 'src', 'a.js'), 'const orderStatus = "paid";\nconst pay_amount = 1;\n');
  const out = path.join(tmp, 'constraints.json');
  const r = run(['init', '--from-code', path.join(tmp, 'src'), '--out', out]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const doc = JSON.parse(fs.readFileSync(out, 'utf8'));
  const byId = {};
  doc.units.forEach(function (u) {
    byId[u.id] = u;
  });
  assert.ok(byId.order_status);
  assert.ok(byId.order_status.aliases.indexOf('orderStatus') >= 0);
  assert.ok(byId.pay_amount);
  const checked = run(['check', '--contract', out, '--src', path.join(tmp, 'src')]);
  assert.equal(checked.status, 1);
  assert.match(checked.stderr, /orderStatus/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('demo is red then green', function () {
  const r = run(['demo']);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stderr, /"orderId" should be "order_no" \(src\/order\.js\)/);
  assert.match(r.stderr, /"order_sn" should be "order_no" \(src\/order\.js\)/);
  assert.match(r.stderr, /不要改 pin/);
  assert.match(r.stderr, /贴给编码 Agent/);
  assert.match(r.stdout, /demo ok/);
});

test('check uses pin.path offline', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-pin-file-'));
  const from = path.join(tmp, 'openapi.json');
  const out = path.join(tmp, 'order.pin.json');
  fs.writeFileSync(
    from,
    JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'order', version: '1.4.0' },
      components: { schemas: { Order: { properties: { order_no: { type: 'string' } } } } },
    }),
    'utf8',
  );
  fs.mkdirSync(path.join(tmp, 'src'));
  fs.writeFileSync(path.join(tmp, 'src', 'a.js'), 'const order_no = "A1";\n');
  const pinned = run([
    'pin',
    '--from',
    from,
    '--url',
    'https://example.invalid/openapi.json',
    '--tag',
    'v1.4.0',
    '-o',
    out,
  ]);
  assert.equal(pinned.status, 0, pinned.stderr);
  const checked = run(['check', '--contract', out, '--src', path.join(tmp, 'src'), '--require-hash'], tmp);
  assert.equal(checked.status, 0, checked.stderr + checked.stdout);
  fs.rmSync(tmp, { recursive: true, force: true });
});

function writeSpec(file, version, props) {
  fs.writeFileSync(
    file,
    JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'order', version: version },
      components: { schemas: { Order: { properties: props } } },
    }),
    'utf8',
  );
}

test('repin swaps the whole pin to the new tag and keeps the change id', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-repin-'));
  const out = path.join(tmp, 'contracts', 'order.pin.json');
  const v1 = path.join(tmp, 'openapi-v1.json');
  const v2 = path.join(tmp, 'openapi-v2.json');
  writeSpec(v1, '1.4.0', { order_no: { type: 'string' } });
  writeSpec(v2, '1.5.0', { order_no: { type: 'string' }, pay_amount: { type: 'number' } });

  const first = run([
    'pin',
    '--from', v1,
    '--url', 'https://git.example.invalid/o/-/releases/v1.4.0/downloads/openapi.json',
    '--tag', 'v1.4.0',
    '--change', 'PROJ-123',
    '-o', out,
  ]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).change, 'PROJ-123');

  const again = run(['repin', '--from', v2, '--tag', 'v1.5.0', '-o', out], tmp);
  assert.equal(again.status, 0, again.stderr + again.stdout);
  assert.match(again.stdout, /v1\.4\.0 → v1\.5\.0/);
  const pin = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(pin.version, 'v1.5.0');
  assert.equal(pin.change, 'PROJ-123');
  assert.match(pin.url, /releases\/v1\.5\.0\//);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('repin without an existing pin points at anchor pin', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-repin-missing-'));
  const from = path.join(tmp, 'openapi.json');
  writeSpec(from, '1.4.0', { order_no: { type: 'string' } });
  const r = run(['repin', '--from', from, '--tag', 'v1.4.0', '-o', path.join(tmp, 'nope.json')], tmp);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /没有现成的 pin/);
  assert.match(r.stderr, /anchor pin/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('check prints which pinned tag and change it locked to', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-pin-line-'));
  const from = path.join(tmp, 'openapi.json');
  const out = path.join(tmp, 'order.pin.json');
  writeSpec(from, '1.4.0', { order_no: { type: 'string' } });
  fs.mkdirSync(path.join(tmp, 'src'));
  fs.writeFileSync(path.join(tmp, 'src', 'a.js'), 'const order_no = "A1";\n');
  const pinned = run([
    'pin',
    '--from', from,
    '--url', 'https://example.invalid/openapi.json',
    '--tag', 'v1.4.0',
    '--change', 'PROJ-123',
    '-o', out,
  ]);
  assert.equal(pinned.status, 0, pinned.stderr);
  const checked = run(
    ['check', '--contract', out, '--src', path.join(tmp, 'src'), '--require-hash'],
    tmp,
  );
  assert.equal(checked.status, 0, checked.stderr + checked.stdout);
  assert.match(checked.stderr, /pin {3}v1\.4\.0 · change PROJ-123/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('formatDraftText spells out what to keep and what to delete', function () {
  const text = formatDraftText([{ id: 'order_status', variants: ['order_status'] }]);
  assert.match(text, /HTTP JSON key/);
  assert.match(text, /拿不准就删/);
});

test('formatIssue is English', function () {
  term.setNoColor(true);
  assert.equal(
    formatIssue({ kind: 'drift', ident: 'orderStatus', expected: 'order_status', file: 'a.js' }),
    '"orderStatus" should be "order_status" (a.js)',
  );
  term.setNoColor(false);
});

test('formatDraftText marks draft', function () {
  const text = formatDraftText([
    { id: 'order_status', variants: ['order_status', 'orderStatus'] },
  ]);
  assert.match(text, /DRAFT/);
  assert.match(text, /also in source: orderStatus/);
});

test('check --strict flags undeclared field-like names', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-strict-'));
  const contract = path.join(tmp, 'constraints.json');
  fs.writeFileSync(
    contract,
    JSON.stringify({
      schemaVersion: '1',
      units: [{ id: 'order_no', aliases: ['orderId'] }],
    }),
    'utf8',
  );
  fs.mkdirSync(path.join(tmp, 'src'));
  fs.writeFileSync(
    path.join(tmp, 'src', 'a.js'),
    'const orderId = 1;\nconst customerName = 2;\n',
  );
  const r = run(
    ['check', '--contract', contract, '--src', path.join(tmp, 'src'), '--strict'],
    tmp,
  );
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /"orderId" should be "order_no"/);
  assert.match(r.stderr, /"customerName" is not in the contract/);
  assert.match(r.stderr, /不要改 pin/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('check --strict ignores function calls and declarations', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-strict-fn-'));
  const contract = path.join(tmp, 'constraints.json');
  fs.writeFileSync(
    contract,
    JSON.stringify({
      schemaVersion: '1',
      units: [{ id: 'orderSn' }],
    }),
    'utf8',
  );
  fs.mkdirSync(path.join(tmp, 'src'));
  fs.writeFileSync(
    path.join(tmp, 'src', 'lookup.js'),
    [
      'function lookupMine(orderSn) {',
      '  return encodeURIComponent(orderSn);',
      '}',
      'const fetchOrder = async () => orderSn;',
      'const customerName = 1;',
      '',
    ].join('\n'),
  );
  const r = run(
    ['check', '--contract', contract, '--src', path.join(tmp, 'src'), '--strict'],
    tmp,
  );
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /"customerName" is not in the contract/);
  assert.doesNotMatch(r.stderr, /lookupMine/);
  assert.doesNotMatch(r.stderr, /encodeURIComponent/);
  assert.doesNotMatch(r.stderr, /fetchOrder/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('check --src without --strict stays drift-only', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-src-drift-'));
  const contract = path.join(tmp, 'constraints.json');
  fs.writeFileSync(
    contract,
    JSON.stringify({
      schemaVersion: '1',
      units: [{ id: 'order_no', aliases: ['orderId'] }],
    }),
    'utf8',
  );
  fs.mkdirSync(path.join(tmp, 'src'));
  fs.writeFileSync(
    path.join(tmp, 'src', 'a.js'),
    'const orderId = 1;\nconst customerName = 2;\nconst getUserId = 3;\n',
  );
  const r = run(
    ['check', '--contract', contract, '--src', path.join(tmp, 'src')],
    tmp,
  );
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /drift-only/);
  assert.match(r.stderr, /orderId/);
  assert.doesNotMatch(r.stderr, /customerName/);
  assert.doesNotMatch(r.stderr, /getUserId/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('check --src --drift ignores undeclared names', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-drift-flag-'));
  const contract = path.join(tmp, 'constraints.json');
  fs.writeFileSync(
    contract,
    JSON.stringify({
      schemaVersion: '1',
      units: [{ id: 'order_no', aliases: ['orderId'] }],
    }),
    'utf8',
  );
  fs.mkdirSync(path.join(tmp, 'src'));
  fs.writeFileSync(
    path.join(tmp, 'src', 'a.js'),
    'const orderId = 1;\nconst customerName = 2;\n',
  );
  const r = run(
    ['check', '--contract', contract, '--src', path.join(tmp, 'src'), '--drift'],
    tmp,
  );
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /orderId/);
  assert.doesNotMatch(r.stderr, /customerName/);
  assert.match(r.stderr, /drift-only/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('check maps quoted alias 单号 to order_no', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-zh-'));
  fs.writeFileSync(
    path.join(tmp, 'constraints.json'),
    JSON.stringify({
      schemaVersion: '1',
      units: [{ id: 'order_no', aliases: ['单号'] }, { id: 'trade_no' }],
    }),
    'utf8',
  );
  fs.mkdirSync(path.join(tmp, 'src'));
  fs.writeFileSync(
    path.join(tmp, 'src', 'order.js'),
    'const label = "单号";\nconst trade_no = "T1";\n',
  );
  const r = run(
    ['check', '--contract', path.join(tmp, 'constraints.json'), '--src', path.join(tmp, 'src')],
    tmp,
  );
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /"单号" should be "order_no"/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('check --changed only scans git-modified source', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-changed-'));
  const git = function (args) {
    const r = spawnSync('git', ['-c', 'user.email=dev@test', '-c', 'user.name=dev'].concat(args), {
      cwd: tmp,
      encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr + r.stdout);
  };
  git(['init', '-b', 'main']);
  fs.writeFileSync(
    path.join(tmp, 'constraints.json'),
    JSON.stringify({
      schemaVersion: '1',
      units: [{ id: 'order_no', aliases: ['orderId'] }],
    }),
    'utf8',
  );
  fs.mkdirSync(path.join(tmp, 'src'));
  fs.writeFileSync(path.join(tmp, 'src', 'clean.js'), 'const order_no = 1;\n');
  fs.writeFileSync(path.join(tmp, 'src', 'stale.js'), 'const orderId = 1;\n');
  git(['add', '.']);
  git(['commit', '-m', 'base']);
  fs.writeFileSync(path.join(tmp, 'src', 'clean.js'), 'const orderId = 2;\n');
  const r = run(['check', '--contract', 'constraints.json', '--changed'], tmp);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /scan {2}git changes/);
  assert.match(r.stderr, /clean\.js/);
  assert.doesNotMatch(r.stderr, /stale\.js/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('check --hash mismatch exits 1', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-hash-'));
  const from = path.join(tmp, 'openapi.json');
  fs.writeFileSync(
    from,
    JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'order', version: '1.4.0' },
      components: { schemas: { Order: { properties: { order_no: { type: 'string' } } } } },
    }),
    'utf8',
  );
  fs.mkdirSync(path.join(tmp, 'src'));
  fs.writeFileSync(path.join(tmp, 'src', 'a.js'), 'const order_no = "A1";\n');
  const r = run(
    [
      'check',
      '--contract',
      from,
      '--src',
      path.join(tmp, 'src'),
      '--hash',
      'sha256:' + 'f'.repeat(64),
    ],
    tmp,
  );
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /指纹不符/);
  fs.rmSync(tmp, { recursive: true, force: true });
});
