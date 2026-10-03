/**
 * ExoJ field encoding — the pinch meets the ExoJ field (γ/η/Δ/ι).
 *
 * A field state is four amplitudes in [0,1]. Each amplitude quantizes to
 * one of LEVELS thermometer levels: level vectors share a common base and
 * accumulate random steps, so adjacent levels correlate more than distant
 * ones. The field hypervector is the bundle of role-bound levels:
 *
 *   field(γ,η,Δ,ι) = Σ_r role_r ⊗ level(round(a_r · (L-1)))
 *
 * Conditioning a query binds it with the field hypervector. The zero field
 * is special-cased to the ones vector — the identity element, i.e. no
 * conditioning at all.
 *
 * Honest limits: amplitudes outside [0,1] are clamped; the thermometer is
 * linear in amplitude, not in any physical law of the ExoJ model.
 */
import { randomHV, bind, bundle, type Hyper } from './hypervector.js';

export interface ExoJFieldState {
  gamma: number;
  eta: number;
  delta: number;
  iota: number;
}

export const ROLES = ['gamma', 'eta', 'delta', 'iota'] as const;
export const LEVELS = 8;
export const ZERO_FIELD: ExoJFieldState = { gamma: 0, eta: 0, delta: 0, iota: 0 };

const DIM = 1024;

// Deterministic role vectors and thermometer steps — stable across processes.
const ROLE_HV = new Map<string, Hyper>(ROLES.map((r) => [r, randomHV(`exoj-role:${r}`, DIM)]));
const BASE = randomHV('exoj-thermo:base', DIM);
const STEPS = Array.from({ length: LEVELS - 1 }, (_, i) =>
  randomHV(`exoj-thermo:step:${i}`, DIM),
);

/** Thermometer level vector: base + the first `level` steps, bundled. */
export function levelHV(level: number): Hyper {
  const l = Math.max(0, Math.min(LEVELS - 1, level));
  return l === 0 ? BASE : bundle([BASE, ...STEPS.slice(0, l)]);
}

/** Encode a field state as a hypervector. Zero field → identity (ones). */
export function encodeField(state: ExoJFieldState): Hyper {
  const amps: number[] = ROLES.map((r) => state[r]);
  if (amps.every((a) => a === 0)) return new Int8Array(DIM).fill(1);
  // A zero amplitude means the role is ABSENT from the field — it contributes
  // no term to the bundle (encoding 'level 0' here would bind the role to the
  // thermometer base and leak into every field state — caught by the
  // cross-role decorrelation pin, 2026-10-03).
  const terms = amps.flatMap((a, i) => {
    if (a === 0) return [];
    const q = Math.max(0, Math.min(LEVELS - 1, Math.round(a * (LEVELS - 1))));
    return [bind(ROLE_HV.get(ROLES[i]!)!, levelHV(q))];
  });
  return bundle(terms);
}

/** Low-level condition: bind two hypervectors. */
export function condition(query: Hyper, field: Hyper): Hyper {
  return bind(query, field);
}

/** Condition a float query embedding (number[]) with a field state. */
export function conditionEmbedding(query: number[], state: ExoJFieldState): number[] {
  const field = encodeField(state);
  const q = new Int8Array(query.length);
  for (let i = 0; i < query.length; i++) q[i] = query[i]! >= 0 ? 1 : -1;
  return Array.from(bind(q, field));
}
