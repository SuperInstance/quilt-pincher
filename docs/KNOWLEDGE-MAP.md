# quilt-pincher — Knowledge Map
> The index of indexes: everything deeper than the README, mapped.

## In this repo
- `src/core/types.ts` — the vocabulary (118 lines): Pinch, SafetyHints, Reflex,
  PinchResult (5 kinds), Embedder, ReflexStore, Compiler, Veto, PincherConfig,
  NailBundle.
- `src/core/engine.ts` — PincherEngine (tier router, veto gate, confidence
  law, `execute` via `new Function` + `Promise.race` timeout, `bumpHit`),
  HashEmbedder (char-histogram fake), DefaultVeto (safety-hint comparison).
- `src/cells/sheet.ts` — PincherSheet(): the 6-cell descriptor (pinch formula,
  match program, execute program, veto listener, compile ai, store
  vector_store) + `runPinch`.
- `src/hdc/hypervector.ts` — FB1 substrate: ±1 Int8Array, `randomHV`
  (fnv1a-64 → mulberry32), `bind`/`unbind` (⊗), `bundle` (+, sign-of-sum,
  parity tie-break), `permute`/`permuteInverse` (ρ), `cosine`, `seedHash`.
- `src/hdc/exoj-field.ts` — ExoJ field encoding: {γ,η,Δ,ι} ∈ [0,1] → LEVELS=8
  thermometer → role-bound bundle; zero field = ones identity; zero amplitude =
  role absent (the 2026-10-03 decorrelation pin).
- `src/hdc/hdc-embedder.ts` — HDCEmbedder: `HV(text) = Σ_i ρ^i(token_i)` with a
  per-token cache; the model-free embedder of the synapse.
- `src/adapters/memory-store.ts` — MemoryReflexStore (brute-force cosine,
  ≤~10K-reflex sweet spot per its own comment, optional `upstream`
  federation), plus its `all()` used by `buildNail`.
- `src/adapters/embedding-adapter.ts` — CloudflareAIEmbedder (STUB → hash),
  OfflineEmbedder, QuiltAIEmbedder (delegate injection).
- `src/adapters/zeroclaw-spec.ts` — `loadZeroclawSpecs`/`parseZeroclawSpec`:
  zeroclaw-reflex-spec/v1 → Reflex; payload wrapped as a DATA literal;
  `context_sha256` eligibility filter.
- `src/platforms/cloud.ts` / `workstation.ts` / `esp32.ts` — the three tiers;
  cloud injects embedder/compiler/federation; workstation carries the
  SqliteReflexStore stub; esp32 carries ESP32Engine, `loadNail` (re-embeds on
  device), `buildNail`.
- `src/cli/serve.ts` — the synapse CLI: `serveOnce`/`main`, the 0/4/5/1/2 exit
  contract, `ServeStatsRow` + ledger append + summarizer (FB3).
- `test/` — reflex.test.ts, hdc.test.ts, zeroclaw-synapse.test.ts,
  fb3-ledger.test.ts (35 cases / 13 suites), hdc-spine.mjs (the canary),
  fixtures/zeroclaw-spec.example.json (a complete conforming spec).
- `.github/workflows/ci.yml` + `publish.yml` — receipts-grade gates; pinned
  `SPINE_SHA256 51b6d1e1…`; node matrix 20/22/24; fail-closed tag-triggered
  publish with `--provenance`.
- `docs/ESP32_PORT.md` — the no_std Rust port design (heapless, 256-reflex
  static store; no Rust code in-tree).
- `SECURITY.md`, `CODEOWNERS`, `LICENSE` (Apache-2.0), `.editorconfig`,
  `.eslintrc.cjs`, `tsconfig.json` (strict, noUncheckedIndexedAccess),
  `package.json` (v0.1.0, zero runtime deps), `package-lock.json`,
  `assets/splash.png`, `examples/devops-bot.ts`.

## Pre-existing docs (before wave-69)
- `README.md` — the concept pitch: engine-as-cells, the three-tier table, the
  ASCII architecture, install/quickstart (aspirational: imports `@quilt/core`),
  the `.nail` bundle story, and the ecosystem map. Wave-69 appended only the
  Documentation section. Truth note: its quick start and `npm install
  @quilt/pincher` line are ahead of the tree (see ONBOARDING gotchas).
- `docs/ESP32_PORT.md` — the no_std port spec (Cargo.toml sketch, sample
  `#![no_std]` usage, flash-size estimate 100KB-1MB).
- `SECURITY.md` — vulnerability reporting process and the cell trust model
  (pure / sandboxed / trusted; "never load a sheet from an untrusted source").
- `CODEOWNERS` — `* @SuperInstance` default; the `/packages/...` rules
  reference paths that do not exist in this repo (monorepo template residue).
- PR history #9-#19 — the FB1/FB2/FB3 arc, the CI pipeline PR, dependabot
  trail (each PR message is a mini-receipt).

## In the fleet
- **zeroclaw (fleet-seeds `tools/zeroclaw`, Python)** — downstream producer
  (uses this engine via the spec format): files reflex specs after LLM runs;
  re-checks `context_sha256` before trusting served payloads; owns the
  learning side of the loop.
- **fleet-seeds** — upstream reference: `hypervector.ts` cites "fleet-seeds
  lode 2026-10-03 §4" for the HV semantics; the example fixture's `cites[]`
  reference real fleet tips (`tip:b92d3cd2…` is the erised-ft1 tip anchored in
  quilt-tip-notary — a concrete cross-organ link).
- **pincher (SuperInstance/pincher)** — upstream: the original concept
  (Rust-native); this repo is the from-the-ground-up Quilt-cell rewrite.
- **Quilt family** (`@quilt/core|sdk|ai|rag|elf`, quilt-jev-toolkit) — the
  intended runtime: sheet vocabulary, FederatedArtifactStore persistence, LLM
  compiler cells, audit elves. Not wired in-repo (zero dependencies); the
  `PincherCell` descriptor and the `QuiltAIEmbedder` delegate are the seams.
- **pong-quilt / quilt-c** — CI pollination sources: the receipts-grade
  pipeline and fail-closed publish patterns were adopted from them (per
  workflow comments, 2026-10-03).
- **quilt-playtest (local sibling)** — practical dependency at dev time: its
  `node_modules/.bin/tsx` is the fleet-proven way to run the suite without an
  install (task 66-c did the same).
- **superinstance-lab** — journal of record for this repo's fleet history.

## In the journal
Grep `SuperInstance/superinstance-lab → worklog.md` for `quilt-pincher`:
- **66-c** (wave 66) — the swarm-family decomposition: full source read
  (engine tier router 0.80/0.55, veto gate, confidence law, 5s race,
  unsandboxed-eval disclosure, allReflexes stub, sheet 6-cell descriptor,
  embedder ladder, esp32 buildNail/loadNail); SMOKE `tsx --test test/*.test.ts`
  → 12/12 (borrowed sibling tsx, repo ships none); decomposition JSON with
  5 ideas / 18 parts / 10 gates; honest negatives recorded: exportNail returns
  empty bundles, unsandboxed execute, no node_modules.
- **67-p** (wave 67) — push-readiness credential sweep: an embedded (dead,
  revoked — verified 401) token found in pincher's subrepo config, extracted
  names-only, remote URL scrubbed to clean https; receipted, not hidden.
- PR-level history lives in the repo itself (not yet in the worklog): FB1
  (#15), FB2 (#17, #18), FB3 (#19), CI (#16), dependabot (#9, #12, #14).

## Receipts of record
This repo keeps no `receipts/` directory; its proof surface is:
- The test suite itself — 35/35 green on Node v24.21.0 (verified this wave);
  CI additionally runs the Node 20/22/24 matrix.
- `test/hdc-spine.mjs` output vs the pinned `SPINE_SHA256` — verified matching
  this wave (`51b6d1e1261a99fa2306b95115f250bddb30a9a8506090858328e7c1eee99483`,
  corpus=16 fields=4 dim=1024): the determinism receipt, re-derivable by
  anyone, anywhere, forever.
- `test/fixtures/zeroclaw-spec.example.json` + the serve round-trip — the
  synapse receipt (hit → payload with `origin_row` back-pointer; foreign
  trigger → exit 4).
- Journal entries 66-c/67-p (above) — the fleet-level records, including the
  named negatives.
Unverified items, stated plainly: the `<50 ms` headline (design target; ~2-3 ms
measured only on the fixture in this container), any npm publication of
`@quilt/pincher`, the ESP32 port's existence, and all three-tier persistence
claims.

## How to search further
```bash
# every stub / honest limitation disclosed in code
grep -rn "In production\|For demo\|TODO\|would be sandboxed" src/
# the determinism-critical surfaces (anything that changes the spine)
grep -rn "randomHV(\|seedHash\|mulberry32\|LEVELS\|DIM" src/hdc/
# the synapse contract (exit codes, ledger law)
grep -n "exitCode\|exit_code\|context_sha256\|appendLedgerRow" src/cli/serve.ts src/adapters/zeroclaw-spec.ts
# where the README outruns the tree (aspirational imports)
grep -n "@quilt/" README.md src/ -r
# fleet journal history
grep -n "quilt-pincher" /home/z/my-project/worklog.md
# re-derive the determinism receipt
npx tsx test/hdc-spine.mjs   # must equal the SPINE_SHA256 pinned in .github/workflows/*.yml
```
