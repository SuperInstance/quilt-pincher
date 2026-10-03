/**
 * HDC determinism spine — the byte-stability canary (pong-quilt md5-spine
 * pattern, pollinated 2026-10-03). Every coordinate of the HDC/ExoJ layer is
 * seeded from strings (mulberry32 ← fnv1a-64), so a fixed corpus MUST hash
 * to the same value in every process, on every machine, forever. If this
 * pin breaks, something introduced nondeterminism (time, Math.random,
 * iteration-order dependence) — the failure names the gate, not the suite.
 *
 * Usage: npx tsx test/hdc-spine.mjs
 * CI compares stdout's spine hash against a pinned value in ci.yml.
 */
import { createHash } from 'node:crypto';
import { HDCEmbedder, encodeField, conditionEmbedding } from '../src/index.ts';

const CORPUS = [
  'gather the harvest', 'tend the boundary', 'list running containers',
  'quilt the sheet', 'pinch in', 'match the reflex', 'veto the action',
  'compile the new', 'federate the store', 'audit the elves',
  'the keeper keeps', 'the coroner falsifies', 'entropy garden blooms',
  'exoj field binds', 'thermometer levels rise', 'roles decorrelate',
];
const FIELDS = [
  { gamma: 0, eta: 0, delta: 0, iota: 0 },
  { gamma: 0.9, eta: 0.1, delta: 0.2, iota: 0.5 },
  { gamma: 0.1, eta: 0.9, delta: 0.8, iota: 0.2 },
  { gamma: 0.5, eta: 0.5, delta: 0.5, iota: 0.5 },
];

const embedder = new HDCEmbedder(1024);
const h = createHash('sha256');
for (const text of CORPUS) {
  const emb = await embedder.embed(text);
  h.update(Buffer.from(new Float64Array(emb).buffer));
  for (const f of FIELDS) {
    const cond = conditionEmbedding(emb, f);
    h.update(Buffer.from(new Float64Array(cond).buffer));
    h.update(encodeField(f));
  }
}
console.log(`spine ${h.digest('hex')} (corpus=${CORPUS.length} fields=${FIELDS.length} dim=1024)`);
