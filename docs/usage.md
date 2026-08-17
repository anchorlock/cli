# Anchorlock CLI 使用说明

包：`@anchorlock/cli` · 命令：`anchor`  
本包装的是**收紧**：合并前的 `anchor check`。**抛锚**是写盘前的 SemanticAnchor MCP（`bind` / `verify_usage`），吃 `constraints.json`。两下钉同一份契约。`anchor constraints --from` 只是从 OpenAPI 投影出那份文件，它本身不是抛锚。

需要 **Node.js 18+**。内核来自 `@keelforge/spec-forge` ≥ **0.5.19**。本机若与 `spec-forge` 仓库同级，会优先用 `../spec-forge`。

---

## 0. 上手（先做这个）

不需要需求仓，不用手改 JSON，不必猜文件。`init` 只跑一次。之后流程由你的 AI 编码代理串起来，人只做两件事：说这次做什么、对名单点头。

```bash
npm i -D @anchorlock/cli
npx anchor init
# 写入 .cursor/skills + .claude/skills + AGENTS.md + 示例 constraints.json
```

然后对你的 AI 说人话：

> 实现订单查询，锁住订单号，别名 orderId / order_sn

装好的 skill 会让 Agent 自己完成：起草 `constraints.json`（在对话里列给你确认）→ 用规范名 `id` 写代码 → 交付前跑 `npx anchor check --contract constraints.json`。红了 Agent 改代码，不改名单。

合主干要「不在名单里也失败」时：`anchor check --contract constraints.json --src src --strict`。

有 OpenAPI 再走路 A（Agent 用 `anchor constraints --from` 投影，不另编名字）。没有就停在这份名单，字段多了让 Agent 往里加。

---

先问自己一句：**有没有现成的接口文档（OpenAPI）？** 有走路 A。没有就用上面那份名单。不要两条一起走。

---

## 1. 安装

尚未发到 npm 时，在本仓运行：

```bash
cd /path/to/anchorlock-cli
npm install
npx anchor --help
```

发布后：

```bash
npm install -D @anchorlock/cli
npx anchor --help
```

---

## 2. 路 A：已有 OpenAPI（推荐）

后端已经有接口说明书。它就是上游真理，**不要再手写一份字段清单**。

### 2.1 钉住发版，再拿说明书对照代码

前端仓只提交 pin。`url` 是发版页上 **openapi.json 附件的 https 下载地址**（不是 git 仓库，不是 `/v3/api-docs`）。

**`anchor check --contract contracts/order.pin.json --src src` 做的事：**

1. 读 pin：去 `url` 拉那一版 `openapi.json`，用 `hash` 核对没下错文件。
2. 从说明书的 schema 属性名抽出契约认的字段（如 `order_no`）。
3. 扫 `--src` 指向的业务目录（一般是 `src/`，不扫 `node_modules`）。代码里写了近义词或说明书上没有的字段名 → 退出码非 0。

pin 只是指针。没有这条 `check`，合进主干时没人对照说明书。红了改代码对齐说明书，不要改 pin。CI 再跑同一条并加 `--require-hash`。

```json
{
  "url": "https://git.example.com/group/order-api/-/releases/v1.4.0/downloads/openapi.json",
  "hash": "sha256:后端发版时算出的64位指纹",
  "version": "v1.4.0",
  "path": "../dist/openapi.json"
}
```

`anchor pin` 会顺便写下相对 `path`。本地还能读到这份文件时，`check` **不联网**；读不到再按 `url` 下载。

```bash
# 对着构建抽出的 openapi.json 算指纹，写出 pin（url 填发版页下载地址）
anchor pin --from dist/openapi.json \
  --url "https://git.example.com/group/order-api/-/releases/v1.4.0/downloads/openapi.json" \
  --tag v1.4.0 -o contracts/order.pin.json

anchor check --contract contracts/order.pin.json --src src
# 本地已有文件时：
anchor check --contract ./openapi.json --src src
```

后端仓打 tag（标签，不是分支），CI 把 `openapi.json` 挂到这次 Release：

```bash
tag="v1.4.0"
git tag "$tag"
git push origin "refs/tags/$tag"
# origin = clone 后的默认远程名，以 git remote -v 为准
```

不要对正在跑的 `/v3/api-docs` 扫。CI 加 `--require-hash`（见本仓 [`ci/`](../ci/)）。后端不必装 npm。

`anchor check` 只拦**字段名**。结构和枚举值在同一份 `constraints.json` 里，给抛锚（SemanticAnchor `bind` / `verify_usage`）用。

### 2.2 抛锚：投影之后交给 SemanticAnchor

抛锚不是 `anchor check`，也不是 `anchor constraints --from`。抛锚 = SemanticAnchor 在写盘前跑 `bind` / `verify_usage`。它吃 `constraints.json`（名字 + 类型 + 枚举 + 形状）。有 OpenAPI 时，先从钉住的说明书投影出这份文件，不要手抄：

```bash
# 投影（给抛锚准备文件，这一步本身不是抛锚）
anchor constraints --from contracts/order.pin.json -o constraints.json
# 或
anchor constraints --from ./openapi.json -o constraints.json
```

然后把 `SA_CONSTRAINTS` 指到这份文件，由 SemanticAnchor 执行 `bind` / `verify_usage`。收紧继续用 `anchor check --contract pin.json --src src`（或同一份 `constraints.json`）。

---

## 3. 路 B：没有 OpenAPI

继续用 §0 那份人手改过的 `constraints.json`。**不要**对整个 `src` 跑 `init --from-code`。

只有在你已经圈定「就这几个目录、人会删掉垃圾名」时，才用起草：

```bash
anchor init --from-code path/to/one-module -o constraints.json
# 打开文件：删掉函数名、框架词；把 id 改成要锁的名字；近义词进 aliases
anchor check --contract constraints.json --src path/to/one-file.js
```

`orderId` 会收成 `id: order_id`，原名进 `aliases`。近义词不会自动合并：要把 `id` 改成 `order_no`，并把 `orderId` / `order_sn` 写进 `aliases`，`check` 才会报「应该写成 order_no」。有枚举再补 `values`。

**不要每个仓都 init 一份。** 前端扫出 `orderStatus`、后端扫出 `order_status`，两份都会绿，联调照样炸。只在一处扫、人确认，其它仓只 `check`。

连代码都没有、要从零发明字段时，才用 `anchor constraints --init`。那是例外。

字段含义见 [constraints.json 协议说明](../../spec-forge/docs/constraints-json-spec.md)（同级仓）或你装到的 `@keelforge/spec-forge` 包内 `docs/constraints-json-spec.md`。

---

## 4. `check` 在查什么

扫 `.js` / `.ts` / `.vue` / `.java` 等，跳过 `node_modules`、`dist`。

| 情况 | 结果 |
|------|------|
| 标识符与契约里某个 `id` 完全一致 | 通过 |
| `orderId` 写在某单元的 `aliases` 里（含源码里的 `"单号"`） | **漂移 · 红**（应对齐 `order_no`） |
| `orderNo` 能折成契约里的 `order_no` | **漂移 · 红** |
| 长得像字段（驼峰或 `foo_bar`）但不在契约里 | **未声明 · 红** |
| `id` / `name` / `status` 等万能词 | 忽略，不红 |

`--json` / `--format json` 时 stdout 为结构化结果，失败仍 exit 1。

---

## 5. 接到 CI

```yaml
# 路 A
- run: npx anchor check --contract contracts/order.pin.json --src src --require-hash
# 路 B
- run: npx anchor check --contract constraints.json --src src
```

门禁挂在 **merge / 主分支保护** 上。Prompt「请统一命名」挡不住下一次生成。

---

## 6. 抛锚和收紧（各对应一条命令）

| | 何时 | 命令 | 吃什么 |
|---|---|---|---|
| **抛锚** | Agent 正在写文件 | SemanticAnchor MCP：`bind` / `verify_usage` | `constraints.json` |
| **收紧** | 合进主干之前 | `anchor check --contract … --src src` | 路 A 的 OpenAPI / pin；或同一份 `constraints.json` |
| 投影（不是抛锚） | 有 OpenAPI、要给抛锚准备文件 | `anchor constraints --from pin.json -o constraints.json` | 钉住的说明书 |

`compile` / `pipeline` / `new-change` 会直接拒绝。那是需求仓进件，不在开源入门路径上。

---

## 7. 常见问题

**每个仓都生成一份名单？**  
不要。路 A 钉同一份发版 OpenAPI；路 B 只扫一次代码，各仓共用这一份 `constraints.json`。

**有 OpenAPI 还要手写 constraints 吗？**  
不要。`anchor constraints --from` 是投影，给抛锚准备文件；它本身不是抛锚。

**抛锚是 `anchor check` 吗？**  
不是。收紧 = `anchor check --contract … --src src`。抛锚 = SemanticAnchor MCP `bind` / `verify_usage`。

**起草扫出一堆函数名？**  
删。`--from-code` 只是候选。

**红了改清单还是改代码？**  
默认改代码对齐契约。新概念先写入契约再写代码。

**想先看闸、不碰仓库：** `npx @anchorlock/cli demo` 或本仓 `npm run demo`（故意红 → 改对齐 → 绿）。上手不必跑这一条。
