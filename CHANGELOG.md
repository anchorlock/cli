# Changelog

## 0.2.0

- Kernel is now `@anchorlock/core` >= 0.6.0 (was `@keelforge/spec-forge`). A sibling `anchorlock-core` checkout is used first when present.
- `npm test` works on Windows and on Node 22+.

## 0.1.9

- Docs: several coding agents is not a third path. Share one pin and one check; field scope still moves only when the backend releases.
- Product page: `#start` is a long section; the 16% intersection reveal left it invisible and left a blank footer. Content is visible by default; multi-agent is its own section.

## 0.1.8

- `anchor repin --from <new openapi.json> --tag vX.Y.Z`: swap the whole pin when the backend ships a release. Keeps the existing `url` (tag substituted) and `change`, recomputes the hash, no `--force` needed, warns when the artifact is byte-identical.
- `anchor pin --change <id>` records which requirement moved the contract; `check` prints `pin   v1.5.0 · change PROJ-123` so nobody has to open the file.
- Docs answer the second round: field scope moves when the backend releases, never by hand-editing the pin. Agents must not repin to turn a red gate green.
- Path B drafts state what to keep (names crossing a process boundary) and what to delete (functions, locals, types, single-file names).

## 0.1.7

- FAIL output tells humans to fix code (not the pin) and paste the log to the coding agent.
- Product page LIVE CHECK matches FAIL/PASS plus the next hint; Path A check commands include `--strict --require-hash`.
- `--strict` ignores identifiers used only as function calls or declarations (`lookupMine()`, `encodeURIComponent()`), so FAIL lists field names an agent can actually fix.
- Path A (pinned OpenAPI in the consumer repo) is the product. `anchor init` installs the skill only and does not write a field list.
- Agents must not author `constraints.json` from a PRD. Path B is draft-from-code plus a human confirm.
- Consumer CI snippets use `--strict --require-hash`.

## 0.1.6

- Check always prints `scan` (path + file count). Humans use `--changed` (git edits); do not pick a single source file.
- `--src` is for CI / Agent only.

## 0.1.5

- `anchor check --src` no longer switches to undeclared mode. `--src` is scan root only; `--strict` is the full gate.

## 0.1.4

- `anchor init` writes empty `units: []`. Demo field names stay in `anchor demo`, not in a real repo.

## 0.1.3

- `anchor check` maps `units[].aliases` to the unit `id` (`orderId` / `order_sn` / quoted `单号` → `order_no`).
- `anchor demo` (and `npm run demo`) is that story: red then green.
- `pin.json` includes `path` so check can run offline when the artifact is still on disk.
- CI snippets: `ci/check-contract.github.yml` / `ci/check-contract.gitlab.yml`.
- `anchor pin --from openapi.json --url … --tag vX.Y.Z` writes `pin.json` (sha256).
- Kernel: `@keelforge/spec-forge` >= 0.5.19.

## 0.1.2

- Two onboarding paths: have OpenAPI (pin + `check`) or scan code (`anchor init --from-code` → `constraints.json`).
- `anchor constraints --from <openapi|url|pin.json>` projects OpenAPI → `constraints.json` for SemanticAnchor.
- `anchor init --from-code` drafts `constraints.json` from source (aliases included). Blank template is `constraints --init` only.
- Kernel: `@keelforge/spec-forge` >= 0.5.17.

## 0.1.1

- `anchor check --contract` accepts a tagged OpenAPI URL or `pin.json` (`url` + `hash` + `version`).
- `--hash sha256:…` / `--require-hash`. Frontend pins the release artifact; does not clone the backend repo.

## 0.1.0

- First wedge: `anchor check` and `anchor init --from-code` (draft).
- Kernel: `@keelforge/spec-forge` >= 0.5.15 (`checkNames` / `draftIds`).
- No compile / pack / demand-repo commands.
