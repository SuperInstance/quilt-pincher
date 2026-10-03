/**
 * FB2 pins — zeroclaw synapse: spec-dir loading + serve CLI (FAIL-first:
 * written before src/adapters/zeroclaw-spec.ts and src/cli/serve.ts existed).
 *
 * The loop under test: zeroclaw files a reflex spec (grammar-N1 JSON) after
 * an LLM run; pincher loads the spec dir and SERVES the stored payload on a
 * matching trigger — FAST tier, no LLM, 0 tokens. Cache integrity rule:
 * zeroclaw only trusts a hit whose spec context_sha256 matches the current
 * context hash (tested zeroclaw-side in fleet-seeds tools/zeroclaw pins).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { PincherEngine, HDCEmbedder, MemoryReflexStore } from '../src/index.js';
import { loadZeroclawSpecs } from '../src/adapters/zeroclaw-spec.js';
import { serveOnce } from '../src/cli/serve.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIXTURE = join(HERE, 'fixtures', 'zeroclaw-spec.example.json');

function fixtureTrigger(): string {
  return JSON.parse(readFileSync(FIXTURE, 'utf8')).trigger as string;
}

async function engineWithSpecs(dir: string) {
  const engine = new PincherEngine({
    embedder: new HDCEmbedder(1024),
    store: new MemoryReflexStore(),
  });
  for (const reflex of await loadZeroclawSpecs(dir, new HDCEmbedder(1024))) {
    await engine.addReflex(reflex);
  }
  return engine;
}

test('spec loader: fixture becomes a Reflex with grammar-N1 payload in its action', async () => {
  const specs = await loadZeroclawSpecs(join(HERE, 'fixtures'), new HDCEmbedder(1024));
  assert.equal(specs.length, 1);
  const r = specs[0]!;
  assert.equal(r.id, 'zc-deadbeefcafe0001');
  assert.equal(r.embedding.length, 1024);
  assert.equal(r.provenance?.compiledBy, 'zeroclaw:fleet-seeds-last3-scout-delta');
  const payload = JSON.parse(r.action.match(/^return (\{.+\});$/)?.[1] ?? '{}');
  assert.equal(payload.output_sha256, '0e8b3322532e41a36ce1c0895b7bb74b1b8e4c89a52c8c1d05e0ff9dcd7e99f3');
  assert.deepEqual(payload.cites, [
    'git:e9363fa49548c12239da58745120e4fb59b61250',
    'tip:b92d3cd2e735e8f5fdad0c008446a93667aa4ee0c0a06c4bcb2a3e2bccf5f572',
    'row:3d0e52b8b056327d',
  ]);
});

test('serve: exact trigger hits FAST tier and roundtrips the payload', async () => {
  const engine = await engineWithSpecs(join(HERE, 'fixtures'));
  const result = await engine.run({ trigger: fixtureTrigger() });
  assert.equal(result.kind, 'hit');
  if (result.kind !== 'hit') return;
  const out = result.output as { content: string; output_sha256: string; cites: string[] };
  assert.equal(out.content, '# fixture delta\n\npincher serve roundtrip payload. not a real scouting delta.\n');
  assert.equal(out.output_sha256, '0e8b3322532e41a36ce1c0895b7bb74b1b8e4c89a52c8c1d05e0ff9dcd7e99f3');
  assert.equal(out.cites.length, 3);

// 2b. origin_row rides the payload when the spec carries it (receipt back-pointer)
test('serve: spec with origin_row serves it in the payload', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zc-origin-'));
  const spec = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  spec.origin_row = 'a9c357eca6160000';
  writeFileSync(join(dir, 'spec.json'), JSON.stringify(spec));
  const { result, exitCode } = await serveOnce({ trigger: spec.trigger, specDir: dir });
  assert.equal(exitCode, 0);
  assert.equal((result as { kind: string; output: { origin_row?: string } }).output.origin_row, 'a9c357eca6160000');
});
  assert.ok(result.latencyMs < 50, `FAST tier contract: ${result.latencyMs}ms`);
});

test('serve: foreign trigger misses cleanly (exit 4), nothing learned or written', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'zc-specs-'));
  writeFileSync(join(dir, 'spec.json'), readFileSync(FIXTURE));
  const { result, exitCode } = await serveOnce({
    trigger: 'a completely unrelated standing order about tide pools',
    specDir: dir,
  });
  assert.equal(result.kind, 'error'); // engine: no compiler configured
  assert.equal(exitCode, 4); // CLI maps no-match to 4 — never softens
  assert.equal(readdirSync(dir).filter((f) => f.endsWith('.json')).length, 1); // no junk specs
});

test('cache-integrity law: raw engine recall is FUZZY (documented), serve enforces exact context_sha', async () => {
  const engine = await engineWithSpecs(join(HERE, 'fixtures'));
  const drifted = fixtureTrigger().replace('face0000', 'face0001');
  // raw engine: one-hex drift still cosines above hit threshold — recall is fuzzy BY DESIGN
  const fuzzy = await engine.run({ trigger: drifted });
  assert.equal(fuzzy.kind, 'hit');
  // serve layer: exact context_sha256 prefilter makes drifted context ineligible
  const { result, exitCode } = await serveOnce({
    trigger: fixtureTrigger(),
    specDir: join(HERE, 'fixtures'),
    contextSha256: 'face0001000000000000000000000000000000000000000000000000000000babe',
  });
  assert.equal(result.kind, 'error');
  assert.equal(exitCode, 4); // fell through — zeroclaw takes the LLM path honestly
});
