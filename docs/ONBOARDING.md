# quilt-pincher — Agent Onboarding
> Zero-shot entry point. Clone → competent in ~10 minutes.

## Identity (2 sentences)
quilt-pincher is a **reflex engine built entirely from Quilt cells**: pinch in (a trigger string), match against a vector store of learned reflexes, execute — no LLM on the hot path, zero marginal cost per hit, designed for <50 ms. The same engine targets three tiers (cloud, workstation, ESP32), and a real production synapse already exists: it serves zeroclaw reflex specs (FB2) over a CLI with a hash-only stats ledger (FB3).

## Why it exists (the fleet problem it solves)
The principal's pincher concept — reflexes instead of agent loops for hot, repeated operations — was rewritten from the ground up as Quilt cells (waves 63-65; the wave-66 journal task 66-c decomposed it into 5 ideas / 18 parts / 10 gates). Decomposing the engine into cells buys Quilt's superpowers for free: federation (a laptop reflex DB mirroring a cloud one), subscription, tensors (high-traffic reflexes near the agent), audit, and content-addressed persistence. Waves 68/69 hardened it into something real: the HDC/ExoJ binding layer (FB1, PR #15) gave it a deterministic, model-free embedder with field-conditioned retrieval; the zeroclaw synapse (FB2, PR #17, fix #18) gave it an honest producer — the `zeroclaw` Python tool files reflex specs, pincher serves them FAST-tier with zero tokens; and the receipts-grade CI (PR #16) pins the whole HDC layer to a named determinism canary so a seeded hypervector corpus can never silently drift.

## Verify it works (exact commands)
The repo ships no `node_modules` (zero runtime deps; devDeps via `package-lock.json`), so either install or borrow a sibling's `tsx` (the fleet-proven trick from task 66-c):

```bash
git clone https://github.com/SuperInstance/quilt-pincher && cd quilt-pincher
npm install                       # devDeps only (typescript, tsx, @types/node, eslint)
npm test                          # 35/35 across 13 suites (reflex, hdc, fb3-ledger, zeroclaw-synapse)
npm run typecheck                 # strict tsc, clean (needs @types/node from the install)
npx tsx test/hdc-spine.mjs        # the determinism spine — MUST print
# spine 51b6d1e1261a99fa2306b95115f250bddb30a9a8506090858328e7c1eee99483 (corpus=16 fields=4 dim=1024)
```

Verified during this documentation wave: 35/35 tests pass and the spine hash
matches the CI pin exactly (run with the sibling `tsx` at
`quilt-playtest/node_modules/.bin/tsx`; `npm test` is the same command once
`npm install` has run). A serve round-trip with the zeroclaw fixture:

```bash
echo "order:fleet-seeds-last3-scout-delta
read the 3 most recent scout reports and file a delta
context-sha256:face0000000000000000000000000000000000000000000000000000000000babe" > /tmp/trigger.txt
npx tsx src/cli/serve.ts --trigger-file /tmp/trigger.txt --spec-dir test/fixtures
# → exit 0, payload JSON on stdout (the fixture spec round-trips, ~2-3 ms measured)
```

## Reading order (paths, not vibes)
1. `src/core/types.ts` — the whole vocabulary: `Pinch`, `Reflex`, `PinchResult`, `Embedder`, `ReflexStore`, `Compiler`, `Veto`, `NailBundle`.
2. `src/core/engine.ts` — the three-tier router (0.80 hit / 0.55 confirm), veto gate, confidence law, execution timeout, and the disclosed unsandboxed eval.
3. `src/cells/sheet.ts` — the 6-cell sheet descriptor (pinch/match/execute/veto/compile/store).
4. `src/hdc/hypervector.ts` + `exoj-field.ts` + `hdc-embedder.ts` — FB1: ±1 Int8Array algebra, the γ/η/Δ/ι field encoding, and the model-free embedder.
5. `src/cli/serve.ts` + `src/adapters/zeroclaw-spec.ts` — FB2/FB3: the real synapse, exit-code contract, and the two-ledger loop.
6. `test/hdc.test.ts` + `test/hdc-spine.mjs` — what determinism means here and how it is pinned.
7. `.github/workflows/ci.yml` — the receipts-grade gate order (spine → suite → build-and-pack).

## The things that will bite you (gotchas)
- **`execute()` is an unsandboxed eval by its own comment.** `new Function('pinch', ...)` runs the reflex action with full Node privileges; the timeout is `Promise.race`, which does NOT kill a stuck async child. The veto checks safety *hints*, not real capabilities. Never feed untrusted reflexes into this engine.
- **Several "production" paths are honest stubs**: `allReflexes()` returns `[]` (so `exportNail` yields empty bundles), `SqliteReflexStore` wraps memory and does not persist (`TODO: persist to sqlite`), `CloudflareAIEmbedder` falls back to the hash embedder ("in production this would call the REST API"), and the no_std Rust ESP32 port exists only as `docs/ESP32_PORT.md` — there is no `src/port/no_std/` in the tree despite `esp32.ts`'s header mentioning one.
- **The README quick start is aspirational**: it imports `@quilt/core`/`@quilt/sdk` which are NOT dependencies of this repo (`dependencies: {}`), and `npm install @quilt/pincher` presumes an npm publish that is configured (fail-closed publish workflow) but not receipted as done. The runnable surface is what is in `src/` — `PincherEngine`/`PincherSheet` run standalone with no Quilt runtime needed.
- **The HDC spine is load-bearing.** The whole embedding layer is string-seeded (`fnv1a-64` → `mulberry32`); any change to dimension, seed grammar, or the thermometer must update `SPINE_SHA256` in BOTH workflows IN THE SAME COMMIT, or CI fails by design. The zero-amplitude role-absence rule in `encodeField` (2026-10-03 cross-role decorrelation pin) is subtle — read its comment before touching the field encoder.
- **Cache-integrity law of the synapse**: raw engine recall is FUZZY (cosine similarity, by design); `serve` additionally enforces exact `context_sha256` equality before serving a spec, because zeroclaw re-checks the digest before trusting a payload. Do not "fix" the fuzziness — the exactness lives at the serve boundary on purpose.
- **`npm test` requires tsx**; on a bare checkout without `npm install` you get a runner-not-found error, and `node --test` directly will not compile TypeScript. Borrow the sibling binary or install.
- **`CODEOWNERS` references `/packages/core/src/` etc. — paths that do not exist in this single-package repo** (copied from a monorepo template). The effective rule is only the `* @SuperInstance` default.

## Where deeper knowledge lives
- Knowledge map: [docs/KNOWLEDGE-MAP.md](./KNOWLEDGE-MAP.md)
- Fleet journal: SuperInstance/superinstance-lab → worklog.md (grep `quilt-pincher`; task 66-c is the deep-read, 67-p the credential-sweep note)
- `docs/ESP32_PORT.md` — the no_std Rust port design (documented, not yet in-tree)
- `.github/workflows/` — the receipts-grade CI/publish gates with the pinned spine hash
- PR history (#9-#19) — the FB1/FB2/FB3 arc and the dependabot trail
- Related: `pincher` (the upstream concept, Rust-native), `zeroclaw` (fleet-seeds `tools/zeroclaw` — the reflex producer this synapse serves), `fleet-seeds` (lode §4 semantics cited by `hypervector.ts`), `quilt`-family repos (`@quilt/core`-shaped sheet vocabulary)

## Current frontier (what is open right now)
- **Real embedding adapters**: `CloudflareAIEmbedder` is a stub; wiring the actual `@cf/baai/bge-small-en-v1.5` call is open.
- **Persistence**: `SqliteReflexStore` does not persist; workstation tier has no durable reflex DB yet.
- **`.nail` honesty**: `exportNail` returns empty bundles (`allReflexes()` stub) and `buildNail` depends on the store's optional `all()` — the ESP32 bundling story is designed, not proven.
- **Sandboxing**: the veto/safety model checks hints; a real sandbox (wasm/docker) for `execute()` is the named production gap.
- **The ESP32 no_std Rust port**: specified in `docs/ESP32_PORT.md` (heapless, 256-reflex static store), not present in the repo.
- **npm publication**: the fail-closed publish workflow exists; an actual published `@quilt/pincher` is unverified (no receipt either way).
