// Bundles the ES modules and stylesheet into one self-contained page: dist/tidepool.html.
// Modules are concatenated in the order the browser would evaluate them, inside one closure.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT = /^import \{[^}]*\} from '([^']+)';$/gm;

const order = [], seen = new Set();
function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(IMPORT)) visit(resolve(dirname(file), m[1]));
  order.push(file);
}
visit(join(root, 'js', 'main.js'));

// Every module shares one scope in the bundle, so a top-level name declared in two modules would break the page.
const owner = new Map(), clashes = [];
for (const file of order) {
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const fn = lines[i].match(/^(?:async\s+)?function\*?\s*([\w$]+)|^class ([\w$]+)/);
    let names = fn ? [fn[1] || fn[2]] : [];
    if (/^(?:const|let|var) /.test(lines[i])) {
      // a declaration list can run over several lines: read on until the brackets close and the line ends with ;
      let stmt = lines[i].replace(/^(?:const|let|var) /, '');
      while (!(depth(stmt) === 0 && /;\s*(\/\/.*)?$/.test(stmt)) && i + 1 < lines.length) stmt += '\n' + lines[++i];
      names = topLevelNames(stmt.replace(/;\s*(\/\/.*)?$/, ''));
    }
    for (const n of names) {
      if (owner.has(n) && owner.get(n) !== file) clashes.push(`${n}: ${relative(root, owner.get(n))} and ${relative(root, file)}`);
      else owner.set(n, file);
    }
  }
}
function depth(s) { let d = 0; for (const ch of s) { if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) d--; } return d; }
// Names declared by a `const a = …, b = …` list, skipping commas inside brackets.
function topLevelNames(s) {
  const names = [];
  let depth = 0, start = 0;
  for (let i = 0; i <= s.length; i++) {
    const ch = s[i];
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    if (i === s.length || (ch === ',' && depth === 0)) {
      const m = s.slice(start, i).trim().match(/^([\w$]+)\s*=/);
      if (m) names.push(m[1]);
      start = i + 1;
    }
  }
  return names;
}
if (clashes.length) {
  console.error('Top-level names declared in more than one module:\n  ' + clashes.join('\n  '));
  process.exit(1);
}
// Imports are dropped, so `import { a as b }` would leave b undefined in the bundle: name things the same everywhere.
const renamed = [];
for (const file of order) for (const m of readFileSync(file, 'utf8').matchAll(IMPORT)) {
  for (const part of m[0].slice(m[0].indexOf('{') + 1, m[0].indexOf('}')).split(',')) if (/\sas\s/.test(part)) renamed.push(`${part.trim()} in ${relative(root, file)}`);
}
if (renamed.length) {
  console.error('Imports that rename (the bundle can\'t follow them):\n  ' + renamed.join('\n  '));
  process.exit(1);
}

const bundle = order.map(file => {
  const src = readFileSync(file, 'utf8').replace(IMPORT, '').replace(/^export \{[^}]*\};$/gm, '').trim();
  return `// ---- ${relative(root, file).replace(/\\/g, '/')} ----\n${src}`;
}).join('\n\n');
// An import or export the regexes above didn't recognise would stay in the closure and stop the whole page.
const leftovers = bundle.split('\n').filter(l => /^\s*(import|export)\b/.test(l));
if (leftovers.length) {
  console.error('Import or export lines the build could not strip (use `import { a } from \'./x.js\';` and `export { a };`):\n  ' + leftovers.join('\n  '));
  process.exit(1);
}

const css = readFileSync(join(root, 'css', 'tidepool.css'), 'utf8');
let html = readFileSync(join(root, 'tidepool.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="css/tidepool.css">', () => `<style>\n${css}</style>`);
html = html.replace('<script type="module" src="js/main.js"></script>', () => `<script>\n(() => {\n'use strict';\n${bundle}\n})();\n</script>`);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'tidepool.html'), html);
console.log(`dist/tidepool.html: ${order.length} modules, ${(html.length / 1024).toFixed(1)} KB`);
