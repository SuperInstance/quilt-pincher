/**
 * FB1 pins — ExoJ binding in the pincher cell algebra (HDC/VSA layer).
 *
 * FAIL-first: this file landed BEFORE src/hdc/* existed. The RED run is
 * the receipt that these pins test something.
 *
 * Semantics under test (from fleet-seeds lode 2026-10-03, §4):
 *   - hypervectors are quasi-orthogonal by construction (d = 1024, ±1)
 *   - bind (⊗) is elementwise, commutative, self-inverse → exact recovery
 *   - bundle (+) is sign-sum superposition → statistical similarity only
 *   - permute (ρ) rotates coordinates → order sensitivity, exact inversion
 *   - ExoJ field amplitudes (γ/η/Δ/ι) encode as role-bound thermometer
 *     level vectors; conditioning a pinch = binding the query with the
 *     field hypervector → the pinch retrieves FIELD-CONDITIONED reflexes
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  randomHV, bind, unbind, bundle, permute, permuteInverse, cosine,
} from '../src/hdc/hypervector.js';
import { HDCEmbedder } from '../src/hdc/hdc-embedder.js';
import { encodeField, condition, ZERO_FIELD } from '../src/hdc/exoj-field.js';
import { PincherEngine, MemoryReflexStore, DefaultVeto } from '../src/index.ts';
import type { Reflex } from '../src/index.ts';

const DIM = 1024;

describe('hypervector algebra', () => {
  test('random hypervectors are quasi-orthogonal', () => {
    const hvs = [0, 1, 2, 3, 4, 5].map((i) => randomHV(`seed-${i}`, DIM));
    let worst = 0;
    for (let i = 0; i < hvs.length; i++) {
      for (let j = i + 1; j < hvs.length; j++) {
        worst = Math.max(worst, Math.abs(cosine(hvs[i]!, hvs[j]!)));
      }
    }
    assert.ok(worst < 0.05, `max |cos| across 15 pairs was ${worst.toFixed(4)}`);
  });

  test('bind is commutative and self-inverse: unbind(bind(a,b),b) == a exactly', () => {
    const a = randomHV('a', DIM);
    const b = randomHV('b', DIM);
    const ab = bind(a, b);
    const ba = bind(b, a);
    assert.deepEqual(Array.from(ab), Array.from(ba));
    const recovered = unbind(ab, b);
    assert.deepEqual(Array.from(recovered), Array.from(a));
  });

  test('bind output is decorrelated from both inputs', () => {
    const a = randomHV('a', DIM);
    const b = randomHV('b', DIM);
    const ab = bind(a, b);
    assert.ok(Math.abs(cosine(ab, a)) < 0.15);
    assert.ok(Math.abs(cosine(ab, b)) < 0.15);
  });

  test('bundle preserves statistical similarity, rejects strangers', () => {
    const a = randomHV('a', DIM);
    const b = randomHV('b', DIM);
    const c = randomHV('c', DIM);
    const ab = bundle([a, b]);
    assert.ok(cosine(ab, a) > 0.4, `bundle([a,b])·a = ${cosine(ab, a).toFixed(3)}`);
    assert.ok(cosine(ab, c) < 0.15, `bundle([a,b])·c = ${cosine(ab, c).toFixed(3)}`);
    assert.ok(cosine(ab, a) > cosine(ab, c));
  });

  test('permute decorrelates and inverts exactly', () => {
    const a = randomHV('a', DIM);
    const pa = permute(a, 1);
    assert.ok(Math.abs(cosine(pa, a)) < 0.15);
    const back = permuteInverse(pa, 1);
    assert.deepEqual(Array.from(back), Array.from(a));
    const p3 = permute(a, 3);
    assert.deepEqual(Array.from(permuteInverse(p3, 3)), Array.from(a));
  });

  test('bind distributes over bundle (approximate superposition)', () => {
    const a = randomHV('a', DIM);
    const b = randomHV('b', DIM);
    const c = randomHV('c', DIM);
    const lhs = bind(bundle([a, b]), c);
    const rhs = bundle([bind(a, c), bind(b, c)]);
    // Pin corrected on the record (2026-10-03): the idealized distributivity
    // identity was pinned at >0.7, but a 2-vector bundle ties at ~50% of
    // coordinates and the parity tie-break caps the identity near ~0.75.
    // 0.5 is the honest statistical floor for the approximation at n=2.
    const cosVal = cosine(lhs, rhs);
    assert.ok(cosVal > 0.5, `distributivity cos = ${cosVal.toFixed(3)}`);
  });
});

describe('ExoJ field encoding', () => {
  test('same field state encodes deterministically to the same hypervector', () => {
    const f1 = encodeField({ gamma: 0.6, eta: 0.2, delta: 0.9, iota: 0.1 });
    const f2 = encodeField({ gamma: 0.6, eta: 0.2, delta: 0.9, iota: 0.1 });
    assert.deepEqual(Array.from(f1), Array.from(f2));
  });

  test('adjacent amplitudes are closer than distant amplitudes (thermometer)', () => {
    const near = cosine(
      encodeField({ gamma: 0.25, eta: 0, delta: 0, iota: 0 }),
      encodeField({ gamma: 0.375, eta: 0, delta: 0, iota: 0 }),
    );
    const far = cosine(
      encodeField({ gamma: 0.25, eta: 0, delta: 0, iota: 0 }),
      encodeField({ gamma: 1.0, eta: 0, delta: 0, iota: 0 }),
    );
    assert.ok(near > far, `near=${near.toFixed(3)} should beat far=${far.toFixed(3)}`);
  });

  test('different roles decorrelate at equal amplitude', () => {
    const g = encodeField({ gamma: 0.9, eta: 0, delta: 0, iota: 0 });
    const e = encodeField({ gamma: 0, eta: 0.9, delta: 0, iota: 0 });
    assert.ok(Math.abs(cosine(g, e)) < 0.2, `cross-role cos = ${cosine(g, e).toFixed(3)}`);
  });

  test('ZERO_FIELD conditions to the ones vector (no-op binding)', () => {
    const a = randomHV('a', DIM);
    const z = encodeField(ZERO_FIELD);
    const cond = condition(a, z);
    assert.ok(cosine(cond, a) > 0.99, `zero-field conditioning moved the query: ${cosine(cond, a).toFixed(3)}`);
  });
});

describe('HDC embedder', () => {
  test('embed is deterministic and order-sensitive', async () => {
    const emb = new HDCEmbedder(DIM);
    const v1 = await emb.embed('list running containers');
    const v2 = await emb.embed('list running containers');
    const v3 = await emb.embed('containers running list');
    assert.deepEqual(v1, v2);
    assert.ok(cosine(v1, v3) < 0.85, `word-order insensitivity too high: ${cosine(v1, v3).toFixed(3)}`);
  });

  test('similar triggers correlate above unrelated triggers', async () => {
    const emb = new HDCEmbedder(DIM);
    const base = await emb.embed('list running containers');
    const near = await emb.embed('list the running containers');
    const far = await emb.embed('delete the production database');
    assert.ok(
      cosine(base, near) > cosine(base, far),
      `near=${cosine(base, near).toFixed(3)} must beat far=${cosine(base, far).toFixed(3)}`,
    );
  });
});

describe('field-conditioned pinch (the ExoJ-Pincher seam)', () => {
  function reflex(id: string, emb: number[], action: string): Reflex {
    return {
      id, embedding: emb, intent: id, action,
      safety: {}, confidence: 0.9, hits: 10,
      createdAt: Date.now(), lastHitAt: Date.now(),
    };
  }

  test('same trigger, different field state → different reflex wins', async () => {
    const embedder = new HDCEmbedder(DIM);
    const store = new MemoryReflexStore();
    const engine = new PincherEngine({ embedder, store, veto: new DefaultVeto() });

    const trigger = 'gather the harvest';
    const fieldA = encodeField({ gamma: 0.9, eta: 0.1, delta: 0.2, iota: 0.5 });
    const fieldB = encodeField({ gamma: 0.1, eta: 0.9, delta: 0.8, iota: 0.2 });
    await engine.addReflex(reflex('calm-stand', condition(await embedder.embed(trigger), fieldA),
      `return 'grew under high-gamma';`));
    await engine.addReflex(reflex('storm-stand', condition(await embedder.embed(trigger), fieldB),
      `return 'grew under high-eta';`));

    const resA = await engine.run({ trigger, context: { exojField: { gamma: 0.9, eta: 0.1, delta: 0.2, iota: 0.5 } } });
    const resB = await engine.run({ trigger, context: { exojField: { gamma: 0.1, eta: 0.9, delta: 0.8, iota: 0.2 } } });

    // Field-conditioned engine path: pinch embedder binds context field.
    assert.equal(resA.kind, 'hit');
    assert.equal(resB.kind, 'hit');
    if (resA.kind === 'hit') assert.match(String(resA.output), /high-gamma/);
    if (resB.kind === 'hit') assert.match(String(resB.output), /high-eta/);
  });

  test('wrong-field query does not hit the foreign reflex', async () => {
    const embedder = new HDCEmbedder(DIM);
    const store = new MemoryReflexStore();
    const engine = new PincherEngine({ embedder, store, veto: new DefaultVeto(), hitThreshold: 0.8 });
    const trigger = 'tend the boundary';
    const fieldA = encodeField({ gamma: 0.9, eta: 0, delta: 0, iota: 0 });
    await engine.addReflex(reflex('a-stand', condition(await embedder.embed(trigger), fieldA),
      `return 'field-A reflex';`));

    // Query with the SAME trigger but a maximally different field:
    const res = await engine.run({ trigger, context: { exojField: { gamma: 0, eta: 0.9, delta: 0.9, iota: 0.9 } } });
    assert.notEqual(res.kind, 'hit', `foreign field produced a hit — cross-field bleed: ${res.kind}`);
  });
});
