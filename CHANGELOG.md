# Changelog

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
