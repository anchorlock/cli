'use strict';

const fs = require('fs');
const path = require('path');

function skillSourcePath() {
  return path.join(__dirname, '..', 'skills', 'anchorlock', 'SKILL.md');
}

function readSkill() {
  return fs.readFileSync(skillSourcePath(), 'utf8');
}

function installAgentFiles(root, opts) {
  opts = opts || {};
  const dests = [
    path.join(root, '.cursor', 'skills', 'anchorlock', 'SKILL.md'),
    path.join(root, '.claude', 'skills', 'anchorlock', 'SKILL.md'),
  ];
  const body = readSkill();
  const written = [];
  dests.forEach(function (dest) {
    if (!opts.dryRun) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, body, 'utf8');
    }
    written.push(dest);
  });
  const agents = path.join(root, 'AGENTS.md');
  const stamp =
    '\n## AnchorLock\n\n人只说这次做什么。Agent 根据任务写 `constraints.json`、用其中的 `id` 写代码，然后收紧：`npx anchor check --contract constraints.json`。抛锚是 SemanticAnchor 的 `bind` / `verify_usage`（吃同一份文件），不是这条 check。不要让人手工改字段 JSON。\n';
  if (!opts.dryRun) {
    if (!fs.existsSync(agents)) {
      fs.writeFileSync(agents, '# Agent\n' + stamp, 'utf8');
    } else {
      const cur = fs.readFileSync(agents, 'utf8');
      if (cur.indexOf('AnchorLock') === -1) {
        fs.appendFileSync(agents, stamp, 'utf8');
      }
    }
  }
  written.push(agents);
  return { skill: dests, agents: agents, written: written };
}

module.exports = { skillSourcePath, readSkill, installAgentFiles };
