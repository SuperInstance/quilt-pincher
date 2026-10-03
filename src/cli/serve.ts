/**
 * pincher serve — the read side of the zeroclaw synapse (FB2).
 *
 * Usage:
 *   node dist/cli/serve.js --trigger-file <path> --spec-dir <dir> [--field-json '<ExoJFieldState>'] [--ledger <path>] [--stats <path>]
 *
 * Loads every zeroclaw reflex spec in --spec-dir, embeds the trigger file
 * verbatim (deterministic — same bytes, same HDC embedding), and answers:
 *   exit 0  hit/confirm — payload JSON on stdout
 *   exit 4  no match below confirm threshold (zeroclaw falls through to LLM)
 *   exit 5  vetoed
 *   exit 1  error
 *
 * FB3: --ledger <path> appends ONE JSONL stats row per invocation (hashes
 * only — never payload content; the receipt chain lives on zeroclaw's side).
 * --stats <path> summarizes that ledger. Two ledgers, one loop.
 *
 * No compiler is wired: serve NEVER learns by itself. Learning is zeroclaw
 * filing a better spec — the loop is receipted on both ledgers.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PincherEngine, HDCEmbedder, MemoryReflexStore } from '../index.js';
import { loadZeroclawSpecs, type ZeroclawSpec } from '../adapters/zeroclaw-spec.js';
import type { PinchResult, ExoJFieldState } from '../index.js';

export interface ServeOptions {
  trigger: string;
  specDir: string;
  field?: ExoJFieldState;
  /**
   * Cache-integrity law: when supplied, only specs whose context_sha256
   * EXACTLY equals this value are eligible. HDC recall is fuzzy (a one-hex
   * context drift still cosines >= hit threshold) — exactness is enforced
   * here, at the serve layer, not by hoping the embedding notices.
   */
  contextSha256?: string;
}

export interface ServeAnswer {
  result: PinchResult;
  exitCode: number;
  spec?: ZeroclawSpec; // the spec that hit (zeroclaw re-checks context_sha256)
  specsLoaded: number; // eligible specs loaded (post context_sha256 filter)
}

/** FB3: one stats row per invocation. HASHES ONLY — the payload content and
 * the receipt chain belong to zeroclaw's journal; this is a traffic ledger. */
export interface ServeStatsRow {
  ts: string;
  kind: PinchResult['kind'];
  exit_code: number;
  spec_id: string | null;
  latency_ms: number;
  trigger_sha256: string;
  context_sha256?: string;
  specs_loaded: number;
}

export function appendLedgerRow(ledgerPath: string, row: ServeStatsRow): void {
  appendFileSync(ledgerPath, JSON.stringify(row) + '\n');
}

/** Summarize a ledger: counts by kind, hits, misses (exit 4), errors, mean latency. */
export function summarizeLedger(ledgerPath: string) {
  if (!existsSync(ledgerPath)) return { rows: 0, hits: 0, misses: 0, vetoed: 0, errors: 0, mean_latency_ms: 0 };
  const rows: ServeStatsRow[] = readFileSync(ledgerPath, 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const hits = rows.filter((r) => r.exit_code === 0).length;
  const misses = rows.filter((r) => r.exit_code === 4).length;
  const vetoed = rows.filter((r) => r.exit_code === 5).length;
  const errors = rows.filter((r) => r.exit_code === 1).length;
  const mean = rows.length ? rows.reduce((a, r) => a + r.latency_ms, 0) / rows.length : 0;
  return { rows: rows.length, hits, misses, vetoed, errors, mean_latency_ms: Math.round(mean * 100) / 100 };
}

export async function serveOnce(opts: ServeOptions): Promise<ServeAnswer> {
  const embedder = new HDCEmbedder(1024);
  const engine = new PincherEngine({ embedder, store: new MemoryReflexStore() });
  const specs: ZeroclawSpec[] = [];
  for (const r of await loadZeroclawSpecs(opts.specDir, embedder, (s) => {
    const eligible = opts.contextSha256 ? s.context_sha256 === opts.contextSha256 : true;
    if (eligible) specs.push(s);
    return eligible;
  })) {
    await engine.addReflex(r);
  }
  const result = await engine.run({
    trigger: opts.trigger,
    ...(opts.field ? { context: { exojField: opts.field } } : {}),
  });
  switch (result.kind) {
    case 'hit':
    case 'confirm': {
      const reflexId = result.reflex.id;
      const spec = specs.find((s) => s.id === reflexId);
      return { result, exitCode: 0, spec, specsLoaded: specs.length };
    }
    case 'compiled': return { result, exitCode: 0, specsLoaded: specs.length }; // unreachable without a compiler
    case 'vetoed': return { result, exitCode: 5, specsLoaded: specs.length };
    case 'error': {
      const noMatch = /No match/.test(result.error);
      return { result, exitCode: noMatch ? 4 : 1, specsLoaded: specs.length };
    }
  }
}

export async function main(argv: string[]): Promise<number> {
  const arg = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const triggerFile = arg('--trigger-file');
  const specDir = arg('--spec-dir');
  const fieldJson = arg('--field-json');
  const contextSha = arg('--context-sha256');
  const ledger = arg('--ledger');
  const statsPath = arg('--stats');
  if (statsPath) {
    console.log(JSON.stringify({ ledger: statsPath, ...summarizeLedger(statsPath) }));
    return 0;
  }
  if (!triggerFile || !specDir) {
    console.error('usage: serve --trigger-file <path> --spec-dir <dir> [--field-json <json>] [--ledger <path>] [--stats <path>]');
    return 2;
  }
  const trigger = readFileSync(triggerFile, 'utf8');
  const answer = await serveOnce({
    trigger,
    specDir,
    ...(fieldJson ? { field: JSON.parse(fieldJson) as ExoJFieldState } : {}),
    ...(contextSha ? { contextSha256: contextSha } : {}),
  });
  if (ledger) {
    appendLedgerRow(ledger, {
      ts: new Date().toISOString(),
      kind: answer.result.kind,
      exit_code: answer.exitCode,
      spec_id: answer.spec?.id ?? null,
      latency_ms: answer.result.latencyMs,
      trigger_sha256: createHash('sha256').update(trigger).digest('hex'),
      ...(contextSha ? { context_sha256: contextSha } : {}),
      specs_loaded: answer.specsLoaded,
    });
  }
  console.log(JSON.stringify({
    kind: answer.result.kind,
    latencyMs: answer.result.latencyMs,
    specId: answer.spec?.id ?? null,
    output: answer.result.kind === 'hit' || answer.result.kind === 'confirm' || answer.result.kind === 'compiled'
      ? answer.result.output : null,
    error: answer.result.kind === 'error' ? answer.result.error
      : answer.result.kind === 'vetoed' ? answer.result.reason : null,
  }));
  return answer.exitCode;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
