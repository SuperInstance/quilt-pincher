# quilt-pincher — User Guide
> For end users: anyone who wants reflex-fast ("no LLM, no tokens") answers to
> repeated triggers, on a laptop or CI, fed by zeroclaw reflex specs.

## What you get
A TypeScript reflex engine with three behavior tiers — FAST (<50 ms design
target; ~2-3 ms measured for a serve round-trip in this container), MEDIUM
(confirm-then-execute), SLOW (LLM compiles a new reflex, optional) — plus a
production CLI (`serve`) that answers triggers from a directory of zeroclaw
reflex specs with **zero tokens** on a hit. The engine is one npm package
(`@quilt/pincher`, version 0.1.0, Apache-2.0) with zero runtime dependencies.

| tier | platform | LLM? | storage | status in-repo |
|---|---|---|---|---|
| Cloud | Browser, Node, Workers | optional (compile) | memory (+ federation hook) | working |
| Workstation | Node + native deps | optional | SQLite + sqlite-vec (STUB — wraps memory) | engine works, persistence not implemented |
| ESP32 | no_std Rust | never | in-memory (≤256 reflexes) | designed in `docs/ESP32_PORT.md`, not in-tree |

## Install
```bash
git clone https://github.com/SuperInstance/quilt-pincher && cd quilt-pincher
npm install        # devDependencies only; the package itself has zero runtime deps
```
Note: `npm install @quilt/pincher` (README's line) presumes an npm publish that
is configured but not receipted; cloning is the honest path today.

## First success in 5 minutes
Run the serve CLI against the shipped fixture (this is the zeroclaw synapse —
the real production path):

```bash
echo "order:fleet-seeds-last3-scout-delta
read the 3 most recent scout reports and file a delta
context-sha256:face0000000000000000000000000000000000000000000000000000000000babe" > /tmp/trigger.txt

npx tsx src/cli/serve.ts --trigger-file /tmp/trigger.txt --spec-dir test/fixtures
# exit 0; stdout = JSON with kind:"hit", the reflex, and the payload:
#   {"result":{"kind":"hit",...,"latencyMs":2.5},"exitCode":0,"spec":{"id":"zc-deadbeefcafe0001",...
#    "payload":{"delta_path":"scouts/2026-10-03-fixture-delta.md","content":"# fixture delta\n\n..."}},"specsLoaded":1}
```

A foreign trigger misses cleanly and tells the caller to fall through to the LLM:

```bash
echo "order:no-such-order" > /tmp/t2.txt
npx tsx src/cli/serve.ts --trigger-file /tmp/t2.txt --spec-dir test/fixtures
# exit 4 → "no match below confirm threshold" — zeroclaw's cue to run its LLM
```

## Everyday usage

### 1. Serve zeroclaw reflex specs (the synapse)
```bash
node dist/cli/serve.js --trigger-file <path> --spec-dir <dir> \
     [--field-json '{"gamma":0.5,"eta":0.2,"delta":0.8,"iota":0.1}'] \
     [--context-sha256 <digest>] [--ledger <path>] [--stats <path>]
```
Exit codes: `0` hit/confirm (payload JSON on stdout) · `4` no match (fall
through to LLM) · `5` vetoed · `1` error · `2` usage. `--field-json` conditions
retrieval on an ExoJ field state (same trigger, different field → different
reflex). `--context-sha256` restricts eligibility to specs minted for that
exact context digest (the cache-integrity law). Specs whose `context_sha256`
fails the filter are not loaded at all.

### 2. Keep a traffic ledger and read it back (FB3)
```bash
npx tsx src/cli/serve.ts --trigger-file /tmp/trigger.txt --spec-dir test/fixtures --ledger /tmp/serve-ledger.jsonl
npx tsx src/cli/serve.ts --stats /tmp/serve-ledger.jsonl
# → {"ledger":"/tmp/serve-ledger.jsonl","rows":1,"hits":1,"misses":0,"vetoed":0,"errors":0,"mean_latency_ms":2.6}
```
The ledger stores HASHES ONLY (`trigger_sha256`, `context_sha256`, `spec_id`,
`exit_code`, `latency_ms`) — never payload content. Two ledgers, one loop:
pincher's traffic ledger + zeroclaw's receipt journal.

### 3. Embed the engine in your own agent (TypeScript)
```ts
import { PincherSheet, runPinch, HashEmbedder, MemoryReflexStore, DefaultVeto } from './src/index.js';

const sheet = PincherSheet({
  name: 'my-agent',
  embedder: new HashEmbedder(384),          // or HDCEmbedder(1024) for quasi-orthogonal semantics
  store: new MemoryReflexStore(),
  veto: new DefaultVeto(),
  // compiler: optional — without one, unknown pinches return an error instead of learning
});
const r = await runPinch(sheet, { trigger: 'list running containers', context: { host: 'prod-01' } });
// r.kind: 'hit' | 'confirm' | 'compiled' | 'vetoed' | 'error'; r.latencyMs is measured
```
The tier router: top match `score >= 0.80` executes directly (`hit`);
`0.55–0.80` confirms then executes (`confirm`); `< 0.55` compiles a new reflex
(`compiled`) when a compiler is configured. Thresholds are configurable
(`hitThreshold`, `confirmThreshold`, `executionTimeoutMs` default 5000).

### 4. Field-condition a pinch (ExoJ, FB1)
Pass `context.exojField = { gamma, eta, delta, iota }` (four amplitudes in
[0,1]) and the query embedding is bound with the field hypervector before
matching — the same trigger retrieves differently in different field states.
All-zero field = identity (no conditioning). This is deterministic across
processes and platforms (string-seeded, spine-pinned).

### 5. Add a reflex by hand
```ts
await sheet.engine.addReflex({
  id: 'reflex-manual-1',
  embedding: await sheet.engine['embedder' as never] /* or embed once yourself */,
  intent: 'list running containers',
  action: 'return exec("docker ps --format {{.Names}}")',  // executed via new Function — see gotchas
  safety: { network: 'local', filesystem: 'read', sandbox: 'wasm' },
  confidence: 0.5, hits: 0, createdAt: Date.now(), lastHitAt: 0,
  provenance: { compiledBy: 'human' },
});
```
Prefer the zeroclaw spec adapter (`loadZeroclawSpecs`) for anything real: it
wraps the payload as a DATA literal, never code.

## Troubleshooting

| symptom | cause | fix |
|---|---|---|
| `npm test` fails with runner not found on a fresh clone | repo ships no `node_modules`; tests need `tsx` | `npm install` first, or borrow the sibling tsx (`quilt-playtest/node_modules/.bin/tsx`) as task 66-c did |
| serve exits 4 on a trigger you know was filed | the spec's `context_sha256` does not match your context digest, or the trigger text differs byte-for-byte | serve hashes the trigger FILE verbatim; the cache-integrity law demands exact match — re-file the spec from zeroclaw or drop `--context-sha256` |
| serve exits 5 | the veto refused the reflex/pinch safety combination (e.g. pinch wants `network:'any'` but the reflex is restricted) | align `safety` hints between spec and pinch, or override the veto when constructing the engine |
| `exportNail()` returns a bundle with zero reflexes | known stub: `allReflexes()` returns `[]` | use `MemoryReflexStore.all()` directly (the `buildNail` path in `platforms/esp32.ts`) — or wait for the pagination fix |
| reflexes vanish on restart | the memory store is in-memory; `SqliteReflexStore` does not persist yet | export your reflexes programmatically; persistence is an open item |
| CI fails on "SPINE BREAK" | the HDC layer changed (dimension, seed grammar, thermometer) without re-pinning | recompute `npx tsx test/hdc-spine.mjs` and update `SPINE_SHA256` in BOTH workflows in the same commit, stating why |
| same trigger matches the wrong reflex after many edits | raw recall is cosine-fuzzy by design | at the serve boundary the `context_sha256` exactness law is the integrity instrument; in library use, raise `hitThreshold` |
| `CloudflareAIEmbedder` returns hash-like vectors | it is a stub falling back to `HashEmbedder` | inject a real embedder via `cloudSheet({embedderApi})` or `QuiltAIEmbedder` with your own delegate |

## FAQ

**Does a hit cost anything?** No tokens, no network (with the HDC or hash
embedders). The FAST tier is embedding (deterministic arithmetic) + cosine scan
+ action execution. The only LLM cost in the system is the SLOW tier (compile a
new reflex), and the serve CLI never compiles — it is read-only by design, so
your worst case is exit 4 and an explicit fall-through to zeroclaw's LLM run.

**How is this "<50 ms"?** It is the design target from the original pincher
concept and plausible by construction (no network, brute-force cosine over a
cache-resident store — the code comments that up to ~10K reflexes the scan fits
in L2). Measured here: serve round-trips of ~2-3 ms on the fixture. A
fleet-scale latency receipt does not exist yet, so treat <50 ms as a design
claim, not a receipted number.

**Where do reflexes come from?** Three ways: compiled by the optional LLM
compiler (SLOW tier), added by hand (`addReflex`), or — the production path —
filed by zeroclaw as `zeroclaw-reflex-spec/v1` JSON and served read-only by
this engine. The synapse is deliberately one-directional: pincher never learns
by itself in serve mode; zeroclaw files a better spec and the loop is receipted
on both ledgers.

**Is executing a reflex safe?** Not by default. The action is a JS string run
via `new Function` with the pinch context — unsandboxed, with only a wall-clock
timeout. The `DefaultVeto` compares safety *hints* (sandbox/network/filesystem)
between pinch and reflex but cannot enforce them. Read SECURITY.md's trust
model: treat every reflex action as trusted code.

**What is the ExoJ field doing in a reflex engine?** It is the fleet's
hyperdimensional-computing binding experiment (FB1): a pinch may carry four
field amplitudes (γ/η/Δ/ι); each quantizes to a thermometer level hypervector,
role-bound and bundled into one 1024-d ±1 vector that conditions the query.
Honest limits are stated in the source: clamped amplitudes, linear thermometer,
statistical superposition only.
