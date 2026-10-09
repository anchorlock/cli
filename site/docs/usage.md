# Anchorlock CLI 使用说明

包：`@anchorlock/cli` · 命令：`anchor`  
本包装的是**收紧**：消费仓合并前，对照一份**仓外权威**的契约扫字段名。权威来自后端发版的 OpenAPI（钉 hash），不是本仓 Agent 根据需求编的名单。

**抛锚**是写盘前的 SemanticAnchor MCP（`bind` / `verify_usage`）。有 OpenAPI 时，先 `anchor constraints --from` 投影出它要吃的 `constraints.json`；投影本身不是抛锚。

需要 **Node.js 18+**。内核 `@keelforge/spec-forge` ≥ **0.5.19**。本机若与 `spec-forge` 同级，会优先用 `../spec-forge`。

---

## 0. 先问一句：有没有 OpenAPI？

有 → **路 A（默认）**。没有 → 路 B，且必须人确认一次起草稿。不要两条一起走。不要从 PRD 手写/让 Agent 写字段名单。

---

## 0.5 两份文件长什么样

`check` 只读字段名。下面是**对公转账**里最容易漂的五个名字，是切片，不是整份支付说明书。

**openapi.json**（路 A，后端发版，不要手写）：

```json
{
  "openapi": "3.0.3",
  "info": { "title": "payment-api", "version": "1.4.0" },
  "paths": {
    "/payments/transfers": {
      "post": {
        "operationId": "createTransfer",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": { "$ref": "#/components/schemas/TransferReq" }
            }
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "TransferReq": {
        "type": "object",
        "required": ["payer_account", "payee_account", "payment_amount", "payment_currency"],
        "properties": {
          "payer_account": { "type": "string", "description": "付款账号" },
          "payee_account": { "type": "string", "description": "收款账号" },
          "payment_amount": { "type": "string", "description": "转账金额，十进制字符串" },
          "payment_currency": { "type": "string", "description": "币种，ISO 4217" }
        }
      },
      "TransferRes": {
        "type": "object",
        "properties": {
          "payment_id": { "type": "string", "description": "支付流水号" },
          "payment_status": { "type": "string" }
        }
      }
    }
  }
}
```

规范名在 `properties` 上。消费仓不提交这份文件，只提交 pin：`{ "url", "hash", "version" }`。

**constraints.json**（路 B 人确认后的名单；路 A 用 `anchor constraints --from` 投影，不要手写）：

```json
{
  "schemaVersion": "1",
  "units": [
    {
      "id": "payment_id",
      "type": "string",
      "aliases": ["paymentId", "payId", "bank_serial_no", "支付流水号"]
    },
    {
      "id": "payer_account",
      "type": "string",
      "aliases": ["fromAccount", "payerAcct", "payer_acct", "付款账号"]
    },
    {
      "id": "payee_account",
      "type": "string",
      "aliases": ["toAccount", "payeeAcct", "payee_acct", "收款账号"]
    },
    {
      "id": "payment_amount",
      "type": "string",
      "aliases": ["amount", "txnAmt", "pay_amt", "转账金额"]
    },
    {
      "id": "payment_currency",
      "type": "string",
      "aliases": ["currency", "ccy", "币种"]
    }
  ]
}
```

`id` 是规范名。前端的 `fromAccount` / `amount`，或测试里的 `"付款账号"`，应对齐 `payer_account` / `payment_amount`。

---

## 1. 路 A：钉死的 OpenAPI（推荐）

后端构建导出说明书（Springdoc / Nest / FastAPI），打 tag，把 `openapi.json` 挂到 Release。前端**不 clone 后端仓**，不对着线上 `/v3/api-docs` 扫。

消费仓只提交 pin：

```bash
npm i -D @anchorlock/cli
npx anchor init    # 只装 Agent skill，不写名单

npx anchor pin --from dist/openapi.json \
  --url "https://git.example.com/group/order-api/-/releases/v1.4.0/downloads/openapi.json" \
  --tag v1.4.0 -o contracts/order.pin.json

npx anchor check --contract contracts/order.pin.json --src src --strict --require-hash
```

`check` 做的事：

1. 读 pin：优先用本地 `path`，否则下 `url`，用 `hash` 核对没下错文件。
2. 从说明书 schema 属性名抽出契约认的字段（如 `order_no`）。
3. 扫 `--src`（一般是 `src/`，跳过 `node_modules`）。近义词或说明书上没有的字段名 → 退出码非 0。

红了改**代码**对齐说明书，不要改 pin。CI 复制 [`ci/check-contract.github.yml`](../ci/check-contract.github.yml)，挂在 merge 保护上。

```json
{
  "url": "https://git.example.com/group/order-api/-/releases/v1.4.0/downloads/openapi.json",
  "hash": "sha256:后端发版时算出的64位指纹",
  "version": "v1.4.0",
  "path": "../dist/openapi.json"
}
```

本地还能读到 `path` 时不联网。私有制品把只读 token 放进 `ANCHOR_CONTRACT_TOKEN`。

合主干用 `--strict`：契约来自完整 OpenAPI，名单外的字段名也应失败。这在 TypeScript / JS 消费仓可用。不要拿 `--strict` 去扫同一个 Java 后端仓里的方法名和 SQL 列名——那是编译器和 MyBatis 的范围。

### 抛锚

```bash
anchor constraints --from contracts/order.pin.json -o constraints.json
# 然后 SA_CONSTRAINTS 指向这份文件，SemanticAnchor 跑 bind / verify_usage
```

收紧继续：`anchor check --contract contracts/order.pin.json --src src --strict --require-hash`。

---

## 1.5 第二回合：这次需求要加字段

**字段范围由后端发版推进，不由你和 Agent 的对话推进。** 需求说要加「优惠券抵扣」，不等于你可以往契约里加一个 `couponAmount`——先让后端发版，说明书上有了，前端才认。

pin 是**整份换**，不是往里面加字段：

```bash
# 1. 后端：改完接口，重新导出、打新 tag、挂到 Release
# 2. 前端：换到新那一版（url 里的 tag 会跟着换）
npx anchor repin --from ../order-api/dist/openapi.json --tag v1.5.0 --change PROJ-123

# 3. 看清楚换了什么，再提交
git diff contracts/order.pin.json
git add contracts/order.pin.json

# 4. 改业务代码用新字段，跑同一条 check
npx anchor check --contract contracts/order.pin.json --src src --strict --require-hash
```

`repin` 就是「换版专用的 pin」：沿用原来的 `url` 和 `change`，把 tag 换掉、hash 重算、直接覆盖（不用记 `--force`）。制品和上一版一字不差时会警告，多半是后端还没重新导出。

版本管理靠两样东西，不需要另建目录：

| 东西 | 谁记的 |
|---|---|
| 锁在哪一版 | `pin.json` 里的 `version` + `hash` |
| 为什么换 | `pin.json` 里的 `change`（需求号）+ 这次 commit |
| 换过几次 | `git log contracts/order.pin.json` |

`check` 每次都会把这两样打出来，人不用去翻文件：

```
  pin   v1.5.0 · change PROJ-123
```

**编码 Agent 不许自己 repin。** 换版是「后端发了新版本」触发的，不是「check 红了想换绿」。红了只能改代码。

---

## 1.6 多 Agent 协作（不是第三条路）

Cursor、Claude、Copilot 同时写，或前端 / 后端 / 测试各开一个 Agent，**仍走路 A（没有说明书则路 B）**。协作增加的是写代码的人，不是契约的份数。

共享这一份：

```text
contracts/order.pin.json
```

所有编码 Agent 吃同一份 `anchor init` 装进去的 skill。CI 只认这一条：

```bash
npx anchor check --contract contracts/order.pin.json --src src --strict --require-hash
```

| 谁 | 做什么 | 不许做什么 |
|---|---|---|
| 人 | 第一次 `pin`；后端发新 tag 后 `repin --change <需求号>` | 让 Agent 按对话补字段 |
| 后端 Agent | 实现接口、导出 OpenAPI、打 tag | 在消费仓 `check` 自己的 Java；手写名单当权威 |
| 前端 / 客户端 / 测试 Agent | 用说明书上的名字写代码；红了把 FAIL 贴回去改源码 | `repin`、改 pin、从 PRD 编名单 |
| CI | 合主干前跑上面那条 | 没有 |

同一仓里几个 Agent 并行：开工先看 `check` 打出来的 `pin   v1.5.0 · change …` 是不是同一版；各改各的源码；红了把整段 FAIL 贴给**写飘了的那个** Agent。冲突在 git，不在契约。

跨仓时顺序不能倒：后端发版 → 人 `repin` → 前端 / 测试 Agent 才用新字段。前端 Agent 不能先发明 `couponAmount` 再让后端追。测试仓和前端仓 pin **同一个** url/tag。

写盘前可选：投影一次，各 Agent 的 SemanticAnchor 都指向**这一份** `constraints.json`。投影不能代替 `check`，也不能手改当权威。

路 B：只允许**一处**起草并由人确认。其它 Agent 只 `check`。各扫各的（`orderStatus` vs `order_status`）两边都绿，联调照样炸。

---

## 2. 路 B：没有 OpenAPI

只在**一处、已经圈定的模块**起草。人确认 `id`，其它仓只 `check` 这一份。

```bash
anchor init --from-code path/to/one-module -o constraints.json
# 人确认之后：
anchor check --contract constraints.json --src src
```

起草稿里留什么、删什么，按这条判：

| 留 | 删 |
|---|---|
| 会跨进程传的名字：HTTP JSON key、SQL 列名、MQ payload、存储字段 | 函数名、方法名、局部变量、类型名、框架词 |
| 两个以上模块都在用的业务名 | 只在一个文件里出现过的名字 |

拿不准就删。漏锁只是这个字段没保护；错锁会让 CI 逼别人改本来正确的代码，工具很快就被关掉。

路 B 没有 tag 和 hash，`constraints.json` 的版本就是 git 历史。加字段的规矩和路 A 一样：**先改这一份、人确认，再写代码**，不要写完代码回头补名单。

不要每个仓都起草：前端扫出 `orderStatus`、后端扫出 `order_status`，两份都绿，联调照样炸。

不要让 Agent 按「实现订单查询」往 `units` 里加字段。那是自己给自己发证。

连代码都没有、要从零发明字段时，才用 `anchor constraints --init`。那是例外。

---

## 3. `check` 在查什么

词法扫描 `.js` / `.ts` / `.vue` / `.java` 等（**不扫 `.xml`**），对照契约的 `id` / `aliases`，以及驼峰↔蛇形折合。不读 PRD，不追踪调用链。

| 情况 | 结果 |
|------|------|
| 与某个 `id` 完全一致 | 通过 |
| 出现在某单元 `aliases`（含 `"单号"`） | **漂移 · 红** |
| `orderNo` 能折成契约里的 `order_no` | **漂移 · 红** |
| 长得像字段但不在契约里 | 默认忽略；`--strict` 时 **未声明 · 红** |
| 只作为函数出现：`lookupMine()`、`encodeURIComponent()`、`const fetchOrder = async () =>` | `--strict` 下忽略 |
| `id` / `name` / `status`、PascalCase 类型、`useXxx` | 忽略 |

`--src` 只定扫描根。人不要靠它指定某一个源文件。看未提交改动用 `--changed`。

---

## 4. 接到 CI（消费仓）

```yaml
- run: npx anchor check --contract contracts/order.pin.json --src src --strict --require-hash
```

门禁挂在 **merge / 主分支保护** 上。Prompt「请统一命名」挡不住下一次生成。

---

## 5. 抛锚和收紧

| | 何时 | 命令 | 吃什么 |
|---|---|---|---|
| **抛锚** | Agent 正在写文件 | SemanticAnchor MCP：`bind` / `verify_usage` | 从 OpenAPI **投影**出的 `constraints.json` |
| **收紧** | 合进主干之前 | `anchor check --contract pin.json --src src --strict` | 钉死的 OpenAPI / pin |
| 投影（不是抛锚） | 给抛锚准备文件 | `anchor constraints --from pin.json` | 钉住的说明书 |

`compile` / `pipeline` / `new-change` 会直接拒绝。

---

## 6. 常见问题

**每个仓都生成一份名单？**  
不要。路 A 钉同一份发版 OpenAPI。路 B 只扫一次，各仓共用这一份已确认文件。

**这次需求新增的字段放哪？**  
不往 pin 里加。后端发新 tag → `anchor repin --tag <新 tag> --change <需求号>` 整份换 → 再改代码。见上面「第二回合」。

**我怎么知道自己锁在哪一版？**  
`check` 会打 `pin   v1.5.0 · change PROJ-123`。历史看 `git log contracts/order.pin.json`。

**有 OpenAPI 还要让 Agent 写 constraints 吗？**  
不要。

**在 Java 后端仓跑 check 扫到 SQL 列名 / getter？**  
别这么用。本工具锁的是消费仓对接口字段；同一仓的 Java 交给编译器。合主干的 `--strict` 给 TS/JS 消费仓。

**红了改清单还是改代码？**  
改代码对齐契约。FAIL 末尾会写：不要改 pin，把这段贴给编码 Agent，改完再跑同一条 check。

**多个 Agent 同时写，要走第三条路吗？**  
不要。仍是路 A（或路 B）。共享同一份 pin，各自改代码，CI 收紧。见上面「多 Agent 协作」。

**想先看闸、不碰仓库：** `npx @anchorlock/cli demo` 或本仓 `npm run demo`。
