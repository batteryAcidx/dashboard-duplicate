// These tests are the guard rails. They fail when someone (including future me) breaks the separation
// between the layers, so changing one part can never quietly ruin another.
//
//   domain/        pure rules and types       may import: nothing outside domain
//   api/           the only talker to Supabase may import: domain, lib/supabase
//   lib/           small helpers              may import: domain, other lib
//   components/    shared presentation        may import: domain, lib, other components (never api, never the database)
//   integrations/  pluggable services (UI)    may import: api, domain, components, lib
//   features/      screens, by area           may import: api, domain, components, lib, integrations
//   pages/         one address = one screen   may import anything above
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';

const SRC = join(process.cwd(), '..', 'src');
const ROOT = join(process.cwd(), '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

interface Imp { file: string; spec: string; target: string | null }
function importsOf(file: string): Imp[] {
  const text = readFileSync(file, 'utf8');
  const out: Imp[] = [];
  const re = /(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;
  for (const m of text.matchAll(re)) {
    const spec = (m[1] ?? m[2]) as string;
    out.push({ file, spec, target: spec.startsWith('.') ? normalize(join(dirname(file), spec)) : null });
  }
  return out;
}

const files = walk(SRC);
const LAYERS = ['domain', 'api', 'lib', 'components', 'integrations', 'features', 'pages'];
const layerOf = (abs: string): string => {
  const rel = relative(SRC, abs).split(sep);
  // importing a whole folder ("../../domain") counts as that layer, a loose file at the top is "root"
  if (rel.length === 1) return LAYERS.includes(rel[0]) ? rel[0] : 'root';
  return rel[0];
};
const all = files.flatMap(importsOf);

const ALLOWED: Record<string, string[]> = {
  domain: ['domain'],
  api: ['api', 'domain', 'lib'],
  lib: ['lib', 'domain', 'api'],
  components: ['components', 'domain', 'lib'],
  integrations: ['integrations', 'api', 'domain', 'components', 'lib'],
  features: ['features', 'api', 'domain', 'components', 'lib', 'integrations'],
  pages: ['pages', 'features', 'api', 'domain', 'components', 'lib', 'integrations'],
  root: ['pages', 'api', 'domain', 'components', 'lib', 'features', 'integrations', 'root'],
};

describe('the layers stay separate', () => {
  test('every file imports only from the layers it is allowed to', () => {
    const bad: string[] = [];
    for (const i of all) {
      if (!i.target) continue;
      const from = layerOf(i.file);
      const to = layerOf(i.target);
      const allowed = ALLOWED[from];
      if (!allowed) continue;
      // lib/supabase.ts and lib/config.ts are the two doors to the outside world, covered by their own tests below
      if (!allowed.includes(to)) bad.push(`${relative(SRC, i.file)} (${from}) imports ${i.spec} (${to})`);
    }
    assert.deepEqual(bad, [], 'a layer reached into one it must not know about');
  });

  test('only the data layer talks to the database', () => {
    const bad = all
      .filter((i) => /(^|\/)lib\/supabase$/.test(i.spec) || i.spec === '@supabase/supabase-js')
      .filter((i) => !relative(SRC, i.file).startsWith('api' + sep) && !relative(SRC, i.file).endsWith(join('lib', 'supabase.ts')))
      .map((i) => `${relative(SRC, i.file)} imports ${i.spec}`);
    assert.deepEqual(bad, [], 'a screen is talking to the database directly: move the call into src/api');
  });

  test('the pure layer is really pure: no React, no browser, no network, no environment', () => {
    const bad: string[] = [];
    for (const f of files.filter((f) => layerOf(f) === 'domain')) {
      const text = readFileSync(f, 'utf8');
      for (const i of importsOf(f)) if (!i.target) bad.push(`${relative(SRC, f)} imports the package ${i.spec}`);
      // real code only: sentences such as "left in the window." must not trip it
      const code = text.replace(/`[^`]*`/g, '``').replace(/'[^'\n]*'/g, "''").replace(/\/\/[^\n]*/g, '');
      for (const [label, re] of [['window', /\bwindow\.[A-Za-z_]/], ['document', /\bdocument\.[A-Za-z_]/], ['localStorage', /\blocalStorage\b/], ['fetch', /\bfetch\(/], ['import.meta', /import\.meta/], ['supabase', /\bsupabase\b/]] as [string, RegExp][]) {
        if (re.test(code)) bad.push(`${relative(SRC, f)} uses ${label}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  test('settings from the environment are read in one file each', () => {
    const readers = files.filter((f) => readFileSync(f, 'utf8').includes('import.meta')).map((f) => relative(SRC, f).split(sep).join('/')).sort();
    assert.deepEqual(readers, ['lib/config.ts', 'lib/supabase.ts']);
  });

  test('the screens never reach into the backend folder', () => {
    const bad = all.filter((i) => i.target && relative(ROOT, i.target).startsWith('supabase')).map((i) => `${relative(SRC, i.file)} imports ${i.spec}`);
    assert.deepEqual(bad, []);
  });

  test('backend shared code never imports the screens', () => {
    const dir = join(ROOT, 'supabase', 'functions', '_shared');
    const bad: string[] = [];
    for (const f of walk(dir)) for (const i of importsOf(f)) if (i.target && relative(dir, i.target).startsWith('..' + sep + '..' + sep + '..' + sep + 'src')) bad.push(`${relative(ROOT, f)} imports ${i.spec}`);
    for (const f of walk(dir)) for (const i of importsOf(f)) if (i.spec.includes('src/')) bad.push(`${relative(ROOT, f)} imports ${i.spec}`);
    assert.deepEqual(bad, []);
  });

  test('no screen file has grown into a heap', () => {
    const big = files
      .map((f) => ({ f: relative(SRC, f), n: readFileSync(f, 'utf8').split('\n').length }))
      .filter((x) => x.n > 1000)
      .map((x) => `${x.f}: ${x.n} lines`);
    assert.deepEqual(big, [], 'split it: one concern per file');
  });
});
