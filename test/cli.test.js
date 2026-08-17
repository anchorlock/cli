'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { parseArgs, formatIssue, formatDraftText } = require('../lib/cli');
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
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('init installs agent skill + starter constraints.json', function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-starter-'));
  const r = run(['init'], tmp);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /starter/);
  assert.match(r.stdout, /skill/);
  const doc = JSON.parse(fs.readFileSync(path.join(tmp, 'constraints.json'), 'utf8'));
  assert.equal(doc.units[0].id, 'order_no');
  assert.ok(doc.units[0].aliases.indexOf('orderId') >= 0);
  const skill = fs.readFileSync(path.join(tmp, '.claude', 'skills', 'anchorlock', 'SKILL.md'), 'utf8');
  assert.match(skill, /不要让人打开/);
  assert.ok(fs.existsSync(path.join(tmp, '.cursor', 'skills', 'anchorlock', 'SKILL.md')));
  const agents = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8');
  assert.match(agents, /AnchorLock/);
  assert.match(agents, /收紧/);
  assert.match(skill, /抛锚/);
  const again = run(['init'], tmp);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /已存在，未覆盖/);
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
