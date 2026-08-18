---
name: anchorlock
description: >-
  Field-name gate for a consumer repo against a pinned OpenAPI (or a
  human-confirmed draft). Use when the user mentions AnchorLock, pin.json,
  openapi.json, field drift, or merging AI-generated API/DTO code.
  Do not invent field lists from a PRD or spoken requirement.
---

# AnchorLock

本 CLI 拦的是**消费仓**（前端、客户端、测试）里的字段名，对照一份**不是本 Agent 写的**契约。

契约必须有仓外权威：后端发版的 OpenAPI，或人确认过的起草稿。不要从工单 / PRD / 人话里编 `constraints.json`——编名单的和写代码的是同一个 Agent，等于没锁。

## 对照什么（二选一，有 OpenAPI 走 1）

### 1. 钉死的 OpenAPI（主路径）

消费仓提交 `contracts/*.pin.json`（url + hash + tag），不要提交整份说明书，不要对着 `/v3/api-docs`。

```bash
npx anchor pin --from dist/openapi.json --url <tagged-download-url> --tag vX.Y.Z -o contracts/order.pin.json
npx anchor check --contract contracts/order.pin.json --src src --strict --require-hash
```

红了改代码对齐说明书，不改 pin。把 FAIL 贴给编码 Agent，不要改 pin。`--strict` 是合主干的门：名单外的字段名也失败。函数调用 / 声明（`lookupMine()`、`encodeURIComponent()`）不算字段。TypeScript / JS 消费仓用这个。

需求要用新字段时，**不要往 pin 里加**。等后端发新 tag，由人换整份：

```bash
npx anchor repin --from <新 openapi.json> --tag vX.Y.Z --change <需求号>
```

换版由「后端发布了新版本」触发，不由「check 红了」触发。Agent 不许为了绿灯 repin 或回退 pin。

多 Agent（同一仓并行，或前端 / 后端 / 测试分头）**不是第三条路**。共享 `contracts/*.pin.json` 和同一条 `check`。不要按自己这次对话另写名单。红了把 FAIL 贴给写飘的那个 Agent。跨仓：等后端发版、人 `repin` 之后，消费仓 Agent 才用新字段。

写盘前若接了 SemanticAnchor：先投影，再 `bind` / `verify_usage`（投影本身不是抛锚）：

```bash
npx anchor constraints --from contracts/order.pin.json -o constraints.json
```

### 2. 没有 OpenAPI：从代码起草，人确认一次

只扫**已经圈定**的一个模块，不要扫整个仓：

```bash
npx anchor init --from-code path/to/one-module -o constraints.json
```

停下。把起草稿给**人**看，按这条判：留会跨进程传的名字（HTTP JSON key、SQL 列名、MQ payload、存储字段），删函数名、局部变量、类型名、框架词，以及只在一个文件出现过的名字。拿不准就删。

其它仓只 `check` 这一份，不要再起草。新字段先改这一份并由人确认，再写代码。

不要按用户这句话往 `units` 里加字段。

## 收紧

```bash
npx anchor check --contract contracts/order.pin.json --src src --strict --require-hash
# 或 Path B：
npx anchor check --contract constraints.json --src src
```

人不用指定某一个 `.java` / `.vue`。CI 用 `--src src`。看未提交改动才加 `--changed`。

默认 drift-only（只拦近义词）。合主干的消费仓用 `--strict`。

## 禁止

- 从 PRD / 工单 / 人话撰写或追加 `constraints.json` 的 unit
- 为了绿灯改契约 `id` 去迁就已经漂了的代码
- 为了绿灯 `repin`、回退 pin、或手改 pin 里的 `hash` / `version`
- 对全仓 `init --from-code`
- 让人手工填某个源文件当 `--src`
- 用 `anchor check` 冒充抛锚，或把 `constraints --from` 说成抛锚
