/**
 * ReflexArc — earned standing, the fast path below the fast path.
 *
 * The engine's fastest tier is a vector query + threshold (<50ms). But a reflex
 * that has fired CORRECTLY for the same trigger many times shouldn't need the
 * query at all — it has earned the right to answer straight from muscle memory.
 * That is the "reflex arc": a signal that never reaches the brain.
 *
 * This is the pincher's `ACT / CONFIRM / COMPILE` verdicts plus a fourth the
 * engine lacked — `REFLEX`: an O(1), embed-free, query-free recall for a trigger
 * whose reflex the world has proven again and again. It matters most where
 * cycles are scarcest and the network is a rumour — ESP32, offline, rough seas.
 *
 * Standing is EARNED (N correct hits in a row) and REVOCABLE (one miss tears it
 * up), so a reflex whose world has drifted stops being trusted the instant it is
 * wrong. It is never self-granted: only `reward` (a confirmed-correct outcome)
 * confers it. Composes over the engine without touching it — another Quilt cell
 * in the sheet.
 */
import type { Reflex } from '../core/types.js';

/** A recall served by the reflex arc — the fourth, fastest verdict. */
export interface ReflexRecall {
  kind: 'reflex';
  reflex: Reflex;
  /** How many consecutive correct hits earned this standing. */
  standing: number;
}

export interface ReflexArcConfig {
  /** Consecutive correct hits before standing is conferred (default 3). */
  diplomaN?: number;
}

export class ReflexArc {
  private diplomaN: number;
  private standing = new Map<string, { reflex: Reflex; streak: number }>();

  constructor(config: ReflexArcConfig = {}) {
    this.diplomaN = Math.max(1, config.diplomaN ?? 3);
  }

  /** Normalize a trigger to a content-addressed key (exact-match recall). */
  private key(trigger: string): string {
    return trigger.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /** Consecutive correct hits recorded for this trigger (0 if unseen). */
  streak(trigger: string): number {
    return this.standing.get(this.key(trigger))?.streak ?? 0;
  }

  /** Has this trigger earned standing (may answer from the arc)? */
  hasStanding(trigger: string): boolean {
    return this.streak(trigger) >= this.diplomaN;
  }

  /**
   * O(1) recall: if this exact trigger has earned standing, return its reflex
   * with no embed and no vector query. Otherwise null — fall through to the
   * engine. This is the point of the whole module: skip the brain when the
   * spinal cord already knows.
   */
  recall(trigger: string): ReflexRecall | null {
    const s = this.standing.get(this.key(trigger));
    if (!s || s.streak < this.diplomaN) return null;
    return { kind: 'reflex', reflex: s.reflex, standing: s.streak };
  }

  /**
   * A confirmed-correct outcome advances the streak toward (and past) standing.
   * Standing is the arc's to confer — a caller cannot grant its own.
   */
  reward(trigger: string, reflex: Reflex): void {
    const k = this.key(trigger);
    const prev = this.standing.get(k);
    const streak = (prev && prev.reflex.id === reflex.id ? prev.streak : 0) + 1;
    this.standing.set(k, { reflex, streak });
  }

  /** Any miss tears up standing — the reflex must re-earn the fast path. */
  revoke(trigger: string): void {
    this.standing.delete(this.key(trigger));
  }

  /** How many triggers currently hold standing. */
  get size(): number {
    let n = 0;
    for (const s of this.standing.values()) if (s.streak >= this.diplomaN) n++;
    return n;
  }
}
