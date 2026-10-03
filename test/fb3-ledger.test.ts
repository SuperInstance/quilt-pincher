/**
 * FB3 pins — pincher-side stats ledger (FAIL-first, written before the
 * --ledger/--stats flags existed). The loop receipts on BOTH ledgers:
 * zeroclaw's journal carries the chain; pincher's ledger carries the traffic.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SERVE = join(__dirname, '..', 'src', 'cli', 'serve.ts');
const FIXTURE = join(__dirname, 'fixtures', 'zeroclaw-spec.example.json');
const CONTEXT_SHA = 'face0000000000000000000000000000000000000000000000000000000000babe';
const DRIFTED = 'face0001000000000000000000000000000000000000000000000000000000babe';

interface LedgerRow {
  ts: string; kind: string; exit_code: number; spec_id: string | null;
  latency_ms: number; trigger_sha256: string; context_sha256?: string; specs_loaded: number;
}

function serve(dir: string, trigger: string, ledger: string, contextSha?: string): { code: number; stdout: string } {
  const t = join(dir, 'trigger.txt');
  writeFileSync(t, trigger);
  try {
    const stdout = execFileSync('npx', ['tsx', SERVE, '--trigger-file', t, '--spec-dir', dir,
      '--ledger', ledger, ...(contextSha ? ['--context-sha256', contextSha] : [])],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout };
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    return { code: err.status ?? 1, stdout: err.stdout?.toString() ?? '' };
  }
}

function loadLedger(p: string): LedgerRow[] {
  return readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

test('FB3 pin 1: a hit appends a ledger row; hashes only, never payload content', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fb3-hit-'));
  const spec = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  writeFileSync(join(dir, 'spec.json'), JSON.stringify(spec));
  const ledger = join(dir, 'ledger.jsonl');
  const r = serve(dir, spec.trigger, ledger, CONTEXT_SHA);
  assert.equal(r.code, 0);
  const rows = loadLedger(ledger);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.exit_code, 0);
  assert.equal(row.spec_id, spec.id);
  assert.match(row.ts, /^\d{4}-/);
  assert.equal(row.context_sha256, CONTEXT_SHA);
  assert.ok(row.latency_ms >= 0);
  // privacy pin: the ledger must NEVER carry payload content or its sha-of-content
  assert.ok(!('content' in row), 'ledger row leaks content');
  assert.ok(!('output_sha256' in row), 'ledger row leaks output sha');
});

test('FB3 pin 2: an honest miss (exit 4) is ledgered too — misses are traffic', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fb3-miss-'));
  const spec = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  writeFileSync(join(dir, 'spec.json'), JSON.stringify(spec));
  const ledger = join(dir, 'ledger.jsonl');
  const r = serve(dir, spec.trigger, ledger, DRIFTED);
  assert.equal(r.code, 4);
  const rows = loadLedger(ledger);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].exit_code, 4);
  assert.equal(rows[0].spec_id, null);
  assert.equal(rows[0].specs_loaded, 0); // drifted context filtered everything
});

test('FB3 pin 3: ledger is append-only across invocations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fb3-append-'));
  const spec = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  writeFileSync(join(dir, 'spec.json'), JSON.stringify(spec));
  const ledger = join(dir, 'ledger.jsonl');
  serve(dir, spec.trigger, ledger, CONTEXT_SHA);
  const first = loadLedger(ledger)[0];
  serve(dir, 'order:other\nnope\ncontext-sha256:' + CONTEXT_SHA, ledger, CONTEXT_SHA);
  const rows = loadLedger(ledger);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], first); // first row byte-unchanged after the second append
});

test('FB3 pin 4: --stats summarizes hits/misses/mean latency from the ledger', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fb3-stats-'));
  const spec = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  writeFileSync(join(dir, 'spec.json'), JSON.stringify(spec));
  const ledger = join(dir, 'ledger.jsonl');
  serve(dir, spec.trigger, ledger, CONTEXT_SHA);          // hit
  serve(dir, spec.trigger, ledger, DRIFTED);              // miss
  const out = execFileSync('npx', ['tsx', SERVE, '--stats', ledger], { encoding: 'utf8' });
  const stats = JSON.parse(out.trim());
  assert.equal(stats.rows, 2);
  assert.equal(stats.hits, 1);
  assert.equal(stats.misses, 1);
  assert.ok(stats.mean_latency_ms >= 0);
});
