# quilt-pincher — Engineering Notes
> Architecture, invariants, failure modes, cost envelope, operations, design
> decisions — for engineers operating or reviewing the reflex engine.

## Architecture

A single TypeScript package whose engine is described as a 6-cell Quilt sheet,
plus a CLI synapse that serves zeroclaw reflex specs. Three platform tiers
share one code path; only storage and compiler availability differ per tier.

```
                       ┌──────────────────────────────────────────────┐
 trigger (Pinch) ────► │ pinch cell (formula): embed(trigger)         │
   context.exojField ─►│   └─ FB1: conditionEmbedding(query, field)   │
                       └───────────────┬──────────────────────────────┘
                                       ▼
                       ┌──────────────────────────────────────────────┐
                       │ match cell (program): store.query(q, 5)      │
                       │   MemoryReflexStore (cosine, upstream fed.)  │
                       └───────┬──────────────┬──────────────────────┘
                        ≥0.80  │      0.55–0.80│              <0.55
                       ┌───────▼───┐   ┌──────▼─────┐   ┌──────────▼─────────┐
                       │ execute   │   │ confirm+   │   │ compile cell (ai): │
                       │ (program) │   │ execute    │   │ Compiler → Reflex  │
                       └───────┬───┘   └──────┬─────┘   └──────────┬─────────┘
                               ▼              ▼                    │
                       ┌──────────────────────────────┐              │
                       │ veto cell (listener):        │◄─────────────┘
                       │ DefaultVeto: safety hints    │
                       └──────────────┬───────────────┘
                                      ▼
                       execute(): new Function('pinch', action)
                       Promise.race with executionTimeoutMs (5000)
                                      │
                                      ▼  bumpHit → confidence 0.5+0.49·log10(1+hits)
                       ┌──────────────────────────────┐
                       │ store cell (vector_store)    │──► .nail bundle (ESP32 path, designed)
                       └──────────────────────────────┘

  zeroclaw (Python, fleet-seeds) ──files──► specs/ (zeroclaw-reflex-spec/v1)
  src/cli/serve.ts ──loads specs──► engine (HDC 1024d) ──exit 0/4/5/1──► caller
        └──FB3──► serve-ledger.jsonl (HASHES ONLY)  +  --stats summarizer
```

Data flow, synapse path (the production one): zeroclaw files a spec JSON after
an LLM run → `serve` loads eligible specs (exact `context_sha256` filter),
inserts them as reflexes whose embeddings come from `HDCEmbedder(1024)`, embeds
the trigger FILE verbatim, runs the normal tier router, and answers with an
exit code; a stats row (hashes only) rides to the ledger. On a hit, the caller
gets the spec payload plus the `origin_row` back-pointer so zeroclaw can
re-check its own journal before trusting the content.

## Invariants
1. **Determinism of the HDC layer** — every hypervector derives from a string
   seed via `seedHash` (fnv1a-64) → `mulberry32`; the corpus hash
   (`51b6d1e1…`, corpus=16 fields=4 dim=1024) is pinned in CI as THE SPINE.
   Enforced by `test/hdc-spine.mjs` + both workflows. Consequence: reflexes
   embedded once are valid forever, across processes and platforms.
2. **The serve side never learns** — no compiler is wired in `serveOnce`;
   learning belongs to zeroclaw filing better specs. Enforced by construction
   (`PincherEngine` built without a compiler) and stated in the CLI header.
3. **Payload is data, not code** — the spec adapter wraps `payload` as a data
   literal (`return {...};`), and `cites`/`origin_row` ride inside the served
   JSON. The exact-`context_sha256` eligibility filter is the cache-integrity
   law (raw recall stays deliberately fuzzy).
4. **Veto before every execution** — `executeDirectly`, `confirmAndExecute`,
   and `compileAndStore` all consult the veto first; a refusal is a first-class
   result kind (`vetoed` with reason), never a thrown error.
5. **The tier thresholds are configuration, not convention** — `hitThreshold`
   0.80 and `confirmThreshold` 0.55 are constructor options with defaults; the
   confidence law (`0.5 + 0.49*log10(1+hits)`, cap 0.99) is engine-internal.
6. **Federation propagates mutations** — `MemoryReflexStore.upstream` receives
   every local insert and delete (one-directional fan-out hook; the upstream
   R2/FederatedArtifactStore mirror of the README is the not-yet-built consumer).
7. **Exit-code contract of the synapse** — 0 hit/confirm, 4 no-match (caller
   falls through to LLM), 5 vetoed, 1 error, 2 usage; ledger rows carry hashes
   only. Tests pin all of these (`test/zeroclaw-synapse.test.ts`,
   `test/fb3-ledger.test.ts`).

## Failure modes & blast radius
- **Unsandboxed execution** (the big one, disclosed in-code): `new Function`
  runs with full privileges; the 5000 ms timeout abandons but does not kill a
  runaway async task; safety hints are advisory. Blast radius: the whole host
  process. Containment today: only feed trusted reflexes; the veto and the
  payload-as-data law shrink (not close) the attack surface. A real sandbox is
  the named production gap.
- **Nondeterminism creeping into embeddings** — would silently invalidate every
  stored reflex and every receipt citing them. Containment: the spine canary
  fails CI BEFORE the suite runs, naming THE SPINE. Recovery: find the
  nondeterministic source (time, Math.random, iteration order) or re-pin with
  justification in the same commit.
- **Store growth** — brute-force cosine is O(n) per query; the code's own
  estimate says ≤10K reflexes stay cache-resident. Beyond that, latency
  degrades linearly (no index exists); the vector_store cell is the intended
  swap point.
- **Silent stub behavior** — `exportNail()` returns empty bundles,
  `SqliteReflexStore` does not persist, `CloudflareAIEmbedder` degrades to hash
  embeddings. Blast radius: wrong expectations, not corruption; each stub is
  labeled at the site and recorded as a journal negative (task 66-c).
- **Spec mismatch in the synapse** — a trigger file whose bytes differ from the
  spec's trigger, or a stale `context_sha256`, exits 4 (clean miss), so the
  worst case is a wasted LLM call on zeroclaw's side, never a wrong payload
  served.
- **Publish failure** — the fail-closed workflow publishes only from tags after
  spine+suite+build pass; an auth failure means the NPM_TOKEN secret is unset
  (the workflow comment names the action item and forbids committing tokens).

## Performance & cost envelope
- **Cost**: zero marginal cost per FAST-tier hit — no LLM, no network with the
  HDC/hash embedders (the design's headline, and structurally true of the
  code: the hot path is arithmetic + a linear scan). SLOW-tier compiles cost
  whatever the configured LLM charges (no compiler is wired in-repo; the serve
  path makes that cost structurally unreachable).
- **Latency** (measured, this container, Node v24): serve round-trip on the
  fixture ~2.1–2.6 ms (`latencyMs` in test output); full test suite 35/35 in
  ~21.7 s including process spawns. The "<50 ms" README claim is the design
  target — no fleet-scale receipt measures it yet; the numbers above are the
  only measurements on record.
- **Memory** — the ESP32 path's own estimate is ~4 KB per reflex including its
  embedding (`ESP32Engine.memoryUsage`), with a documented 256-reflex static
  cap for the no_std port (docs/ESP32_PORT.md, not yet in-tree). Workstation/
  cloud memory: unbounded in-memory store; content is the reflex DB itself
  (embeddings 384/1024 floats or the i8 HVs).
- **CI cost** — GitHub-hosted runners only; no paid services anywhere in the
  operating envelope.

## Operations
- **Local**: `npm install` once (devDeps), then `npm test` / `npm run
  typecheck` / `npm run build`; the spine check runs standalone via
  `npx tsx test/hdc-spine.mjs`. All verified on Node v24.21.0 this wave.
- **CI**: `.github/workflows/ci.yml` on push/PR to main — gate order spine →
  suite (Node 20/22/24 matrix) → build-and-pack; typescript pinned ^5.9.3
  (TS7 peer conflict documented in-file).
- **Publish**: `.github/workflows/publish.yml`, tag `v*` only; gate job first,
  then `npm publish --access public --provenance` with `NODE_AUTH_TOKEN` from
  the `NPM_TOKEN` repository secret. Credentials model: the token lives ONLY
  as a GitHub Actions secret (env var name `NPM_TOKEN`); nothing is committed;
  no npm publication is receipted yet, so `@quilt/pincher` on the registry is
  UNVERIFIED.
- **Security process**: SECURITY.md — email `security@superinstance.dev` or
  GitHub private vulnerability reporting; acknowledge ≤3 business days, triage
  ≤7, patch critical ≤30. Trust model: cells are pure / sandboxed / trusted;
  `quilt validate` checks structure, not action safety.
- **Journal/receipts**: the repo keeps no receipts/ directory; its proof
  surface is the test suite + CI pins + PR history, with fleet-level records in
  the superinstance-lab worklog (tasks 66-c, 67-p).

## Design decisions & why
1. **Engine as cells, cells as a descriptor** — `PincherSheet` returns a real
   engine PLUS a 6-cell descriptor (`pinch/match/execute/veto/compile/store`),
   so the Quilt vocabulary (federation, subscription, audit, persistence) has a
   concrete attach point without forcing a Quilt runtime dependency.
   Tradeoff: the sheet does not yet *execute* as cells — it is an honest
   description over a monolithic engine.
2. **Deterministic HDC over model embeddings for the synapse** (FB1, PR #15) —
   zeroclaw reflexes must be servable years later with byte-identical
   retrieval, so the embedder is string-seeded arithmetic, pinned by the spine
   canary, with the float-embedding path (BGE via Cloudflare) kept as the
   quality upgrade behind an interface. Tradeoff: HDC semantics are
   quasi-orthogonal, not semantic — hence the exact-`context_sha256` law at
   the serve boundary.
3. **Fuzzy recall + exact cache-integrity at the boundary** (FB2) — the engine
   stays a vector engine; serve adds the zero-tolerance filter
   (`context_sha256` equality) because zeroclaw re-checks the digest before
   trusting a payload. Tradeoff: two matching regimes to explain (the test
   suite documents exactly this: "raw engine recall is FUZZY (documented),
   serve enforces exact context_sha").
4. **Read-only serve, learning stays with the producer** (FB2/FB3) — two
   ledgers, one loop: pincher logs hash-only traffic; zeroclaw's journal holds
   the receipt chain. This removes the whole "engine learned something wrong"
   class of failure from the serving path. Tradeoff: improving hit rate
   requires a zeroclaw re-file, not a pincher patch.
5. **Receipts-grade CI with a NAMED canary** (PR #16, pollinated from
   pong-quilt + quilt-c) — the spine runs first because a determinism break is
   the one failure that corrupts everything downstream silently; naming it
   ("SPINE BREAK") makes the failure mode legible. Fail-closed publish with
   OIDC provenance closes the supply-chain loop.
6. **Honest stubs over fake completeness** — sqlite, Cloudflare embedder,
   `allReflexes`, and the ESP32 port are all labeled stubs or docs-only, kept
   visible in code comments and the journal's negative list (task 66-c) rather
   than faked. Tradeoff: the README oversells relative to the tree; the docs
   package (this one) records the delta.
