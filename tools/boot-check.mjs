// Boot check — imports every module so a missing export or a typo in top-level
// code fails here instead of in the browser. Run with `node tools/boot-check.mjs`.

import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// The screens touch `document` only inside render functions, but a couple of
// systems read it at import time; a stub keeps those modules importable.
const stub = () => ({ style: {}, append() {}, addEventListener() {}, setAttribute() {} });
globalThis.document = globalThis.document || {
  documentElement: { lang: 'en', classList: { add() {}, remove() {}, toggle() {} } },
  createElement: stub,
  createDocumentFragment: stub,
  createTextNode: (text) => ({ text }),
  addEventListener() {},
  querySelector: () => null,
  getElementById: () => null,
  body: stub(),
};
globalThis.window = globalThis.window || { addEventListener() {}, matchMedia: () => ({ matches: false }) };

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (entry.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

const files = walk('src').sort();
const failed = [];

for (const file of files) {
  try {
    await import(pathToFileURL(join(ROOT, file)).href);
    console.log(`  ok   ${file}`);
  } catch (error) {
    failed.push(file);
    console.log(`  FAIL ${file}`);
    console.log(`       ${error.message.split('\n')[0]}`);
  }
}

console.log(`\n${files.length - failed.length}/${files.length} modules imported`);

if (failed.length) {
  console.error(`broken: ${failed.join(', ')}`);
  process.exit(1);
}
