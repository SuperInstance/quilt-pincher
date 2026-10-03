/**
 * pincher serve — the read side of the zeroclaw synapse (FB2).
 *
 * Usage:
 *   node dist/cli/serve.js --trigger-file <path> --spec-dir <dir> [--field-json '<ExoJFieldState>']
 *
 * Loads every zeroclaw reflex spec in --spec-dir, embeds the trigger file
 * verbatim (deterministic — same bytes, same HDC embedding), and answers:
 *   exit 0  hit/confirm — payload JSON on stdout
 *   exit 4  no match below confirm threshold (zeroclaw falls through to LLM)
 *   exit 5  vetoed
 *   exit 1  error
 *
 * No compiler is wired: serve NEVER learns by itself. Learning is zeroclaw
 * filing a better spec — the loop is receipted on both ledgers.
 */
import { readFileSync } from 'node:fs';
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
}

export async function serveOnce(opts: ServeOptions): Promise<ServeAnswer> {
  const embedder = new HDCEmbedder(1024);
  const engine = new PincherEngine({ embedder, store: new MemoryReflexStore() });
  const specs: ZeroclawSpec[] = [];
  await loadZeroclawSpecs(opts.specDir, embedder, (s) => {
    if (opts.contextSha256 && s.context_sha256 !== opts.contextSha256) return false;
    specs.push(s);
    return true;
  });
  for (const r of await loadZeroclawSpecs(opts.specDir, embedder, (s) =>
    opts.contextSha256 ? s.context_sha256 === opts.contextSha256 : true)) {
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
      return { result, exitCode: 0, spec };
    }
    case 'compiled': return { result, exitCode: 0 }; // unreachable without a compiler
    case 'vetoed': return { result, exitCode: 5 };
    case 'error': {
      const noMatch = /No match/.test(result.error);
      return { result, exitCode: noMatch ? 4 : 1 };
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
  if (!triggerFile || !specDir) {
    console.error('usage: serve --trigger-file <path> --spec-dir <dir> [--field-json <json>]');
    return 2;
  }
  const fieldJson = arg('--field-json');
  const contextSha = arg('--context-sha256');
  const answer = await serveOnce({
    trigger: readFileSync(triggerFile, 'utf8'),
    specDir,
    ...(fieldJson ? { field: JSON.parse(fieldJson) as ExoJFieldState } : {}),
    ...(contextSha ? { contextSha256: contextSha } : {}),
  });
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
