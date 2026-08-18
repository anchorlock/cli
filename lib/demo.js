'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const CONTRACT = {
  schemaVersion: '1',
  units: [
    {
      id: 'order_no',
      type: 'string',
      aliases: ['orderId', 'order_sn', '订单编号', '单号'],
    },
    { id: 'trade_no', type: 'string' },
  ],
};

/** init 落盘：空名单。字段从本次任务写，不要塞 demo 订单字段。 */
const STARTER = {
  schemaVersion: '1',
  units: [],
};

const DRIFT = 'export function row() {\n  return { orderId: "A10086", order_sn: "S1" };\n}\n';
const ALIGNED = 'export function row() {\n  return { order_no: "A10086", trade_no: "T1" };\n}\n';

/**
 * @param {(opts: object) => Promise<object>} checkNames
 */
async function runDemo(checkNames) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anchorlock-demo-'));
  try {
    const src = path.join(tmp, 'src');
    fs.mkdirSync(src);
    const contract = path.join(tmp, 'constraints.json');
    fs.writeFileSync(contract, JSON.stringify(CONTRACT, null, 2) + '\n');
    fs.writeFileSync(path.join(src, 'order.js'), DRIFT);
    const red = await checkNames({ contract: contract, src: src, relRoot: tmp });
    fs.writeFileSync(path.join(src, 'order.js'), ALIGNED);
    const green = await checkNames({ contract: contract, src: src, relRoot: tmp });
    return { red: red, green: green };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { runDemo, CONTRACT, STARTER, DRIFT, ALIGNED };
