/**
 * Tests for the ReflexArc — earned standing, the fast path below the fast path.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ReflexArc } from '../src/index.ts';
import type { Reflex } from '../src/index.ts';

function reflex(id: string): Reflex {
  return {
    id, embedding: [0], intent: `intent ${id}`, action: 'return {ok:true};',
    safety: {}, confidence: 0.9, hits: 0, createdAt: 0, lastHitAt: 0,
  };
}

describe('ReflexArc — earned standing', () => {
  test('standing is EARNED: no recall until N consecutive correct hits', () => {
    const arc = new ReflexArc({ diplomaN: 3 });
    const r = reflex('r1');
    assert.equal(arc.recall('list containers'), null);   // unseen → fall through
    arc.reward('list containers', r);
    arc.reward('list containers', r);
    assert.equal(arc.recall('list containers'), null);   // 2 < 3, still no standing
    arc.reward('list containers', r);
    const hit = arc.recall('list containers');
    assert.ok(hit && hit.kind === 'reflex' && hit.reflex.id === 'r1');   // 3rd → conferred
    assert.equal(hit!.standing, 3);
  });

  test('recall is exact-trigger and content-addressed (whitespace/case-normalized)', () => {
    const arc = new ReflexArc({ diplomaN: 1 });
    arc.reward('List   Containers', reflex('r1'));
    assert.ok(arc.recall('list containers'));            // normalized match
    assert.equal(arc.recall('delete everything'), null); // different trigger, no standing
  });

  test('standing is REVOCABLE: one miss tears it up, the reflex must re-earn it', () => {
    const arc = new ReflexArc({ diplomaN: 2 });
    const r = reflex('r1');
    arc.reward('ping', r); arc.reward('ping', r);
    assert.ok(arc.hasStanding('ping'));
    arc.revoke('ping');                                  // the world drifted; a miss
    assert.equal(arc.hasStanding('ping'), false);
    assert.equal(arc.recall('ping'), null);              // back to falling through
  });

  test('a different reflex for the same trigger resets the streak (no cross-credit)', () => {
    const arc = new ReflexArc({ diplomaN: 2 });
    arc.reward('open', reflex('a'));
    arc.reward('open', reflex('b'));   // different reflex → streak restarts at 1
    assert.equal(arc.hasStanding('open'), false);
    arc.reward('open', reflex('b'));   // now b has 2 in a row
    const hit = arc.recall('open');
    assert.ok(hit && hit.reflex.id === 'b');
  });

  test('size counts only triggers that currently hold standing', () => {
    const arc = new ReflexArc({ diplomaN: 2 });
    arc.reward('a', reflex('ra')); arc.reward('a', reflex('ra'));
    arc.reward('b', reflex('rb'));                        // only 1 hit, not standing yet
    assert.equal(arc.size, 1);
  });

  test('deterministic: same reward sequence → same recall', () => {
    const a = new ReflexArc({ diplomaN: 2 }), b = new ReflexArc({ diplomaN: 2 });
    for (const arc of [a, b]) { arc.reward('x', reflex('r')); arc.reward('x', reflex('r')); }
    assert.deepEqual(a.recall('x'), b.recall('x'));
  });
});
