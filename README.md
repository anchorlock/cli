# Anchorlock

**Consumer repos check field names against a pinned OpenAPI — not a list the coding agent wrote.**

Think: ESLint for API field names at merge. The spec comes from the **backend tagged artifact**. Same-repo Java/TS that the compiler already checks is not the point.

| | When | Command |
|---|---|---|
| **Haul** | Before merge in the **frontend / client / test** repo | `anchor check --contract pin.json --src src --strict --require-hash` |
| **Cast** | Agent about to write a file | SemanticAnchor MCP: `bind` / `verify_usage` on a `constraints.json` **projected from that same OpenAPI** |
| Project | Prepare the file for cast | `anchor constraints --from pin.json` — this is **not** the cast |

Do not invent `constraints.json` from a PRD. The agent that writes the list is the agent that writes the code; that is not a lock.

- Product page (Chinese): [`public/index.html`](./public/index.html)
- CLI guide (Chinese): [`docs/usage.md`](./docs/usage.md)

## Path A (default) — you already have OpenAPI

Backend **build-exports** `openapi.json` (Springdoc / Nest / FastAPI). Tag a release. Do not hand-write the spec. Do not point at a live `/v3/api-docs`.

In the **consumer** repo, once:

```bash
npm i -D @anchorlock/cli
npx anchor init    # agent skill only — no field list
```

Pin the tagged download URL (not a git clone of the backend):

```bash
npx anchor pin --from dist/openapi.json \
  --url https://…/releases/v1.4.0/openapi.json --tag v1.4.0 \
  -o contracts/order.pin.json
npx anchor check --contract contracts/order.pin.json --src src --strict --require-hash
```

`orderId` / `order_sn` vs spec `order_no` → **red**. Same name as the spec → **green**. Fix the code, not the pin.

| `--contract` | What it is |
|---|---|
| `openapi.json` | Local copy of the spec |
| `https://…/openapi.json` | Tagged release artifact (pass `--hash`) |
| `order.pin.json` | `{ url, hash, version, path }` — `check` uses `path` if that file is still on disk; otherwise it downloads `url` |

Copy [`ci/check-contract.github.yml`](./ci/check-contract.github.yml) into the consumer repo.

### Second round — the backend shipped a new tag

Field scope moves when the **backend releases**, not when you and the agent talk about a ticket. Never hand-add a field to the pin; swap the whole thing:

```bash
npx anchor repin --from ../order-api/dist/openapi.json --tag v1.5.0 --change PROJ-123
git diff contracts/order.pin.json    # version + hash changed
npx anchor check --contract contracts/order.pin.json --src src --strict --require-hash
```

`repin` keeps the existing `url` (swapping the tag inside it) and `change`, recomputes the hash, and overwrites without `--force`. Every `check` prints what you are locked to:

```
  pin   v1.5.0 · change PROJ-123
```

History is `git log contracts/order.pin.json`. A coding agent must never `repin` to turn a red gate green — that is the human's call, driven by a release.

### Several agents (not a third path)

Same pin, same check. More agents does not mean more contracts. Backend ships a tagged OpenAPI; a human `repin`s; frontend / client / test agents only change source. Paste FAIL to the agent that drifted. Do not let each agent draft its own list.

Need SemanticAnchor? Project, then point SA at the file:

```bash
npx anchor constraints --from contracts/order.pin.json -o constraints.json
```

## Path B — no OpenAPI yet

Draft **once** from a **narrow** tree. A human confirms ids. Other repos only `check` that file.

```bash
npx anchor init --from-code path/to/one-module -o constraints.json
# human deletes junk, confirms id / aliases
npx anchor check --contract constraints.json --src src
```

Keep names that cross a process boundary (HTTP JSON keys, SQL columns, MQ payloads, stored fields). Delete function names, locals, type names, framework words, and anything seen in a single file. When unsure, delete: a missing lock costs you nothing, a wrong lock makes CI demand changes to correct code.

Do not `init --from-code` in every repo. Two drafts (`orderStatus` vs `order_status`) both go green and still disagree at runtime.

## What this is not

| Not this | Use instead |
|---|---|
| Shape / enum values at write time | SemanticAnchor `verify_usage` |
| Demand-repo authoring / compile / pack | `@keelforge/spec-forge` |
| A field list the coding agent wrote from the ticket | Path A pin, or Path B + **human** confirm |
| Company defaults, design tokens | `@guosen-osdd/osdd-spec-cli` |

## Install

Node.js 18+. Kernel: `@keelforge/spec-forge` ≥ 0.5.19.

```bash
npm install -D @anchorlock/cli
npx anchor --help
```

```bash
npm run preview   # product page → http://localhost:4174
```

## License

MIT

## Publish (maintainers)

1. Publish the kernel: in `spec-forge`, `npm test && npm publish --access public`.
2. Here, `npm install` so the dependency resolves from the registry, then `npm test && npm publish --access public`.
