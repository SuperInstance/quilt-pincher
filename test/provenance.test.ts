/**
 * Provenance pins — the FB1 ExoJ field seam cites its canonical source.
 *
 * FAIL-first: on main (pre-this-PR) neither docs/EXOJ-PROVENANCE.md exists
 * nor does the exoj-field.ts header carry the pinned-commit citation, so
 * every pin below is RED there. The RED run is the receipt.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHA = 'bfbe4614b5e26478c79068a89a5e5a54758d9dd7';
const SHA_RE = /^[0-9a-f]{40}$/;

describe('exoj provenance', () => {
  test('docs/EXOJ-PROVENANCE.md names the source repo and a pinned 40-hex commit', () => {
    const doc = readFileSync(join(ROOT, 'docs', 'EXOJ-PROVENANCE.md'), 'utf8');
    assert.ok(doc.includes('SuperInstance/exoj'), 'doc must name the source repo');
    assert.ok(doc.includes(SHA), 'doc must carry the pinned commit');
    const m = doc.match(/[0-9a-f]{40}/);
    assert.ok(m && SHA_RE.test(m[0]), 'pinned ref must be a full 40-hex SHA');
  });

  test('docs/EXOJ-PROVENANCE.md honestly flags ι as non-charter (lode derivative)', () => {
    const doc = readFileSync(join(ROOT, 'docs', 'EXOJ-PROVENANCE.md'), 'utf8');
    assert.ok(/not.*charter|absent from the exoj charter/i.test(doc),
      'doc must admit ι is a lode derivative, not charter');
  });

  test('exoj-field.ts header cites the same pinned commit', () => {
    const src = readFileSync(join(ROOT, 'src', 'hdc', 'exoj-field.ts'), 'utf8');
    const header = src.slice(0, src.indexOf('*/'));
    assert.ok(header.includes('SuperInstance/exoj'), 'header must name the source repo');
    assert.ok(header.includes(SHA), 'header must carry the pinned commit');
  });

  test('the pinned commit resolves in SuperInstance/exoj (gh api)', () => {
    // Existence proof, not content equality: gh api returns the commit or fails.
    const out = execFileSync('gh', [
      'api', `repos/SuperInstance/exoj/commits/${SHA}`,
      '--jq', '.sha',
    ], { encoding: 'utf8' }).trim();
    assert.ok(SHA_RE.test(out), `gh api did not return a SHA for pinned commit (got "${out}")`);
  });
});
