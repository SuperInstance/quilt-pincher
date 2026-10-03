/**
 * HDC embedder — text → hypervector, no model, zero marginal cost.
 *
 * Tokenize (lowercase alphanumeric), each token gets a deterministic
 * hypervector from its own hash seed, and sequence order is bound via
 * position permutation: HV(text) = Σ_i ρ^i(token_i).
 *
 * This replaces the char-histogram HashEmbedder wherever quasi-orthogonal
 * semantics are needed — similar-but-different triggers decorrelate
 * properly instead of colliding in histogram space.
 */
import type { Embedder } from '../core/types.js';
import { randomHV, permute, bundle, type Hyper } from './hypervector.js';

export class HDCEmbedder implements Embedder {
  readonly dimensions: number;
  private cache = new Map<string, Hyper>();

  constructor(dimensions: number = 1024) {
    this.dimensions = dimensions;
  }

  private tokenHV(token: string): Hyper {
    let hv = this.cache.get(token);
    if (!hv) {
      hv = randomHV(`tok:${token}`, this.dimensions);
      this.cache.set(token, hv);
    }
    return hv;
  }

  async embed(text: string): Promise<number[]> {
    const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    if (tokens.length === 0) {
      return new Array<number>(this.dimensions).fill(0);
    }
    const positioned = tokens.map((tok, i) => permute(this.tokenHV(tok), i));
    const hv = bundle(positioned);
    return Array.from(hv);
  }
}
