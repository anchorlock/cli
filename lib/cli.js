'use strict';

const fs = require('fs');
const path = require('path');
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
    else if (a === '--init') args.init = true;
    else if (a === '--out' || a === '-o') args.out = argv[++i];
    else if (a === '--force') args.force = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--format') args.format = argv[++i];
    else if (a === '--json') args.format = 'json';
    else if (a === '--no-color') args.noColor = true;
    else if (a === '--drift') args.drift = true;
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
    '  上手（一次）:',
    '    anchor init                         # 安装 Agent skill + 示例名单',
    '    # 把这次做什么发给 Agent；不要手改 JSON',
    '    # Agent 写 constraints.json、写代码、收紧：',
    '    anchor check --contract constraints.json',
    '',
    '  有 OpenAPI 之后:',
    '    anchor pin --from <openapi.json> --url <download-url> --tag <vX.Y.Z>',
    '    anchor check --contract <pin.json> --src <dir> --strict [--require-hash]   # 收紧',
    '    anchor constraints --from <pin.json> [-o constraints.json]  # 投影，给抛锚准备文件',
    '',
    '  从代码起草（仅辅助，范围仍由 Agent 按任务写名单）:',
    '    anchor init --from-code <dir> [-o constraints.json]',
    '',
    '  --drift       只拦近义词碰撞（默认：未传 --src 时）',
    '  --strict      未出现在名单里的字段名也失败',
    '  --no-color    disable ANSI (or set NO_COLOR=1)',
    '',
    '  两下钉锚（不是同义词）:',
    '    抛锚  写盘前  SemanticAnchor MCP  bind / verify_usage   （吃 constraints.json）',
    '    收紧  合并前  anchor check --contract … --src src',
    '    投影  不是抛锚  anchor constraints --from <pin.json>     （给 bind 准备文件）',
    '',
    '  可选:  anchor demo                    # 不碰仓库，看一次红→绿',
    '',
    'Ask one question only after the 10-minute start: do you already have an OpenAPI spec?',
    '  Yes → pin the tagged artifact, then check.',
    '  No  → Agent writes constraints.json from the task, then check.',
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
  process.stderr.write(
    term.red(term.bold('FAIL', process.stderr), process.stderr) +
      '  field-name gate  (' +
      n +
      ' issues)\n',
  );
  (errors || []).forEach(function (e) {
    process.stderr.write('  ' + term.red('×', process.stderr) + ' ' + formatIssue(e) + '\n');
  });
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
    if (asJson) {
      writeJson(result);
      return 0;
    }
    process.stdout.write('Wrote pin.json  ' + result.pin.version + '  ' + result.hash + '\n');
    process.stdout.write('  from  ' + result.from + '\n');
    process.stdout.write('  url   ' + result.pin.url + '\n');
    process.stdout.write('  out   ' + (result.out || '(dry-run, not written)') + '\n');
    process.stdout.write(
      '\nNext:\n  anchor check --contract ' +
        (result.out || 'contracts/order.pin.json') +
        ' --src src --require-hash\n',
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
        '\nNext: delete names you do not want to lock, then:\n  anchor check --contract ' +
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
      const demo = require('./demo');
      const agent = require('./install-agent');
      const out = path.resolve(args.out || 'constraints.json');
      const hasContract = fs.existsSync(out);
      if (hasContract && !args.force) {
        // 名单已在：只刷新 Agent 协议文件，不动契约。
      } else if (!args.dryRun) {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify(demo.STARTER, null, 2) + '\n', 'utf8');
      }
      const installed = agent.installAgentFiles(process.cwd(), { dryRun: !!args.dryRun });
      if (asJson) {
        writeJson({
          out: args.dryRun ? null : out,
          starter: !hasContract || !!args.force,
          skill: installed.skill,
          agents: installed.agents,
          units: demo.STARTER.units,
        });
        return 0;
      }
      process.stdout.write('Installed AnchorLock agent flow\n');
      installed.skill.forEach(function (p) {
        process.stdout.write(term.dim('  skill   ') + path.relative(process.cwd(), p) + '\n');
      });
      process.stdout.write(term.dim('  agents  ') + path.relative(process.cwd(), installed.agents) + '\n');
      process.stdout.write(
        term.dim('  out     ') +
          (args.dryRun
            ? '(dry-run, not written)'
            : path.relative(process.cwd(), out) + (hasContract && !args.force ? '  (已存在，未覆盖)' : '  (starter)')) +
          '\n',
      );
      process.stdout.write(
        '\n下一步不用改 JSON。把这次要做什么告诉你的 AI，例如：\n' +
          term.cyan('  「实现订单查询，锁住订单号，别名 orderId / order_sn」\n') +
          'Agent 会写名单、用规范名写代码，并在交付前跑：\n' +
          term.cyan('  anchor check --contract constraints.json\n'),
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
      '\nNext: delete names you do not want to lock, then:\n  anchor check --contract ' +
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
        ' (this CLI has check / pin / constraints / init / demo). Full workshop: spec-forge --help',
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
      '\nNext: delete names you do not want to lock, then:\n  anchor check --contract ' +
        (result.out || 'constraints.json') +
        ' --src ' +
        (args.src || 'src') +
        '\n',
    );
    return 0;
  }

  const src = args.src || process.cwd();
  const driftOnly = args.strict ? false : args.drift || !args.src;
  const result = await engine.checkNames({
    contract: args.contract,
    src: src,
    hash: args.hash,
    requireHash: !!args.requireHash,
    cacheDir: args.cacheDir,
    driftOnly: driftOnly,
  });
  if (asJson) {
    writeJson(result);
    return result.ok ? 0 : 1;
  }
  if (driftOnly) {
    process.stderr.write(
      term.dim('  mode  drift-only · 只拦名单上的近义词，未声明的字段不报。全量门禁用 --strict。', process.stderr) +
        '\n',
    );
  }
  if (result.ok) {
    printGateOk(result);
    if (result.contract.sha256) {
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

module.exports = { runCli, parseArgs, formatIssue, formatDraftText };
