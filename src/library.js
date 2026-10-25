/* The online library: ready-made decks that live in the "library" folder of the project's
 * GitHub repository and are downloaded by the app when the user opens the Online Library page.
 *
 * This file only holds the logic (address building, checking downloaded files, turning them into packs).
 * Downloading itself is done by main.js and is passed in, so everything here can be tested without a network.
 *
 * Files in the repository:
 *   library/index.json                  list of all content files (built by tools/build-library-index.js)
 *   library/<language>/<name>.json      one topic or pack per file (see library/README.md)
 */
const { toCard } = require('./topicpack');

const LIMITS = { items: 300, sections: 80, cardsPerSection: 600, totalCards: 6000, name: 80, text: 2000, description: 400 };
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9_\-./]{0,118}\.json$/;

/** "github:owner/repo", "owner/repo" or a GitHub URL (string or { url }) -> { owner, repo } or null */
function repoFromPackage(pkg) {
  let r = pkg && pkg.repository;
  if (r && typeof r === 'object') r = r.url;
  if (typeof r !== 'string') return null;
  const m = r.trim().match(/^(?:github:|git\+)?(?:https?:\/\/github\.com\/|git@github\.com:)?([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

/** where the library folder lives on the web (no trailing slash) */
function baseUrl(repo, branch) {
  return `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${branch || 'main'}/library`;
}

const safeFile = (f) => typeof f === 'string' && SAFE_FILE.test(f) && !f.includes('..') && !f.includes('//');

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/** index.json -> list of { file, id, name, language }; entries with an unsafe file name are dropped */
function parseIndex(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.items)) throw new Error('The library index has the wrong shape.');
  const out = [];
  const seen = new Set();
  for (const it of obj.items) {
    if (!it || !safeFile(it.file) || seen.has(it.file)) continue;
    seen.add(it.file);
    out.push({ file: it.file, id: str(it.id, 60), name: str(it.name, LIMITS.name), language: str(it.language, 30) });
    if (out.length >= LIMITS.items) break;
  }
  return out;
}

/**
 * One content file -> a pack the app can add.
 * Two shapes are accepted for a section:
 *   { name, words: [[word, pos, meaning, definition, example1, example2, example3], ...] }   (topics)
 *   { name, cards: [{ front, back, tags?, sf?, sb? }, ...] }                                  (free cards)
 * Throws an Error with a readable message when something is wrong.
 */
function parseItem(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('not a JSON object');
  const id = slug(obj.id);
  if (!id) throw new Error('"id" is missing (use letters, numbers and dashes)');
  const name = str(obj.name, LIMITS.name);
  if (!name) throw new Error('"name" is missing');
  const language = str(obj.language, 30) || 'English';
  const lang = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(obj.lang || '') ? obj.lang : 'en';
  const langTag = slug(language) || 'english';
  if (!Array.isArray(obj.sections) || !obj.sections.length) throw new Error('"sections" must be a list with at least one section');
  if (obj.sections.length > LIMITS.sections) throw new Error('too many sections');

  let total = 0;
  const decks = [];
  const names = new Set();
  for (const sec of obj.sections) {
    const sname = str(sec && sec.name, LIMITS.name);
    if (!sname) throw new Error('a section has no "name"');
    if (names.has(sname)) throw new Error(`the section name "${sname}" is used twice`);
    names.add(sname);
    const cards = [];
    const fronts = new Set();
    const add = (c, where) => {
      if (fronts.has(c.front)) throw new Error(`${where}: "${c.front.split('\n')[0]}" appears twice in the section "${sname}"`);
      fronts.add(c.front);
      cards.push(c);
    };
    if (Array.isArray(sec.words)) {
      sec.words.forEach((row, i) => {
        const where = `${sname}, word ${i + 1}`;
        if (!Array.isArray(row) || row.length < 5 || row.length > 9) throw new Error(`${where}: a word needs [word, type, meaning, definition, example, ...]`);
        const [word, pos, fa, def] = row;
        const defs = Array.isArray(def) ? def : [def];
        const textOk = (v) => typeof v === 'string' && v.trim() && v.length <= LIMITS.text;
        if (![word, pos, fa, ...defs, ...row.slice(4)].every(textOk) || defs.length > 3) throw new Error(`${where}: every part must be a short text`);
        const card = toCard(id, sname, row.map((v) => (Array.isArray(v) ? v.map((x) => x.trim()) : v.trim())), langTag);
        card.lang = lang;
        add(card, where);
      });
    }
    if (Array.isArray(sec.cards)) {
      sec.cards.forEach((c, i) => {
        const where = `${sname}, card ${i + 1}`;
        const front = str(c && c.front, LIMITS.text);
        const back = str(c && c.back, LIMITS.text);
        if (!front || !back) throw new Error(`${where}: "front" and "back" are needed`);
        const card = { front, back, lang, tags: (Array.isArray(c.tags) ? c.tags : []).map((t) => slug(t)).filter(Boolean).slice(0, 8) };
        if (typeof c.sf === 'string') card.sf = c.sf.slice(0, LIMITS.text);
        if (typeof c.sb === 'string') card.sb = c.sb.slice(0, LIMITS.text);
        add(card, where);
      });
    }
    if (!cards.length) throw new Error(`the section "${sname}" has no words or cards`);
    if (cards.length > LIMITS.cardsPerSection) throw new Error(`the section "${sname}" has too many cards`);
    total += cards.length;
    decks.push({ name: sname, cards });
  }
  if (total > LIMITS.totalCards) throw new Error('too many cards in one file');
  return {
    id: 'lib-' + id,
    kind: 'topic',
    online: true,
    name,
    description: str(obj.description, LIMITS.description),
    language,
    lang,
    decks
  };
}

/**
 * Downloads the index and every file in it.
 *   io.fetchText(url)            -> Promise<string>   (throws when the network fails)
 *   io.readCache(key)            -> string | null
 *   io.writeCache(key, text)     -> void
 * Result: { packs, errors: [text], offline }
 * When the index cannot be downloaded, the last saved copy is used (offline = true).
 */
async function loadLibrary(base, io) {
  const errors = [];
  let offline = false;
  let indexText;
  try {
    indexText = await io.fetchText(base + '/index.json');
    JSON.parse(indexText);
    io.writeCache('index.json', indexText);
  } catch (e) {
    indexText = io.readCache('index.json');
    if (!indexText) throw new Error('The library could not be reached. Check your internet connection. (' + ((e && e.message) || e) + ')');
    offline = true;
  }
  const items = parseIndex(JSON.parse(indexText));

  const packs = [];
  const queue = items.slice();
  const worker = async () => {
    while (queue.length) {
      const it = queue.shift();
      const key = 'item-' + it.file.replace(/[^A-Za-z0-9]+/g, '_');
      let text = null;
      try {
        text = await io.fetchText(base + '/' + it.file);
        JSON.parse(text);
        io.writeCache(key, text);
      } catch (e) {
        text = io.readCache(key);
        if (!text) {
          errors.push(`${it.file}: could not be downloaded`);
          continue;
        }
        offline = true;
      }
      try {
        packs.push(parseItem(JSON.parse(text)));
      } catch (e) {
        errors.push(`${it.file}: ${(e && e.message) || e}`);
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  // two files must not share a pack id
  const seen = new Set();
  const unique = [];
  for (const p of packs) {
    if (seen.has(p.id)) {
      errors.push(`"${p.name}": its id is already used by another file`);
      continue;
    }
    seen.add(p.id);
    unique.push(p);
  }
  unique.sort((a, b) => a.language.localeCompare(b.language) || a.name.localeCompare(b.name));
  return { packs: unique, errors, offline };
}

module.exports = { repoFromPackage, baseUrl, safeFile, parseIndex, parseItem, loadLibrary, LIMITS };
