/**
 * Hypervector algebra — the ±1 (i8) substrate of the ExoJ binding layer.
 *
 * Semantics (fleet-seeds lode 2026-10-03 §4):
 *   - a hypervector is an Int8Array of +1/-1, dimension d (default 1024)
 *   - bind  = elementwise product (⊗): commutative, self-inverse, exact
 *   - bundle = sign of the coordinate sum (+): statistical superposition only
 *   - permute (ρ) = coordinate rotation: order-sensitive, exactly invertible
 *   - similarity = cosine = dot/d (unit norm by construction)
 *
 * Everything is deterministic: seeds are strings, expanded by mulberry32.
 * No dependencies; Int8Array keeps the ESP32 tier story honest.
 */

export type Hyper = Int8Array;

const MASK64 = 0x7fffffffffffffff;

/** fnv1a-64 over a seed string — stable across processes and platforms. */
export function seedHash(seed: string): number {
  let h = 0xcbf29ce484222325;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x100000001b3) >>> 0;
  }
  // fold to a positive 53-bit-safe integer for mulberry32
  return Number((h & 0xffffffff) ^ ((h >>> 16) << 8)) & 0x7fffffff;
}

/** mulberry32 — small deterministic PRNG. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random hypervector from a string seed. Deterministic. */
export function randomHV(seed: string, dim: number): Hyper {
  const rand = mulberry32(seedHash(seed));
  const hv = new Int8Array(dim);
  for (let i = 0; i < dim; i++) hv[i] = rand() < 0.5 ? -1 : 1;
  return hv;
}

/** bind (⊗): elementwise product. Self-inverse, commutative. */
export function bind(a: Hyper, b: Hyper): Hyper {
  const out = new Int8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i]! * b[i]!) as 1 | -1;
  return out;
}

/** unbind = bind (±1 algebra: b⁻¹ == b). */
export const unbind = bind;

/**
 * bundle (+): sign of coordinate sum. Ties resolve by coordinate parity
 * (deterministic). Superposition is statistical, never exact.
 */
export function bundle(hvs: Hyper[]): Hyper {
  if (hvs.length === 0) throw new Error('bundle([]) is undefined');
  const dim = hvs[0]!.length;
  const sum = new Int32Array(dim);
  for (const hv of hvs) {
    if (hv.length !== dim) throw new Error('bundle: dimension mismatch');
    for (let i = 0; i < dim; i++) sum[i]! += hv[i]!;
  }
  const out = new Int8Array(dim);
  for (let i = 0; i < dim; i++) {
    out[i] = sum[i]! > 0 ? 1 : sum[i]! < 0 ? -1 : i % 2 === 0 ? 1 : -1;
  }
  return out;
}

/** permute (ρ): rotate coordinates left by k. */
export function permute(hv: Hyper, k: number): Hyper {
  const dim = hv.length;
  const kk = ((k % dim) + dim) % dim;
  const out = new Int8Array(dim);
  for (let i = 0; i < dim; i++) out[i] = hv[(i + kk) % dim]!;
  return out;
}

/** inverse permute: rotate right by k. Exact inverse of permute(·, k). */
export function permuteInverse(hv: Hyper, k: number): Hyper {
  const dim = hv.length;
  const kk = ((k % dim) + dim) % dim;
  const out = new Int8Array(dim);
  for (let i = 0; i < dim; i++) out[i] = hv[(i - kk + dim) % dim]!;
  return out;
}

/** cosine similarity for ±1 hypervectors (unit norm by construction). */
export function cosine(a: Hyper | number[], b: Hyper | number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot / a.length;
}
