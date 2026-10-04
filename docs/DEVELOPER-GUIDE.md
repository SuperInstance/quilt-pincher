# quilt-pincher — Developer Guide
> For developers extending the engine: new adapters, cells, embedders, or
> synapse behavior.

## Code layout

```
src/
  core/types.ts               # the vocabulary: Pinch, Reflex, PinchResult, Embedder, ReflexStore, Compiler, Veto, SafetyHints, NailBundle
  core/engine.ts              # PincherEngine (tier router, veto gate, confidence law, execute/timeout), HashEmbedder, DefaultVeto
  cells/sheet.ts              # PincherSheet(): the engine as a 6-cell Quilt sheet descriptor + runPinch wrapper
  hdc/hypervector.ts          # FB1 substrate: ±1 Int8Array algebra — randomHV (fnv1a→mulberry32), bind ⊗, bundle (+), permute ρ, cosine, seedHash
  hdc/exoj-field.ts           # ExoJ field encoding: {gamma,eta,delta,iota} → thermometer levels → role-bound bundle; zero field = identity
  hdc/hdc-embedder.ts         # HDCEmbedder: token HVs + position permutation ρ^i, bundled; per-token cache
  adapters/memory-store.ts    # MemoryReflexStore: brute-force cosine, optional upstream federation (insert/delete propagate)
  adapters/embedding-adapter.ts # CloudflareAIEmbedder (STUB→hash), OfflineEmbedder (hash), QuiltAIEmbedder (delegate injection)
  adapters/zeroclaw-spec.ts   # loadZeroclawSpecs/parseZeroclawSpec: zeroclaw-reflex-spec/v1 → Reflex (payload as DATA literal)
  platforms/cloud.ts          # cloudSheet(): embedderApi/compilerApi/federation injection points
  platforms/workstation.ts    # workstationSheet() + SqliteReflexStore (STUB: wraps memory, TODO persist)
  platforms/esp32.ts          # ESP32Engine, EmbeddedNail, loadNail (re-embeds intents on device), buildNail
  cli/serve.ts                # THE synapse CLI: serveOnce/main, exit-code contract, FB3 stats ledger + summarizer
  index.ts                    # public re-exports
test/
  reflex.test.ts              # engine behavior (tiers, veto, confidence)
  hdc.test.ts                 # hypervector algebra + field encoding pins
  zeroclaw-synapse.test.ts    # serve round-trip, origin_row passthrough, exact-context law
  fb3-ledger.test.ts          # ledger row shape + summarizer
  hdc-spine.mjs               # THE determinism canary (prints the corpus hash CI pins)
  fixtures/zeroclaw-spec.example.json   # a complete conforming spec
.github/workflows/ci.yml      # gate order: spine → suite (node 20/22/24) → build-and-pack
.github/workflows/publish.yml # tag-triggered, fail-closed, --provenance, NPM_TOKEN secret only
docs/ESP32_PORT.md            # the no_std Rust port design (not in-tree)
examples/devops-bot.ts        # the compile/hit walkthrough demo
SECURITY.md, CODEOWNERS, LICENSE (Apache-2.0), assets/splash.png
```

## Core concepts (named as the code names them)

- **Pinch / Reflex / PinchResult** — a pinch is `{trigger, context?, safety?}`;
  a reflex is `{id, embedding, intent, action, safety, confidence, hits,
  createdAt, lastHitAt, provenance?}`; a result is one of `hit | confirm |
  compiled | vetoed | error` plus `latencyMs`.
- **Tier router** — `run()` embeds the trigger, queries top-5, then routes:
  `score < confirmThreshold (0.55)` → compile (SLOW; error if no compiler);
  `>= hitThreshold (0.80)` → execute directly (FAST, kind `hit`); between →
  confirm + execute (MEDIUM, kind `confirm`). The veto is consulted before
  every execution, including freshly compiled reflexes.
- **Confidence law** — `0.5 + 0.49*log10(1+hits)`, capped 0.99: a reflex starts
  at 0.5 and climbs logarithmically; `bumpHit` runs after each hit/confirm.
- **Sheet (6 cells)** — `pinch` (formula), `match` (program), `execute`
  (program), `veto` (listener), `compile` (ai), `store` (vector_store). The
  sheet is a DESCRIPTOR: `PincherSheet()` wraps a real `PincherEngine`; it does
  not require a Quilt runtime to run.
- **HDC / ExoJ layer (FB1)** — hypervectors are Int8Array of ±1, dim 1024;
  bind ⊗ is elementwise product (self-inverse), bundle + is sign-of-sum
  (statistical), permute ρ is coordinate rotation (exactly invertible), and
  every vector is string-seeded through fnv1a-64 → mulberry32 — deterministic
  across processes, which is what the spine canary pins.
- **ExoJ field conditioning** — `encodeField({γ,η,Δ,ι})` bundles role⊗level
  terms (LEVELS=8 thermometer over [0,1]); zero amplitudes are ABSENT (not
  "level 0" — the decorrelation pin); zero field = the ones vector = identity.
  `conditionEmbedding` sign-binarizes the float query and binds it with the
  field.
- **zeroclaw synapse (FB2/FB3)** — `zeroclaw-reflex-spec/v1` JSON files carry
  `{id, intent, trigger, context_sha256, model, payload{delta_path,
  output_sha256, content, bytes}, cites[], provenance}`; the adapter wraps the
  payload as `return {...};` (DATA, not code); serve enforces exact
  `context_sha256` eligibility and appends hash-only stats rows to a JSONL
  ledger. Serve NEVER compiles — the loop is zeroclaw files → pincher serves.

## How to extend

### Add a real embedder
Implement `Embedder` (`embed(text) → number[]`, `dimensions`) and pass it in
`PincherConfig`, or inject via `cloudSheet({embedderApi})`. To wire the real
Cloudflare BGE call, replace the stub body in `CloudflareAIEmbedder.embed` —
then IMMEDIATELY re-pin the spine: embeddings feed `test/hdc-spine.mjs` via the
HDC layer (the spine pins the HDC corpus, not the float embedder, so a NEW
float embedder does not break the spine — but any change to sign-binarization
widths or the HDC grammar does).

### Add a new platform tier
Copy the `platforms/esp32.ts` pattern: a config factory + a thin engine wrapper
exposing `run`, plus whatever the tier constrains (no compiler, fixed store
capacity, re-embedding on load). Register it in `src/index.ts` exports. The
three tiers share every law; only storage and compiler availability differ.

### Wire persistence (finish the SqliteReflexStore)
`platforms/workstation.ts` holds the TODO. Implement `insert/get/delete/count/
query` against sqlite + sqlite-vec while keeping `MemoryReflexStore` as the
write-through cache, and keep the `upstream` federation semantics of
`MemoryReflexStore` (insert/delete propagate) — the cloud tier's R2 mirror
story depends on that shape.

### Make `.nail` bundles real
Two paths: fix `PincherEngine.allReflexes()` to paginate over the store (it
currently returns `[]` — the honest stub called out in the journal), or use
`buildNail()` in `platforms/esp32.ts`, which goes through the store's optional
`all()`. A bundle is `EmbeddedNail {version, reflexes (no embeddings), builtAt}`;
`loadNail` re-embeds each reflex's `intent` ON THE DEVICE so bundles stay small.
Add a round-trip test to `test/reflex.test.ts`.

### Extend the synapse
Serve-side changes live in `src/cli/serve.ts`; spec-side in
`src/adapters/zeroclaw-spec.ts`. The invariants you must keep: exit codes
(0/4/5/1/2), hash-only ledger rows (`ServeStatsRow` — never payload content),
the exact `context_sha256` eligibility filter, and payload-as-data (never eval
spec content as code beyond the data-literal wrapper). New serve flags go
through `main()`'s `arg()` helper and need a test in `test/zeroclaw-synapse.test.ts`
or `test/fb3-ledger.test.ts`.

## Testing
```bash
npm test                          # tsx --test test/*.test.ts → 35/35 across 13 suites
npm run typecheck                 # strict tsc --noEmit (needs @types/node; clean as of this wave)
npx tsx test/hdc-spine.mjs        # spine 51b6d1e1… (corpus=16 fields=4 dim=1024) — CI pins this exact hash
npm run build                     # tsc → dist/ (the publish gate runs this before anything leaves)
```
Green means: tier routing and veto behavior hold, the HDC algebra is exact
(bind/unbind self-inverse, permutation invertibility, thermometer monotonicity),
the ExoJ field pins (cross-role decorrelation, zero-field identity) pass, the
serve round-trip serves the fixture payload and misses cleanly on foreign
triggers, ledger rows carry hashes only, and the spine hash matches the pin in
BOTH workflow files. Verified 35/35 + spine-match + clean typecheck on Node
v24.21.0 during this wave. The CI matrix additionally covers Node 20/22/24 and
runs build-and-pack; typescript is pinned `^5.9.3` because TS 7.x peer-conflicts
with `@typescript-eslint/parser` 8.70.1 (commented in `ci.yml`).

## Conventions
- **Determinism is a first-class feature** — every seeded structure names its
  seed grammar (`tok:<token>`, `exoj-role:<role>`, `exoj-thermo:base|step:<i>`)
  and the spine canary enforces byte-stable embeddings "in every process
  forever". A legitimate embedding change ships WITH its spine re-pin, same
  commit, stated in the message.
- **Honest stubs are labeled in place** — `SqliteReflexStore` says "For demo,
  fall back to memory"; `CloudflareAIEmbedder` says "In production this would
  call Cloudflare's REST API"; `allReflexes()` says "For a real implementation,
  we'd paginate". Keep that discipline: an unimplemented path says so at the
  site, and the journal (task 66-c) recorded them as named negatives.
- **Strict TypeScript** — `strict: true`, `noUncheckedIndexedAccess: true`
  (hence the `!` assertions on array reads); `moduleResolution: "Bundler"`.
- **Receipts-grade CI** — gate order is deliberate: the named canary first
  (a spine break names THE SPINE, not the suite), then the matrix suite, then
  build-and-pack. Publish is tag-triggered only and fails closed.
- **Secrets** — the publish workflow is the model: `NPM_TOKEN` arrives as a
  repository secret, `--provenance` signs the tarball via GitHub OIDC, and the
  workflow comment explicitly forbids "fixing" an auth failure by committing a
  long-lived token.
- **Commit/PR style** — conventional-ish subjects with the FB (feedback-loop)
  number and PR reference: `fb2: zeroclaw synapse — serve CLI + spec adapter
  (first synapse of the reflex loop) (#17)`; dependabot bumps are merged as-is.

## Gotchas for editors
- **Touch the HDC layer → re-pin the spine in the SAME commit**, in BOTH
  `ci.yml` and `publish.yml`. Changing `seedHash`, `mulberry32`, `LEVELS`,
  `DIM`, role names, or the seed grammar changes every embedding and every
  persisted reflex silently.
- **`encodeField`'s zero-amplitude rule is load-bearing** — a zero amplitude
  means the role is ABSENT from the bundle; encoding it as "level 0" leaks the
  thermometer base into every field state (this was a real bug, pinned
  2026-10-03 as the cross-role decorrelation test).
- **`serve` must stay compiler-free.** Adding a compiler to the serve engine
  would let the read side learn, breaking the two-ledger loop contract
  (zeroclaw owns learning; pincher owns serving).
- **Payload stays DATA.** The `return {...};` literal wrapper in
  `zeroclaw-spec.ts` is the safety boundary between a spec and `execute()`'s
  `new Function`. Do not concatenate spec fields into code strings.
- **`execute()` timeout does not cancel work** — `Promise.race` abandons the
  promise, the child keeps running. If you touch execution, preserve the
  disclosure comment and consider a real sandbox before raising the default
  5000 ms.
- **`MemoryReflexStore.upstream` propagates insert AND delete** — a local
  delete removes the reflex upstream too; that is the federation semantics, not
  a bug.
- **`noUncheckedIndexedAccess`** means every index read is `T | undefined`;
  the `!` assertions are deliberate. Disabling the flag to silence them hides
  real emptiness bugs.
- **`package.json` `main` points at `./dist/index.js`** — a consumer install
  without `npm run build` resolves to nothing; CI's build-and-pack gate exists
  to catch that.
