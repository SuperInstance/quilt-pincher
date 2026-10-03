/**
 * Zeroclaw spec adapter (FB2 — the synapse, first half).
 *
 * zeroclaw (fleet-seeds tools/zeroclaw, Python) files reflex specs as
 * grammar-N1 JSON after each LLM run. pincher loads a directory of those
 * specs and serves the stored payload on a matching trigger — FAST tier,
 * no LLM, 0 tokens. The spec dir is the shared format; no wire protocol.
 *
 * Spec shape (zeroclaw-reflex-spec/v1):
 *   id, intent, trigger (exact string zeroclaw hashes its context into),
 *   context_sha256 (cache-integrity law — zeroclaw re-checks before
 *   trusting), model, payload {delta_path, output_sha256, content, bytes},
 *   cites[] (grammar N1), provenance {compiledBy: 'zeroclaw', parentOrder}
 *
 * The engine executes actions as JS via `new Function`; this adapter wraps
 * the payload as a data literal (`return {...};`) so the payload is DATA,
 * not code. Grammar-N1 cites ride inside the payload.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Reflex, Embedder } from '../core/types.js';

export interface ZeroclawSpec {
  id: string;
  intent: string;
  trigger: string;
  context_sha256: string;
  model: string;
  payload: {
    delta_path: string;
    output_sha256: string;
    content: string;
    bytes: number;
  };
  /** Receipt back-pointer: the zeroclaw journal row that earned this reflex. */
  origin_row?: string;
  cites: string[];
  provenance: { compiledBy: string; parentOrder?: string };
}

export function parseZeroclawSpec(json: string): ZeroclawSpec {
  const spec = JSON.parse(json);
  for (const k of ['id', 'intent', 'trigger', 'context_sha256', 'model', 'payload', 'cites', 'provenance']) {
    if (!(k in spec)) throw new Error(`zeroclaw spec: missing field '${k}'`);
  }
  if (spec.provenance.compiledBy !== 'zeroclaw') {
    throw new Error(`zeroclaw spec ${spec.id}: provenance.compiledBy must be 'zeroclaw'`);
  }
  if (spec.payload.output_sha256.length !== 64) {
    throw new Error(`zeroclaw spec ${spec.id}: payload.output_sha256 must be 64 hex`);
  }
  return spec as ZeroclawSpec;
}

export function listZeroclawSpecs(dir: string): ZeroclawSpec[] {
  const out: ZeroclawSpec[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    out.push(parseZeroclawSpec(readFileSync(join(dir, file), 'utf8')));
  }
  return out;
}

export async function loadZeroclawSpecs(
  dir: string,
  embedder: Embedder,
  eligible?: (spec: ZeroclawSpec) => boolean,
): Promise<Reflex[]> {
  const out: Reflex[] = [];
  for (const spec of listZeroclawSpecs(dir)) {
    if (eligible && !eligible(spec)) continue;
    const payload = {
      ...spec.payload, cites: spec.cites, model: spec.model,
      ...(spec.origin_row ? { origin_row: spec.origin_row } : {}),
    };
    out.push({
      id: spec.id,
      embedding: await embedder.embed(spec.trigger),
      intent: spec.intent,
      action: `return ${JSON.stringify(payload)};`,
      safety: { sandbox: 'none', network: 'none', filesystem: 'none', timeoutMs: 100 },
      confidence: 0.99, // human-agent-filed; earned by the LLM run it receipts
      hits: 0,
      createdAt: Date.now(),
      lastHitAt: 0,
      provenance: { compiledBy: `zeroclaw:${spec.provenance.parentOrder ?? 'unknown'}` },
    });
  }
  return out;
}
