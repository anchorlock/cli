'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadEngine } = require('./engine');
const term = require('./term');

const PKG = require('../package.json');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--contract') args.contract = argv[++i];
    else if (a === '--src') args.src = argv[++i];
    else if (a === '--hash') args.hash = argv[++i];
    else if (a === '--require-hash') args.requireHash = true;
    else if (a === '--cache-dir') args.cacheDir = argv[++i];
    else if (a === '--from-code') {
      args.fromCode = true;
      if (argv[i + 1] && !String(argv[i + 1]).startsWith('-')) args.src = argv[++i];
    } else if (a === '--draft') args.draft = true;
    else if (a === '--from') args.from = argv[++i];
    else if (a === '--url') args.url = argv[++i];
    else if (a === '--tag') args.tag = argv[++i];
    else if (a === '--source') args.source = argv[++i];
    else if (a === '--change') args.change = argv[++i];
    else if (a === '--init') args.init = true;
    else if (a === '--out' || a === '-o') args.out = argv[++i];
    else if (a === '--force') args.force = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--format') args.format = argv[++i];
    else if (a === '--json') args.format = 'json';
    else if (a === '--no-color') args.noColor = true;
    else if (a === '--drift') args.drift = true;
    else if (a === '--changed') args.changed = true;
    else if (a === '--strict') args.strict = true;
    else if (a === '-h' || a === '--help') args.help = true;
    else if (a === '-V' || a === '--version') args.version = true;
    else if (a.startsWith('-')) throw new Error('unknown flag: ' + a);
    else args._.push(a);
  }
  return args;
}

function printHelp() {
  const lines = [
    'Anchorlock  keep AI-generated code faithful to your contract',
    '',
    'Usage:',
    '  消费仓对照钉死的 OpenAPI（主路径）:',
    '    anchor init                         # 安装 Agent skill（不写字段名单）',
    '    anchor pin --from <openapi.json> --url <download-url> --tag <vX.Y.Z> [--change <需求号>]',
    '    anchor check --contract <pin.json> --src src --strict --require-hash',
    '    # 投影给抛锚用（这一步不是抛锚）:',
    '    anchor constraints --from <pin.json> [-o constraints.json]',
    '',
    '  第二回合：后端发了新 tag（不要往 pin 里手加字段，整份换）:',
    '    anchor repin --from <new-openapi.json> --tag <vX.Y.Z> [--change <需求号>]',
    '    anchor check --contract <pin.json> --src src --strict --require-hash',
    '',
    '  没有 OpenAPI：一处起草，人确认后再 check:',
    '    anchor init --from-code <one-module> [-o constraints.json]',
    '    anchor check --contract constraints.json --src src',
    '',
    '  --src         扫描目录或文件（CI 钉死 src/；不要让人填某个源文件）',
    '  --changed     只扫相对 HEAD 改过 / 未跟踪的源文件（git）',
    '  --change      把这次换版关联到需求号，写进 pin.json，check 时一并显示',
    '  --drift       只拦近义词碰撞（默认）',
    '  --strict      未出现在契约里的字段名也失败（OpenAPI 合主干用这个）',
    '  --no-color    disable ANSI (or set NO_COLOR=1)',
    '',
    '  两下钉锚（不是同义词）:',
    '    抛锚  写盘前  SemanticAnchor MCP  bind / verify_usage   （吃 constraints.json）',
    '    收紧  合并前  anchor check --contract pin.json --src src --strict',
    '    投影  不是抛锚  anchor constraints --from <pin.json>     （给 bind 准备文件）',
    '',
    '  可选:  anchor demo                    # 不碰仓库，看一次红→绿',
    '',
    'Ask one question: do you already have an OpenAPI spec?',
    '  Yes → pin the tagged artifact, then check. Do not invent a field list.',
    '  No  → draft once from code; a human confirms; other repos only check.',
    '',
    'Do not clone the backend repo. Do not point at a live /v3/api-docs without --hash.',
    'compile / pack / demand-repo stay in @keelforge/spec-forge.',
    '',
  ];
  process.stdout.write(lines.join('\n'));
}

function formatIssue(e) {
  const err = process.stderr;
  if (e.kind === 'drift') {
    return (
      term.bold(term.red(term.quote(e.ident), err), err) +
      ' should be ' +
      term.bold(term.green(term.quote(e.expected), err), err) +
      ' (' +
      term.dim(e.file, err) +
      ')'
    );
  }
  if (e.kind === 'undeclared') {
    return (
      term.bold(term.red(term.quote(e.ident), err), err) +
      ' is not in the contract (' +
      term.dim(e.file, err) +
      ')'
    );
  }
  return e.message || String(e);
}

function printGateFail(errors) {
  const n = errors && errors.length ? errors.length : 0;
  const err = process.stderr;
  err.write(
    term.red(term.bold('FAIL', err), err) + '  field-name gate  (' + n + ' issues)\n',
  );
  (errors || []).forEach(function (e) {
    err.write('  ' + term.red('×', err) + ' ' + formatIssue(e) + '\n');
  });
  err.write('\n');
  err.write(term.dim('next  ', err) + '改代码对齐上面的规范名，不要改 pin / OpenAPI。\n');
  err.write(term.dim('      ', err) + '把本段 FAIL 贴给编码 Agent；改完再跑同一条 check。\n');
}

function printGateOk(result) {
  process.stdout.write(
    term.green(term.bold('PASS', process.stdout), process.stdout) +
      '  field-name gate  (' +
      result.contract.idCount +
      ' names · ' +
      result.fileCount +
      ' files)\n',
  );
}

function formatDraftText(entries) {
  const lines = [
    '# DRAFT — candidate field names from source. Confirm before `anchor check`.',
    '# Do not treat this file as a contract as-is; it is the current (possibly drifted) state.',
    '# 留：会跨进程传的名字（HTTP JSON key、SQL 列名、MQ payload、存储字段）。',
    '# 删：函数名、局部变量、类型名、框架词，以及只在一个文件里出现过的名字。',
    '# 拿不准就删：漏锁只是没保护，错锁会逼别人改本来对的代码。',
    '# Preferred style: snake_case. Delete names you do not want to lock, then run:',
    '#   anchor check --contract constraints.json --src src',
    '#',
  ];
  entries.forEach(function (e) {
    const others = (e.variants || []).filter(function (v) {
      return v !== e.id;
    });
    let line = e.id;
    if (others.length) line += '  # also in source: ' + others.join(', ');
    lines.push(line);
  });
  return lines.join('\n') + '\n';
}

function writeJson(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

function readPinFile(contractPath) {
  if (!contractPath) return null;
  const p = path.resolve(contractPath);
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return null;
  let data;
  try {
    data = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
  if (!data || typeof data !== 'object' || !(data.hash || data.sha256)) return null;
  return data;
}

/** writePin 只写 url/hash/version/path；需求关联由本 CLI 追加。 */
function applyPinChange(outPath, change) {
  if (!outPath || !change) return null;
  const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  data.change = change;
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return change;
}

/** 发版 URL 里通常带着旧 tag，换版时跟着走，省得人手改一长串。 */
function urlForNextTag(prevUrl, prevVersion, nextTag) {
  if (!prevUrl || !prevVersion || !nextTag || prevVersion === nextTag) return prevUrl;
  if (prevUrl.indexOf(prevVersion) < 0) return prevUrl;
  return prevUrl.split(prevVersion).join(nextTag);
}

const SRC_EXT = new Set(['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs', '.vue', '.java', '.kt', '.py', '.go', '.cs']);

function gitChangedFiles(root) {
  const opt = { cwd: root, encoding: 'utf8' };
  const diff = spawnSync('git', ['diff', '--name-only', 'HEAD'], opt);
  if (diff.status !== 0) {
    throw new Error('不是 git 仓库，或 git diff 失败。--changed 需要在仓库里跑。');
  }
  const extra = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], opt);
  const names = String(diff.stdout || '')
    .split('\n')
    .concat(String(extra.stdout || '').split('\n'));
  const seen = {};
  const out = [];
  names.forEach(function (n) {
    n = String(n || '').trim();
    if (!n || seen[n]) return;
    if (!SRC_EXT.has(path.extname(n))) return;
    const abs = path.resolve(root, n);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return;
    seen[n] = true;
    out.push(abs);
  });
  return out;
}

function identRole(text, after) {
  let i = after;
  while (i < text.length && /[ \t]/.test(text[i])) i++;
  if (text[i] === '(') return 'call';
  if (text[i] === '<') {
    const close = text.indexOf('>', i);
    if (close > i && close < i + 80) {
      let j = close + 1;
      while (j < text.length && /[ \t]/.test(text[j])) j++;
      if (text[j] === '(') return 'call';
    }
  }
  if (text[i] === '=') {
    i += 1;
    while (i < text.length && /[ \t\r\n]/.test(text[i])) i++;
    if (/^(async\b|function\b|\(|=>)/.test(text.slice(i, i + 24))) return 'fn';
  }
  return 'value';
}

function identUsedAsValue(absPath, ident) {
  let text;
  try {
    text = fs.readFileSync(absPath, 'utf8');
  } catch (e) {
    return true;
  }
  const re = new RegExp('\\b' + ident.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
  let m;
  let saw = false;
  while ((m = re.exec(text)) !== null) {
    saw = true;
    if (identRole(text, m.index + ident.length) === 'value') return true;
  }
  return !saw;
}

function filterUndeclaredCalls(result, root) {
  if (!result || !Array.isArray(result.errors) || !result.errors.length) return result;
  const base = root || process.cwd();
  result.errors = result.errors.filter(function (e) {
    if (e.kind !== 'undeclared' || !e.ident || !e.file) return true;
    return identUsedAsValue(path.resolve(base, e.file), e.ident);
  });
  result.ok = result.errors.length === 0;
  return result;
}

function printScan(label, fileCount, driftOnly) {
  const err = process.stderr;
  if (driftOnly) {
    err.write(
      term.dim(
        '  mode  drift-only · 只拦名单上的近义词，未声明的字段不报。全量门禁用 --strict。',
        err,
      ) + '\n',
    );
  } else {
    err.write(term.dim('  mode  strict · 名单外的字段名也失败', err) + '\n');
  }
  const n = fileCount || 0;
  err.write(term.dim('  scan  ' + label + '  (' + n + (n === 1 ? ' file)' : ' files)'), err) + '\n');
}

/** 让人一眼看见自己锁在哪一版说明书上，以及是哪个需求换的。 */
function printPinLine(result, pinFile) {
  const version = (result.contract && result.contract.version) || (pinFile && pinFile.version);
  const change = pinFile && pinFile.change;
  if (!version && !change) return;
  const parts = [];
  if (version) parts.push(version);
  if (change) parts.push('change ' + change);
  process.stderr.write(term.dim('  pin   ' + parts.join(' · '), process.stderr) + '\n');
}

async function runGate(engine, args, src, driftOnly) {
  const result = await engine.checkNames({
    contract: args.contract,
    src: src,
    hash: args.hash,
    requireHash: !!args.requireHash,
    cacheDir: args.cacheDir,
    driftOnly: driftOnly,
    relRoot: process.cwd(),
  });
  return filterUndeclaredCalls(result, process.cwd());
}

async function checkChanged(engine, args, driftOnly) {
  const files = gitChangedFiles(process.cwd());
  const merged = {
    ok: true,
    fileCount: 0,
    errors: [],
    warnings: [],
    contract: { idCount: 0 },
    scanLabel: 'git changes',
  };
  for (let i = 0; i < files.length; i++) {
    const r = await runGate(engine, args, files[i], driftOnly);
    merged.fileCount += r.fileCount || 0;
    merged.errors = merged.errors.concat(r.errors || []);
    merged.warnings = merged.warnings.concat(r.warnings || []);
    if (r.contract) merged.contract = r.contract;
    if (!r.ok) merged.ok = false;
  }
  return merged;
}

async function runCli(argv) {
  const args = parseArgs(argv || process.argv);
  if (args.version) {
    process.stdout.write(PKG.version + '\n');
    return 0;
  }
  if (args.help || !args._[0]) {
    printHelp();
    return args.help ? 0 : 1;
  }

  const cmd = args._[0];
  const asJson = args.format === 'json';
  if (args.noColor) term.setNoColor(true);
  const engine = loadEngine();

  if (cmd === 'demo') {
    const demo = require('./demo');
    const out = process.stdout;
    process.stdout.write(
      term.bold('== 1. 碰撞', out) +
        term.dim('  ·  名单是 ', out) +
        term.cyan('order_no', out) +
        term.dim('，代码写成 ', out) +
        term.red('orderId', out) +
        term.dim(' / ', out) +
        term.red('order_sn', out) +
        '\n',
    );
    const r = await demo.runDemo(engine.checkNames);
    if (!r.red || r.red.ok) {
      process.stderr.write('demo failed: expected a red gate\n');
      return 1;
    }
    printGateFail(r.red.errors);
    process.stdout.write(
      '\n' +
        term.bold('== 2. 对齐', out) +
        term.dim('  ·  改成名单里的名字', out) +
        '\n',
    );
    if (!r.green || !r.green.ok) {
      process.stderr.write('demo failed: expected a green gate\n');
      printGateFail(r.green && r.green.errors || []);
      return 1;
    }
    printGateOk(r.green);
    process.stdout.write('\n' + term.green(term.bold('demo ok', out), out) + term.dim(': 碰撞拦住 → 对齐通过', out) + '\n');
    return 0;
  }

  if (cmd === 'pin') {
    const result = engine.writePin({
      from: args.from || args._[1],
      url: args.url,
      tag: args.tag,
      out: args.out,
      force: !!args.force,
      dryRun: !!args.dryRun,
    });
    if (result.out) applyPinChange(result.out, args.change);
    if (args.change) result.pin.change = args.change;
    if (asJson) {
      writeJson(result);
      return 0;
    }
    process.stdout.write('Wrote pin.json  ' + result.pin.version + '  ' + result.hash + '\n');
    process.stdout.write('  from    ' + result.from + '\n');
    process.stdout.write('  url     ' + result.pin.url + '\n');
    if (args.change) process.stdout.write('  change  ' + args.change + '\n');
    process.stdout.write('  out     ' + (result.out || '(dry-run, not written)') + '\n');
    process.stdout.write(
      '\nNext:\n  anchor check --contract ' +
        (result.out || 'contracts/order.pin.json') +
        ' --src src --strict --require-hash\n' +
        '  # 后端下次发版换 tag：anchor repin --from <新 openapi.json> --tag <vX.Y.Z>\n',
    );
    return 0;
  }

  if (cmd === 'repin') {
    const target = path.resolve(
      args.out || args.contract || args._[1] || 'contracts/order.pin.json',
    );
    const prev = readPinFile(target);
    if (!prev) {
      throw new Error(
        '没有现成的 pin 可换：' + target + '（第一次请用 anchor pin --from … --url … --tag …）',
      );
    }
    if (!args.from) {
      throw new Error('repin 需要 --from <后端这次发版导出的 openapi.json>');
    }
    const url = args.url || urlForNextTag(prev.url, prev.version, args.tag);
    const result = engine.writePin({
      from: args.from,
      url: url,
      tag: args.tag,
      out: target,
      force: true,
      dryRun: !!args.dryRun,
    });
    const change = args.change || prev.change || null;
    if (result.out) applyPinChange(result.out, change);
    if (change) result.pin.change = change;
    const sameHash = prev.hash === result.hash;
    if (asJson) {
      writeJson({ out: result.out, pin: result.pin, previous: prev, unchanged: sameHash });
      return 0;
    }
    process.stdout.write('Repinned  ' + path.relative(process.cwd(), target) + '\n');
    process.stdout.write('  version  ' + (prev.version || '(none)') + ' → ' + result.pin.version + '\n');
    process.stdout.write('  hash     ' + (prev.hash || '(none)') + '\n');
    process.stdout.write('           ' + result.hash + '\n');
    process.stdout.write('  url      ' + result.pin.url + '\n');
    if (change) process.stdout.write('  change   ' + change + '\n');
    if (sameHash) {
      process.stderr.write(
        term.dim('warn  ') + '制品和上一版一模一样（hash 没变）。后端可能还没重新导出。\n',
      );
    }
    process.stdout.write(
      '\nNext:\n  git add ' +
        path.relative(process.cwd(), target) +
        '\n  anchor check --contract ' +
        path.relative(process.cwd(), target) +
        ' --src src --strict --require-hash\n' +
        '  # 红了改代码对齐新说明书，不要回退 pin。\n',
    );
    return 0;
  }

  if (cmd === 'constraints') {
    if (args.init && args.from) {
      throw new Error('do not pass --init with --from. Have OpenAPI? use --from. Have code? use --from-code.');
    }
    if (args.fromCode) {
      const result = engine.draftConstraintsFromCode({
        src: args.src || args._[1],
        out: args.out,
        force: !!args.force,
        dryRun: !!args.dryRun,
        source: args.source,
      });
      if (asJson) {
        writeJson({
          out: result.out,
          unitCount: result.unitCount,
          fromCode: true,
          units: result.doc && result.doc.units,
        });
        return 0;
      }
      process.stdout.write(
        'Drafted constraints.json from source (' +
          result.unitCount +
          ' candidates · ' +
          (result.fileCount || 0) +
          ' files). Confirm it before check / cast.\n',
      );
      process.stdout.write('  out  ' + (result.out || '(dry-run, not written)') + '\n');
      process.stdout.write(
        '\nThis is a DRAFT. A human must confirm ids before check.\n  anchor check --contract ' +
          (result.out || 'constraints.json') +
          ' --src ' +
          (args.src || 'src') +
          '\n',
      );
      return 0;
    }
    const wantInit = !!args.init || !args.from;
    const result = wantInit
      ? engine.writeConstraintsTemplate({
          out: args.out,
          force: !!args.force,
          dryRun: !!args.dryRun,
          source: args.source,
        })
      : await engine.writeConstraintsFromOpenApi({
          from: args.from,
          out: args.out,
          force: !!args.force,
          dryRun: !!args.dryRun,
          hash: args.hash,
          requireHash: !!args.requireHash,
          cacheDir: args.cacheDir,
          source: args.source,
        });
    if (asJson) {
      writeJson({
        out: result.out,
        unitCount: result.unitCount,
        unresolvedCount: result.unresolvedCount,
        template: !!result.template,
        units: result.doc && result.doc.units,
        unresolved: result.doc && result.doc.unresolved,
      });
      return 0;
    }
    if (result.template) {
      process.stdout.write(
        'Wrote constraints.json template (' +
          result.unitCount +
          ' example unit). Edit it, then check / cast against this file.\n',
      );
    } else {
      process.stdout.write(
        'Projected OpenAPI → constraints.json  (' +
          result.unitCount +
          ' units' +
          (result.unresolvedCount ? ' · ' + result.unresolvedCount + ' unresolved' : '') +
          ')\n',
      );
    }
    process.stdout.write('  out  ' + (result.out || '(dry-run, not written)') + '\n');
    process.stdout.write(
      '\nNext:\n  anchor check --contract ' +
        (result.out || 'constraints.json') +
        ' --src src\n',
    );
    return 0;
  }

  if (cmd === 'init') {
    if (!args.fromCode && args._[1] && !args.src) {
      args.fromCode = true;
      args.src = args._[1];
    }
    if (!args.fromCode) {
      const agent = require('./install-agent');
      const installed = agent.installAgentFiles(process.cwd(), { dryRun: !!args.dryRun });
      if (asJson) {
        writeJson({
          skill: installed.skill,
          agents: installed.agents,
          wroteConstraints: false,
        });
        return 0;
      }
      process.stdout.write('Installed AnchorLock agent flow\n');
      installed.skill.forEach(function (p) {
        process.stdout.write(term.dim('  skill   ') + path.relative(process.cwd(), p) + '\n');
      });
      process.stdout.write(term.dim('  agents  ') + path.relative(process.cwd(), installed.agents) + '\n');
      process.stdout.write(
        '\n不写字段名单。有 OpenAPI 就 pin 再 check；没有就一处 --from-code，人确认后再 check。\n' +
          '不要从需求里编 constraints.json。\n' +
          term.cyan('  anchor pin --from dist/openapi.json --url <tagged-url> --tag vX.Y.Z\n') +
          term.cyan('  anchor check --contract contracts/order.pin.json --src src --strict --require-hash\n'),
      );
      return 0;
    }
    if (!args.src) args.src = args._[1];
    const result = engine.draftConstraintsFromCode({
      src: args.src,
      out: args.out,
      force: !!args.force,
      dryRun: !!args.dryRun,
      source: args.source,
    });
    if (asJson) {
      writeJson({
        out: result.out,
        unitCount: result.unitCount,
        fromCode: true,
        src: result.src,
        units: result.doc && result.doc.units,
      });
      return 0;
    }
    process.stdout.write(
      'Drafted constraints.json from source (' +
        result.unitCount +
        ' candidates · ' +
        (result.fileCount || 0) +
        ' files). Confirm before check / cast.\n',
    );
    process.stdout.write('  src  ' + result.src + '\n');
    process.stdout.write('  out  ' + (result.out || '(dry-run, not written)') + '\n');
    process.stdout.write(
      '\nThis is a DRAFT. A human must confirm ids before check.\n  anchor check --contract ' +
        (result.out || 'constraints.json') +
        ' --src ' +
        (args.src || 'src') +
        '\n',
    );
    return 0;
  } else if (cmd !== 'check' && cmd !== 'constraints') {
    throw new Error(
      'unknown command: ' +
        cmd +
        ' (this CLI has check / pin / repin / constraints / init / demo). Full workshop: spec-forge --help',
    );
  }

  if (args.draft || args.fromCode) {
    if (args.contract) {
      throw new Error('do not pass --contract with --draft / --from-code. Draft first, confirm, then check.');
    }
    const result = engine.draftConstraintsFromCode({
      src: args.src,
      out: args.out,
      force: !!args.force,
      dryRun: !!args.dryRun,
    });
    if (asJson) {
      writeJson({
        out: result.out,
        unitCount: result.unitCount,
        fromCode: true,
        src: result.src,
        units: result.doc && result.doc.units,
      });
      return 0;
    }
    process.stdout.write(
      'Drafted constraints.json from source (' +
        result.unitCount +
        ' candidates · ' +
        (result.fileCount || 0) +
        ' files). Confirm before check / cast.\n',
    );
    process.stdout.write('  src  ' + result.src + '\n');
    process.stdout.write('  out  ' + (result.out || '(dry-run, not written)') + '\n');
    (result.doc.units || [])
      .filter(function (u) {
        return u.aliases && u.aliases.length;
      })
      .slice(0, 12)
      .forEach(function (u) {
        process.stdout.write('  ~ ' + u.id + '  ←  ' + u.aliases.join(' / ') + '\n');
      });
    process.stdout.write(
      '\nThis is a DRAFT. A human must confirm ids before check.\n  anchor check --contract ' +
        (result.out || 'constraints.json') +
        ' --src ' +
        (args.src || 'src') +
        '\n',
    );
    return 0;
  }

  if (args.changed && args.src) {
    throw new Error('不要同时传 --src 和 --changed。人用 --changed 或什么都不传；--src 留给 CI / Agent。');
  }

  const driftOnly = !args.strict;
  let result;
  let scanLabel;
  if (args.changed) {
    result = await checkChanged(engine, args, driftOnly);
    scanLabel = result.scanLabel;
  } else {
    const src = args.src || process.cwd();
    scanLabel = path.relative(process.cwd(), src) || '.';
    result = await runGate(engine, args, src, driftOnly);
  }
  if (asJson) {
    result.scan = scanLabel;
    writeJson(result);
    return result.ok ? 0 : 1;
  }
  printScan(scanLabel, result.fileCount, driftOnly);
  printPinLine(result, readPinFile(args.contract));
  if (result.ok) {
    printGateOk(result);
    if (result.contract && result.contract.sha256) {
      process.stdout.write(
        term.dim('  sha256  ') +
          result.contract.sha256 +
          (result.contract.pinned ? '  pinned' : '  unpinned') +
          '\n',
      );
    }
    (result.warnings || []).forEach(function (w) {
      if (w.kind === 'generic') return;
      process.stderr.write(term.dim('warn  ') + (w.message || String(w)) + '\n');
    });
    return 0;
  }
  printGateFail(result.errors);
  return 1;
}

module.exports = {
  runCli,
  parseArgs,
  formatIssue,
  formatDraftText,
  identRole,
  filterUndeclaredCalls,
  urlForNextTag,
};
