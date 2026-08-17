---
name: anchorlock
description: >-
  Orchestrates AnchorLock field-name lock for AI coding. Use when implementing a
  feature, generating APIs/DTOs/fixtures, or the user mentions AnchorLock,
  constraints.json, orderId vs order_no, 字段名, or field drift. The human states
  the task; this agent writes the contract, writes the code, and runs the gate.
  Never ask the human to hand-edit field JSON.
---

# AnchorLock · Agent 串流程

人只说这次做什么（一句话、工单、PRD 片段）。**不要让人打开 `constraints.json` 改字段。**

两下钉锚，不要混：

| 叫法 | 何时 | 你要跑的命令 |
|---|---|---|
| **收紧** | 交付 / 合主干前 | `npx anchor check --contract constraints.json` |
| **抛锚** | 写每个文件之前 | SemanticAnchor MCP：`bind` / `verify_usage`（吃同一份 `constraints.json`） |
| 投影 | 有 OpenAPI、要给抛锚准备文件 | `npx anchor constraints --from <openapi或pin> -o constraints.json`（这一步本身不是抛锚） |

## 顺序（必须按这个走，写代码之前先有名单）

1. **收意图**  
   从用户消息 / 附件 PRD / 已有 OpenAPI 抽出这次的业务对象（订单号、支付流水…）。没有意图就问一句「这次要锁哪几个业务对象」，问完立刻写名单，不要停在聊天里等人改 JSON。

2. **写或更新 `constraints.json`**（仓库根，Agent 落盘）  
   - 已有 OpenAPI：`npx anchor constraints --from <openapi.json> -o constraints.json`，不要另编名字。  
   - 没有：按下面形状写出。每个业务对象一个 `id`（snake_case），把驼峰、下划线近义词、中文叫法全部放进 `aliases`。  
   - 已有文件：只**追加**这次的 unit，或改 aliases；不要为了让 check 变绿而改 `id` 去迁就错误代码。

```json
{
  "schemaVersion": "1",
  "units": [
    {
      "id": "order_no",
      "type": "string",
      "provenance": "declared",
      "aliases": ["orderId", "order_sn", "订单编号", "单号"]
    }
  ]
}
```

3. **写代码只用 `id`**  
   字段、JSON key、列名、fixture key 都用 `order_no`，不要用 aliases 里的词。

4. **收紧：跑闸**  
   `npx anchor check --contract constraints.json`  
   （默认 drift-only：只拦名单上的近义词，不用猜文件。）

5. **红了改代码，不改名单**  
   `"orderId" should be "order_no"` → 把代码改成 `order_no`。  
   只有用户明确说「规范名要改」才动 `id`。新字段：先加 unit，再写代码，再 check。

6. **抛锚（若仓库已接 SemanticAnchor）**  
   写盘前跑 MCP `bind` / `verify_usage`，指向同一份 `constraints.json`。不要用 `anchor check` 冒充抛锚，也不要把 `constraints --from` 说成抛锚。

## 禁止

- 让用户手工改 `constraints.json`
- 对全仓 `init --from-code` 当需求范围
- 先写代码后补名单
- 为了绿灯把 `id` 改成代码里已经飘了的名字
