// The docs folder is generated from the same guides the app shows. This fails if someone changes a guide and forgets to
// regenerate, so what you read in docs/ is always what the app says.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOC_FILES } from '../scripts/docs-render.ts';

const DOCS = join(process.cwd(), '..', 'docs');

describe('the docs match the guides', () => {
  for (const [name, render] of Object.entries(DOC_FILES)) {
    test(`docs/${name} is up to date`, () => {
      assert.ok(existsSync(join(DOCS, name)), `docs/${name} is missing: run "npm run docs"`);
      assert.equal(readFileSync(join(DOCS, name), 'utf8'), render(), `docs/${name} is stale: run "npm run docs"`);
    });
  }

  test('the hand-written docs exist', () => {
    for (const n of ['README.md', 'ARCHITECTURE.md', 'RUNNING-THE-SQL.md']) assert.ok(existsSync(join(DOCS, n)), `docs/${n} is missing`);
    assert.ok(existsSync(join(DOCS, '..', 'supabase', 'README.md')), 'supabase/README.md is missing');
  });

  test('no doc contains a real secret or a placeholder that was left half-filled', () => {
    for (const name of Object.keys(DOC_FILES)) {
      const text = readFileSync(join(DOCS, name), 'utf8');
      assert.doesNotMatch(text, /sk_(live|test)_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|rk_(live|test)_[A-Za-z0-9]{10,}/, name);
      assert.doesNotMatch(text, /undefined|\[object Object\]/, name);
    }
  });
});
