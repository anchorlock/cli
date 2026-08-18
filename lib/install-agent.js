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
    '\n## AnchorLock\n\n消费仓对照钉死的 OpenAPI（`contracts/*.pin.json`）收紧字段名：`npx anchor check --contract contracts/order.pin.json --src src --strict --require-hash`。没有说明书时，一处 `anchor init --from-code` 起草，**人确认**后再 check；不要从需求/PRD 编写名单。要用新字段等后端发新 tag，由人 `anchor repin --tag vX.Y.Z --change <需求号>` 整份换；不要为了绿灯 repin 或改 pin。抛锚是 SemanticAnchor 的 `bind` / `verify_usage`，不是这条 check。\n';
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
