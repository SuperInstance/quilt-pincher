# ExoJ Provenance — the FB1 field seam's canonical source

## Canonical citation

The ExoJ field model consumed by the FB1 HDC binding layer
(`src/hdc/exoj-field.ts`, `src/core/engine.ts`) has its canonical source in:

> **SuperInstance/exoj** — README field law (objects as relational fields
> F = (C, {γ_c, η_c, Δ_c, I_c}), Σ γ̄ + η̄ ≤ 1, Δ creative band), pinned at
> commit `bfbe4614b5e26478c79068a89a5e5a54758d9dd7` (exoj main tip,
> verified 2026-10-04 by fresh clone).

Referral edge (weight law): **exoj-field-model → quilt-pincher FB1 HDC seam**.
This document is the in-repo citation that names the source repo and the
pinned commit; on merge, the edge is eligible to flip PENDING → VERIFIED.

## Honest limits — what is and is not the ExoJ charter

- **Charter amplitudes are γ/η/Δ.** The exoj README (pinned commit above)
  defines the three-amplitude field law. The fourth amplitude **ι** carried
  by `ExoJFieldState` is **not** in the exoj charter: it is a derivative of
  the fleet-seeds *lode* (2026-10-03, §4) — the same lode the FB1 test pins
  cite — absorbed alongside the charter amplitudes. It is documented here,
  not laundered as charter.
- **Thermometer encoding is pincher's approximation.** The role ×
  thermometer-level hypervector encoding is this repo's own construction;
  "the thermometer is linear in amplitude, not in any physical law of the
  ExoJ model" (header comment, `src/hdc/exoj-field.ts`).
- **Zero-field identity.** ZERO_FIELD = ones vector (identity element) is a
  VSA convenience, not an ExoJ claim.

## Drift policy

If exoj's field law changes upstream, update the pinned commit in this file
and in the `src/hdc/exoj-field.ts` header in the same PR. The
`test/provenance.test.ts` pins fail if either citation drifts or the commit
stops resolving to a 40-hex SHA.
