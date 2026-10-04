# quilt-pincher — CTO Brief
> Executive summary for investment decisions. Read time: ~5 minutes.

## One-paragraph value statement
quilt-pincher is the fleet's bet that most agent "thinking" is really recall:
a reflex engine where a trigger matches a learned reflex and executes in
milliseconds with zero tokens, compiled once by an LLM and reused forever. The
deterministic HDC embedder and the pinned spine canary make its memory
platform-grade (byte-stable across processes forever), and the zeroclaw synapse
is a working production loop today: one real producer files reflex specs, the
engine serves them read-only, two ledgers keep the loop receipted.

## What it does & for whom
For agents (and their operators) that repeat the same operations constantly:
the FAST tier answers hot triggers with no LLM and no marginal cost; the MEDIUM
tier confirms ambiguous matches; the SLOW tier (optional) compiles new reflexes.
The production consumer is `zeroclaw` (fleet-seeds' Python tool), which files
`zeroclaw-reflex-spec/v1` specs that pincher serves via a CLI with an
exit-code contract (0 hit / 4 miss / 5 vetoed) and a hash-only traffic ledger.
Secondary audiences: ESP32/embedded deployments (designed, docs-only today),
and the Quilt ecosystem, which gets a concrete example of an engine expressed
as cells.

## Maturity assessment: **prototype+** (core working, shell aspirational)
- **Working, with evidence**: 35/35 tests across 13 suites on Node 24
  (CI matrix 20/22/24), clean strict typecheck, the determinism spine
  reproduces the pinned hash exactly (`51b6d1e1…`), and the zeroclaw synapse
  round-trips a real spec fixture at ~2-3 ms.
- **Engineered**: receipts-grade CI with a named canary (spine → suite →
  build-and-pack), fail-closed tag-gated publish with OIDC provenance,
  dependabot discipline, strict TS with `noUncheckedIndexedAccess`.
- **Aspirational shell (labeled, not hidden)**: SQLite persistence is a stub;
  `exportNail()` returns empty bundles; the Cloudflare embedder falls back to
  hash; the ESP32 no_std Rust port is a document, not code; the npm package is
  not verifiably published; execution is unsandboxed by its own comment.
- Verdict: the kernel (engine + HDC + synapse + CI) is genuinely working; the
  surrounding product claims (npm install, ESP32, .nail shipping, three-tier
  persistence) are one to three increments away.

## Risks
| risk | severity | mitigation status |
|---|---|---|
| Unsandboxed `new Function` execution of reflex actions | HIGH if fed untrusted reflexes | disclosed in-code and in SECURITY.md's trust model; veto checks hints only; a real sandbox is the named gap — treat as trusted-code-until-built |
| HDC recall is quasi-orthogonal, not semantic (wrong-reflex risk near thresholds) | medium | thresholds configurable; exact `context_sha256` law at the serve boundary; real embeddings remain an interface away (`embedderApi`) |
| Determinism break corrupts all stored reflexes silently | medium | the spine canary exists precisely for this and fails CI first with a named message |
| Stub gap between README and tree (npm, ESP32, .nail, sqlite) | medium (credibility) | each stub is labeled at the site and in the journal; this wave's docs record the delta explicitly |
| Vector store is O(n) brute force | low at ≤10K reflexes (code's own estimate) | swap point isolated behind `ReflexStore` |
| `Promise.race` timeout abandons but does not cancel work | low-medium | documented; bounded by trusted-reflex policy until a sandbox lands |

## Cost profile
Effectively $0 to run: zero runtime dependencies, no services, deterministic
local compute on the hot path; CI is GitHub-hosted runners. The only possible
LLM cost (SLOW-tier compile) is structurally absent from the production serve
path. Engineering cost to date: the waves 63-69 arc (rewrite → cells → HDC →
synapse → CI), roughly a handful of lane-days; the remaining increments
(sandbox, sqlite, npm publish) are each small, bounded tasks.

## Strategic options
- **Invest (recommended: two surgical increments)** — (1) land a real sandbox
  for `execute()` (wasm/docker per the existing `SafetyHints` vocabulary), and
  (2) finish `SqliteReflexStore` so the workstation tier actually persists.
  Both unlock the fleet-wide reflex story; both are small against the value of
  a shared, durable reflex database.
- **Maintain** — as-is it already serves its one real consumer (zeroclaw) with
  zero marginal cost and strong determinism guarantees; that loop is stable and
  cheap.
- **Harvest-learnings** — the exportable assets are the METHOD (string-seeded
  determinism + a named, pinned canary in CI; receipts-grade publish gating)
  and the two-ledger loop pattern (producer owns learning, server owns serving,
  both receipt). These generalize to any fleet cache-of-intelligence.
- **Retire** — not indicated while zeroclaw files specs against it; if the
  synapse moves to another engine, the HDC layer and spine pattern remain worth
  harvesting before archival.

## Integration surface
- **zeroclaw (fleet-seeds `tools/zeroclaw`)** — the reflex producer; the spec
  format `zeroclaw-reflex-spec/v1` is the shared contract; `origin_row`
  back-pointers and `cites[]` (grammar-N1, including fleet tips) ride in every
  spec.
- **fleet-seeds lode** — the hypervector semantics are cited from lode
  2026-10-03 §4 in `hypervector.ts`; fixture `cites` reference real fleet tips.
- **Quilt ecosystem** (`@quilt/core`, `@quilt/sdk`, `@quilt/ai`, `@quilt/rag`,
  `@quilt/elf`) — named as the target runtime federation (README), not yet
  wired in-repo; the sheet descriptor is the attach point.
- **pincher (upstream concept, Rust-native)** — same architecture; pincher is
  the Quilt-cell rewrite.
- **CI/canary pattern recipients** — pong-quilt and quilt-c pollinated this
  repo's receipts-grade pipeline; the pattern is portable further.
- **superinstance-lab worklog** — journal of record (task 66-c deep-read and
  decomposition; task 67-p credential-sweep note).
