# Anchorlock

**Keep AI-generated code faithful to your contract — lock field names across repos and agents.**

Think: ESLint for AI contract conformance. Bring your own spec.

Two moments, one contract:

| | When | Command |
|---|---|---|
| **Cast the anchor** | Agent about to write a file | SemanticAnchor MCP: `bind` / `verify_usage` |
| **Haul the line** | Before merge | this CLI: `anchor check --contract … --src src` |

`anchor constraints --from` is **not** casting. It only projects `constraints.json` so SemanticAnchor has something to bind.

Ask one question: **do you already have an OpenAPI spec?**

| | Path A · yes | Path B · no |
|---|---|---|
| Contract | tagged `openapi.json` (pin the download URL) | one `constraints.json` drafted from code |
| Haul (`anchor check`) | `--contract pin.json --src src` | `--contract constraints.json --src src` |
| Cast (SemanticAnchor `bind` / `verify_usage`) | project first: `anchor constraints --from pin`, then point SA at that file | same `constraints.json` |

- Product page (Chinese): [`public/index.html`](./public/index.html)
- Full CLI guide (Chinese): [`docs/usage.md`](./docs/usage.md)

**Start in your repo (once):**

```bash
npm i -D @anchorlock/cli
npx anchor init      # agent skill (.cursor / .claude + AGENTS.md) + starter contract
```

Then tell your coding agent what to build, in plain language:

> 实现订单查询，锁住订单号，别名 orderId / order_sn

The skill makes the agent write `constraints.json`, code with the canonical `id`, and run
`npx anchor check --contract constraints.json` before finishing. Red means a listed synonym
appeared; the agent fixes the code, not the list. Other field names are ignored until `--strict`.

```bash
# Later — Path A (you already have openapi.json)
npx anchor pin --from dist/openapi.json --url https://…/openapi.json --tag v1.4.0
npx anchor check --contract contracts/order.pin.json --src src --require-hash
```

`orderId` / `order_sn` vs contract `order_no` → **red**. Same name as the contract → **green**.

This CLI checks **field names** at merge. Structure and enum values live in the same `constraints.json` for SemanticAnchor (`bind` / `verify_usage`).

```bash
npm run preview   # product page → http://localhost:4174
```

---

## Install

Node.js 18+. Kernel: `@keelforge/spec-forge` ≥ 0.5.19 (publish that first).

```bash
npm install -D @anchorlock/cli
npx anchor init
```

This repo, before publish:

```bash
cd anchorlock-cli && npm install
npx anchor --help
```

---

## CLI reference

### Path A — `anchor check --contract <file|url|pin.json> --src <dir>`

You already have OpenAPI (exported by the backend build — do not hand-write it). Pin the tagged release artifact and scan.

```bash
anchor pin --from dist/openapi.json --url https://…/releases/v1.4.0/openapi.json --tag v1.4.0
```

| `--contract` | What it is |
|---|---|
| `openapi.json` | Local copy of the spec |
| `https://…/openapi.json` | Tagged release artifact (pass `--hash`) |
| `order.pin.json` | `{ url, hash, version, path }` — pin the artifact. `check` uses `path` if that file is still on disk; otherwise it downloads `url` |

Do **not** point at a live `/v3/api-docs`.

**Cast (write-time, SemanticAnchor — not this CLI):** `bind` / `verify_usage` need `constraints.json`. Project it from the same OpenAPI; this step is not the cast itself:

```bash
anchor constraints --from contracts/order.pin.json -o constraints.json
```

**Flags:** `--hash sha256:…` · `--require-hash` · `--json` / `--format json` · `--src` may be a file.

**What fails:** a name that is an alias of a contract id (`orderId` → `order_no`, including quoted `单号`); camelCase that folds to a contract snake_case (`orderNo` → `order_no`); field-like names not on the list. Types (`OrderCard`), hooks (`useOrder`), and generic tokens (`id`, `name`, `status`) are ignored.

### Path B — `anchor init --from-code <dir>`

No OpenAPI, but you have code. Scan once; do **not** hand-fill a blank template.

```bash
anchor init --from-code src          # drafts constraints.json
# delete units you do not want to lock
anchor check --contract constraints.json --src src
```

The file is a **DRAFT** until you confirm it. Other repos only `check` this file — do not init again.

No code at all? `anchor constraints --init` writes an empty template. That is the exception.

### CI

Copy [`ci/check-contract.github.yml`](./ci/check-contract.github.yml) or [`ci/check-contract.gitlab.yml`](./ci/check-contract.gitlab.yml).

```bash
npx @anchorlock/cli check --contract contracts/order.pin.json --src src --require-hash
```

---

## What this is not

| Not this | Use instead |
|---|---|
| Shape / enum values at merge | SemanticAnchor `verify_usage` — same `constraints.json` |
| Demand-repo authoring / compile / pack | `@keelforge/spec-forge` (advanced) |
| Company defaults, design tokens, Excel export | `@guosen-osdd/osdd-spec-cli` |
| Cast (write-time) | SemanticAnchor `bind` / `verify_usage` — not `anchor check` |
| Project OpenAPI → `constraints.json` | `anchor constraints --from` — prepares the file for cast; not the cast |

## License

MIT

## Publish (maintainers)

1. Publish the kernel: in `spec-forge`, `npm test && npm publish --access public` (`@keelforge/spec-forge@0.5.19`).
2. In this directory, `npm install` so the dependency resolves from the registry, then `npm test && npm publish --access public`.

