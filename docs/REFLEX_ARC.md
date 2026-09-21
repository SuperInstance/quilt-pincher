# Reflex Arc — earned standing, the fast path below the fast path

The engine's fastest tier is a vector query + threshold (`<50ms`). But a reflex
that has fired **correctly for the same trigger, again and again** shouldn't need
the query at all. In a body, a signal that has proven itself doesn't travel to the
brain — it turns around at the spinal cord. That's a *reflex arc*.

`ReflexArc` (`src/adapters/reflex-arc.ts`) is that fourth verdict, below
`ACT / CONFIRM / COMPILE`:

- **`REFLEX`** — an O(1), embed-free, query-free recall for a trigger whose reflex
  the world has proven `diplomaN` times in a row.

```ts
import { ReflexArc } from '@quilt/pincher';

const arc = new ReflexArc({ diplomaN: 3 });

// on every confirmed-correct outcome, reward the arc:
arc.reward(pinch.trigger, reflex);

// on the hot path, try the arc BEFORE the engine:
const fast = arc.recall(pinch.trigger);
if (fast) {
  // fast.reflex — no embed, no vector query. Execute straight away.
} else {
  const result = await engine.run(pinch);   // fall through to ACT/CONFIRM/COMPILE
}

// on a miss (the world drifted), tear up standing — it must be re-earned:
arc.revoke(pinch.trigger);
```

## Why it matters (rough seas)

Standing pays off exactly where cycles are scarcest and the network is a rumour:

- **ESP32 / offline.** No embed, no similarity scan — a `Map` lookup. The
  `<200ms` embedded tier gets an even faster inner loop for its hottest triggers.
- **Cost.** The hottest reflexes stop paying the query tax entirely.

And it stays honest:

- **Earned, never self-granted.** Only `reward` (a confirmed-correct outcome)
  confers standing; `diplomaN` consecutive hits are required.
- **Revocable.** One miss (`revoke`) tears it up — a reflex whose world has
  drifted loses the fast path the instant it is wrong, and must re-earn it. No
  permanent, stale confidence.
- **Content-addressed.** Recall is exact-trigger, whitespace/case-normalized; a
  different reflex for the same trigger resets the streak (no cross-credit).

## Lineage

This is R2 on the [frontier ladder](https://github.com/SuperInstance/jev-quilt/blob/main/docs/FRONTIER.md)
(jev-quilt) — the *earned, revocable fourth verdict* — brought home to the reflex
engine, where `confidence` and `hits` were already waiting for it. It composes
over the engine without touching it: another Quilt cell in the sheet.
