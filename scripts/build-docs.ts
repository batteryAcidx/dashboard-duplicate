// Writes the generated docs. Usage (from engine-tests): npm run docs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOC_FILES } from './docs-render';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
mkdirSync(dir, { recursive: true });
for (const [name, render] of Object.entries(DOC_FILES)) {
  writeFileSync(join(dir, name), render());
  console.log('wrote docs/' + name);
}
