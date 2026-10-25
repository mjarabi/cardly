/* Tests for the online library: address handling, checking downloaded files, loading with and without a network,
 * and the tool that builds library/index.json. Run: node test/library.js */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('../src/library');
const { build } = require('../tools/build-library-index');

let passed = 0;
const pending = [];
function t(name, fn) {
  pending.push(async () => {
    try {
      await fn();
      passed++;
      console.log('  ok  ' + name);
    } catch (e) {
      process.exitCode = 1;
      console.log('  FAIL  ' + name + '\n        ' + ((e && e.message) || e));
    }
  });
}

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'library', f), 'utf8'));
const topic = (extra) =>
  Object.assign(
    { id: 'demo', name: 'Demo', language: 'German', lang: 'de', sections: [{ name: 'One', words: [['der Hund', 'noun', 'سگ', 'ein Tier', 'Ein Satz.', 'Zwei Sätze.', 'Drei Sätze.']] }] },
    extra || {}
  );

pending.push(async () => console.log('Addresses'));
t('the repository is found in the usual package.json spellings', () => {
  assert.deepStrictEqual(L.repoFromPackage({ repository: 'github:mj/cardly' }), { owner: 'mj', repo: 'cardly' });
  assert.deepStrictEqual(L.repoFromPackage({ repository: 'mj/cardly' }), { owner: 'mj', repo: 'cardly' });
  assert.deepStrictEqual(L.repoFromPackage({ repository: { type: 'git', url: 'git+https://github.com/mj/cardly.git' } }), { owner: 'mj', repo: 'cardly' });
  assert.deepStrictEqual(L.repoFromPackage({ repository: 'https://github.com/mj/card.ly/' }), { owner: 'mj', repo: 'card.ly' });
  assert.strictEqual(L.repoFromPackage({}), null);
  assert.strictEqual(L.repoFromPackage({ repository: 'nonsense' }), null);
  assert.strictEqual(L.repoFromPackage({ repository: 'https://example.com/a/b' }), null);
});
t('the library address points into the library folder of the main branch', () => {
  assert.strictEqual(L.baseUrl({ owner: 'mj', repo: 'cardly' }), 'https://raw.githubusercontent.com/mj/cardly/main/library');
});
t('only plain relative .json file names are accepted', () => {
  for (const ok of ['a.json', 'german/tiere.json', 'a-b_c/d.e.json']) assert.ok(L.safeFile(ok), ok);
  for (const bad of ['../x.json', 'a/../x.json', '/etc/x.json', 'a//b.json', 'x.js', 'x.json?y=1', 'http://x/y.json', 'a\\b.json', '', null, 5]) assert.ok(!L.safeFile(bad), String(bad));
});

pending.push(async () => console.log('\nChecking files'));
t('the index keeps good entries and drops unsafe or repeated ones', () => {
  const r = L.parseIndex({ items: [{ file: 'de/a.json', name: 'A' }, { file: '../evil.json' }, { file: 'de/a.json' }, { file: 'en/b.json' }, null] });
  assert.deepStrictEqual(r.map((x) => x.file), ['de/a.json', 'en/b.json']);
  assert.throws(() => L.parseIndex({}), /wrong shape/);
});
t('the example files in the library folder are valid', () => {
  for (const f of ['_examples/example-english.json', '_examples/example-german.json']) assert.ok(L.parseItem(read(f)).decks.length >= 1, f);
});
t('a German word becomes a card with its language, tags and spoken text', () => {
  const p = L.parseItem(topic());
  assert.strictEqual(p.id, 'lib-demo');
  assert.strictEqual(p.kind, 'topic');
  assert.strictEqual(p.language, 'German');
  const c = p.decks[0].cards[0];
  assert.strictEqual(c.front, 'der Hund\n~~noun~~');
  assert.strictEqual(c.lang, 'de');
  assert.strictEqual(c.sf, 'der Hund');
  assert.ok(c.tags.includes('german') && c.tags.includes('topic'));
  const lines = c.back.split('\n\n');
  assert.strictEqual(lines[0], 'سگ');
  assert.strictEqual(lines[2].split('\n').length, 3);
});
t('two definitions are numbered, and free cards are accepted', () => {
  const p = L.parseItem(
    topic({ sections: [{ name: 'One', words: [['current', 'noun', 'جریان', ['a flow of electricity', 'water moving one way'], 'a', 'b', 'c']] }, { name: 'Two', cards: [{ front: 'Guten Morgen', back: 'صبح بخیر', tags: ['Greeting', '!!'] }] }] })
  );
  assert.ok(p.decks[0].cards[0].back.includes('1. a flow of electricity\n2. water moving one way'));
  assert.deepStrictEqual(p.decks[1].cards[0].tags, ['greeting']);
  assert.strictEqual(p.decks[1].cards[0].lang, 'de');
});
t('a missing language code falls back to English', () => {
  assert.strictEqual(L.parseItem(topic({ lang: undefined, language: undefined })).lang, 'en');
  assert.strictEqual(L.parseItem(topic({ lang: 'not a code' })).lang, 'en');
});
t('mistakes give readable messages', () => {
  const bad = (obj, re) => assert.throws(() => L.parseItem(obj), re);
  bad(null, /not a JSON object/);
  bad(topic({ id: '' }), /"id" is missing/);
  bad(topic({ name: '' }), /"name" is missing/);
  bad(topic({ sections: [] }), /sections/);
  bad(topic({ sections: [{ name: '', words: [] }] }), /no "name"/);
  bad(topic({ sections: [{ name: 'A', words: [['x']] }] }), /needs \[word/);
  bad(topic({ sections: [{ name: 'A', words: [['x', 'noun', 'm', 'd', 'e', 5]] }] }), /short text/);
  bad(topic({ sections: [{ name: 'A', words: [] }] }), /no words or cards/);
  bad(topic({ sections: [{ name: 'A', cards: [{ front: 'x' }] }] }), /"front" and "back"/);
  const row = ['der Hund', 'noun', 'سگ', 'd', 'a', 'b', 'c'];
  bad(topic({ sections: [{ name: 'A', words: [row, row] }] }), /appears twice/);
  bad(topic({ sections: [{ name: 'A', words: [row] }, { name: 'A', words: [row] }] }), /used twice/);
});
t('too much content is refused', () => {
  const rows = Array.from({ length: L.LIMITS.cardsPerSection + 1 }, (_, i) => ['w' + i, 'noun', 'm', 'd', 'a', 'b', 'c']);
  assert.throws(() => L.parseItem(topic({ sections: [{ name: 'A', words: rows }] })), /too many cards/);
});
t('html in a card is kept as plain text (the app escapes it when drawing)', () => {
  const p = L.parseItem(topic({ sections: [{ name: 'A', cards: [{ front: '<img src=x onerror=alert(1)>', back: 'b' }] }] }));
  assert.strictEqual(p.decks[0].cards[0].front, '<img src=x onerror=alert(1)>');
  const R = require('../renderer/render.js');
  assert.ok(!/<img/.test(R.renderContent(p.decks[0].cards[0].front, {})));
});

pending.push(async () => console.log('\nLoading'));
function fakeNet(files, opts) {
  const cache = new Map();
  const o = opts || {};
  return {
    cache,
    fetchText: async (url) => {
      if (o.down) throw new Error('offline');
      const f = url.replace('https://x/library/', '');
      if (!(f in files)) throw new Error('HTTP 404');
      return typeof files[f] === 'string' ? files[f] : JSON.stringify(files[f]);
    },
    readCache: (k) => (cache.has(k) ? cache.get(k) : null),
    writeCache: (k, v) => cache.set(k, v)
  };
}
const BASE = 'https://x/library';
const goodFiles = () => ({
  'index.json': { version: 1, items: [{ file: 'german/tiere.json' }, { file: 'english/animals.json' }, { file: 'english/broken.json' }, { file: 'english/missing.json' }] },
  'german/tiere.json': topic({ id: 'de-tiere' }),
  'english/animals.json': topic({ id: 'en-animals', name: 'Animals', language: 'English', lang: 'en' }),
  'english/broken.json': { id: 'x' }
});
t('good files are loaded, bad ones are skipped with a message, results are sorted by language', async () => {
  const io = fakeNet(goodFiles());
  const r = await L.loadLibrary(BASE, io);
  assert.deepStrictEqual(r.packs.map((p) => p.id), ['lib-en-animals', 'lib-de-tiere']);
  assert.strictEqual(r.offline, false);
  assert.strictEqual(r.errors.length, 2);
  assert.ok(r.errors.some((e) => /broken\.json/.test(e)) && r.errors.some((e) => /missing\.json: could not be downloaded/.test(e)));
});
t('without internet the last saved copy is used', async () => {
  const io = fakeNet(goodFiles());
  await L.loadLibrary(BASE, io);
  const off = fakeNet({}, { down: true });
  off.cache = io.cache;
  off.readCache = (k) => io.cache.get(k) || null;
  const r = await L.loadLibrary(BASE, off);
  assert.strictEqual(r.offline, true);
  assert.strictEqual(r.packs.length, 2);
});
t('without internet and without a saved copy the message is clear', async () => {
  await assert.rejects(() => L.loadLibrary(BASE, fakeNet({}, { down: true })), /could not be reached/);
});
t('two files with the same id: the second is reported', async () => {
  const f = goodFiles();
  f['english/animals.json'] = topic({ id: 'de-tiere' });
  const r = await L.loadLibrary(BASE, fakeNet(f));
  assert.strictEqual(r.packs.filter((p) => p.id === 'lib-de-tiere').length, 1);
  assert.ok(r.errors.some((e) => /already used/.test(e)));
});
t('an empty library is fine', async () => {
  const r = await L.loadLibrary(BASE, fakeNet({ 'index.json': { version: 1, items: [] } }));
  assert.deepStrictEqual(r, { packs: [], errors: [], offline: false });
});

pending.push(async () => console.log('\nIndex tool'));
t('the index lists good files, ignores "_" folders and index.json, and reports mistakes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-'));
  const put = (f, obj) => {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), typeof obj === 'string' ? obj : JSON.stringify(obj));
  };
  put('index.json', { items: [] });
  put('german/tiere.json', topic({ id: 'de-tiere' }));
  put('english/animals.json', topic({ id: 'en-animals', name: 'Animals', language: 'English', lang: 'en' }));
  put('_examples/x.json', { nonsense: true });
  put('english/bad.json', '{ not json');
  put('english/dup.json', topic({ id: 'en-animals' }));
  const r = build(dir);
  assert.deepStrictEqual(r.index.items.map((i) => i.file), ['english/animals.json', 'german/tiere.json']);
  assert.strictEqual(r.index.items[0].words, 1);
  assert.strictEqual(r.problems.length, 2);
  assert.ok(r.problems.some((p) => /bad\.json/.test(p)) && r.problems.some((p) => /dup\.json.*already used/.test(p)));
  fs.rmSync(dir, { recursive: true, force: true });
});
t('the real library folder passes its own check', () => {
  const r = build(path.join(__dirname, '..', 'library'));
  assert.deepStrictEqual(r.problems, []);
  const onDisk = read('index.json');
  assert.deepStrictEqual(onDisk, r.index, 'library/index.json is out of date: run  npm run library');
});

(async () => {
  for (const f of pending) await f();
  console.log(`\n${passed} library tests passed` + (process.exitCode ? ' - some tests failed' : ''));
})();
