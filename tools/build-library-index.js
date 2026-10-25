/*
 * Builds library/index.json from the content files in the library folder.
 *
 *   node tools/build-library-index.js           check every file and write library/index.json
 *   node tools/build-library-index.js --check   only check (nothing is written); exit code 1 when a file is wrong
 *
 * Files and folders whose name starts with "_" (for example library/_examples) are ignored.
 */
const fs = require('fs');
const path = require('path');
const { parseItem } = require('../src/library');

function findFiles(dir, base = dir, out = []) {
  for (const name of fs.readdirSync(dir).sort()) {
    if (name.startsWith('_') || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) findFiles(full, base, out);
    else if (name.endsWith('.json') && !(dir === base && name === 'index.json')) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/** returns { index, problems: [text] } for the library folder */
function build(dir) {
  const problems = [];
  const items = [];
  const ids = new Map();
  for (const file of findFiles(dir)) {
    let pack;
    try {
      pack = parseItem(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
    } catch (e) {
      problems.push(`${file}: ${e.message}`);
      continue;
    }
    if (ids.has(pack.id)) {
      problems.push(`${file}: the id is already used by ${ids.get(pack.id)}`);
      continue;
    }
    ids.set(pack.id, file);
    const words = pack.decks.reduce((n, d) => n + d.cards.length, 0);
    items.push({ id: pack.id.replace(/^lib-/, ''), file, name: pack.name, language: pack.language, lang: pack.lang, sections: pack.decks.length, words });
  }
  items.sort((a, b) => a.language.localeCompare(b.language) || a.name.localeCompare(b.name));
  return { index: { version: 1, items }, problems };
}

module.exports = { build, findFiles };

if (require.main === module) {
  const dir = path.join(__dirname, '..', 'library');
  const check = process.argv.includes('--check');
  const { index, problems } = build(dir);
  for (const p of problems) console.error('PROBLEM  ' + p);
  if (problems.length) {
    console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'} found. Fix them and run this again.`);
    process.exit(1);
  }
  if (!check) {
    fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
    console.log(`library/index.json written: ${index.items.length} file${index.items.length === 1 ? '' : 's'}.`);
  } else {
    console.log(`All ${index.items.length} file${index.items.length === 1 ? ' is' : 's are'} fine.`);
  }
}
