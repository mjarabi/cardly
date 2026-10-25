/* Reading an Anki collection (the SQLite file) and turning it into Cardly cards, progress and history.
 *
 * Works for the two layouts Anki has used:
 *   - older: the note types and decks are JSON inside the "col" table
 *   - newer (Anki 2.1.50+ / 23.x): note types, fields, templates and decks are separate tables with protobuf blobs
 *
 * This file has no Electron and no SQLite code of its own. It gets a function  query(sql) -> rows (arrays)
 * so it can run with sql.js in the app and with node:sqlite in the tests. */
const SM2 = require('./sm2');
const { htmlToText } = require('./html');

// ---------------------------------------------------------------- bytes

/** Anki's newer files declare a text collation "unicase" that plain SQLite does not know, so queries fail.
 *  The word only appears in the table definitions ("collate unicase"); we change it to "nocase " (same length). */
function patchCollation(bytes) {
  const buf = Buffer.from(bytes);
  let i = 0;
  while ((i = buf.indexOf('nicase', i, 'latin1')) !== -1) {
    const start = i - 1; // the "u"
    if (start >= 8 && (buf[start] === 0x75 || buf[start] === 0x55) && buf.toString('latin1', start - 8, start).toLowerCase() === 'collate ') {
      buf.write('nocase ', start, 'latin1');
    }
    i += 6;
  }
  return buf;
}

/** A database copied while Anki is open may say "write-ahead log mode", which an in-memory copy cannot use. */
function rollbackMode(buf) {
  if (buf.length > 20 && buf.toString('latin1', 0, 15) === 'SQLite format 3') {
    buf[18] = 1;
    buf[19] = 1;
  }
  return buf;
}

// ---------------------------------------------------------------- protobuf (just enough to read Anki's blobs)

function pbParse(input) {
  const buf = Buffer.from(input || []);
  const out = new Map();
  let p = 0;
  const varint = () => {
    let r = 0;
    let mul = 1;
    for (let n = 0; n < 10 && p < buf.length; n++) {
      const b = buf[p++];
      r += (b & 0x7f) * mul;
      mul *= 128;
      if (!(b & 0x80)) break;
    }
    return r;
  };
  const push = (k, v) => {
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(v);
  };
  while (p < buf.length) {
    const key = varint();
    const field = Math.floor(key / 8);
    const wire = key % 8;
    if (wire === 0) push(field, varint());
    else if (wire === 2) {
      const len = varint();
      push(field, buf.subarray(p, p + len));
      p += len;
    } else if (wire === 1) {
      push(field, buf.subarray(p, p + 8));
      p += 8;
    } else if (wire === 5) {
      push(field, buf.subarray(p, p + 4));
      p += 4;
    } else break; // groups are not used
  }
  return out;
}
const pbStr = (m, f) => (m.has(f) ? Buffer.from(m.get(f)[0]).toString('utf8') : '');
const pbNum = (m, f) => (m.has(f) && typeof m.get(f)[0] === 'number' ? m.get(f)[0] : 0);

// ---------------------------------------------------------------- reading the collection

const asText = (v) => (v == null ? '' : typeof v === 'string' ? v : Buffer.from(v).toString('utf8'));
const asJson = (v, fallback) => {
  const t = asText(v).trim();
  if (!t) return fallback;
  try {
    return JSON.parse(t);
  } catch (e) {
    return fallback;
  }
};

function readCollection(query) {
  const colRows = query('SELECT crt, ver, conf, models, decks FROM col');
  if (!colRows.length) throw userError('Collection info was not found in the Anki file.');
  const [crt, ver, confRaw, modelsRaw, decksRaw] = colRows[0];
  const conf = asJson(confRaw, {});
  const tables = new Set(query("SELECT name FROM sqlite_master WHERE type='table'").map((r) => r[0]));

  const models = {};
  const decks = {};
  let rollover = typeof conf.rollover === 'number' ? conf.rollover : 4;

  const legacyModels = asJson(modelsRaw, null);
  const legacyDecks = asJson(decksRaw, null);
  if (legacyModels && Object.keys(legacyModels).length) {
    for (const [mid, m] of Object.entries(legacyModels)) {
      models[mid] = {
        id: String(mid),
        name: m.name || '',
        cloze: m.type === 1,
        fields: (m.flds || []).slice().sort((a, b) => a.ord - b.ord).map((f) => f.name),
        tmpls: (m.tmpls || []).slice().sort((a, b) => a.ord - b.ord).map((t) => ({ name: t.name, qfmt: t.qfmt || '', afmt: t.afmt || '' }))
      };
    }
  } else if (tables.has('notetypes')) {
    for (const [id, name, cfg] of query('SELECT id, name, config FROM notetypes')) {
      const c = pbParse(cfg);
      models[String(id)] = { id: String(id), name: asText(name), cloze: pbNum(c, 1) === 1, fields: [], tmpls: [] };
    }
    for (const [ntid, , name] of query('SELECT ntid, ord, name FROM fields ORDER BY ntid, ord')) {
      const m = models[String(ntid)];
      if (m) m.fields.push(asText(name));
    }
    for (const [ntid, , name, cfg] of query('SELECT ntid, ord, name, config FROM templates ORDER BY ntid, ord')) {
      const m = models[String(ntid)];
      if (!m) continue;
      const c = pbParse(cfg);
      m.tmpls.push({ name: asText(name), qfmt: pbStr(c, 1), afmt: pbStr(c, 2) });
    }
  }

  if (legacyDecks && Object.keys(legacyDecks).length) {
    for (const [did, d] of Object.entries(legacyDecks)) decks[String(did)] = { id: String(did), name: d.name || 'Default', filtered: !!d.dyn };
  } else if (tables.has('decks')) {
    for (const [id, name, kind] of query('SELECT id, name, kind FROM decks')) {
      const k = pbParse(kind);
      decks[String(id)] = { id: String(id), name: asText(name).split('\x1f').join('::'), filtered: k.has(2) };
    }
  }

  if (tables.has('config')) {
    for (const [key, val] of query("SELECT KEY, val FROM config WHERE KEY = 'rollover'")) {
      if (asText(key) === 'rollover') {
        const n = Number(asJson(val, 4));
        if (isFinite(n)) rollover = n;
      }
    }
  }

  const notes = new Map();
  for (const [id, mid, flds, tags] of query('SELECT id, mid, flds, tags FROM notes')) {
    notes.set(Number(id), { id: Number(id), mid: String(mid), fields: asText(flds).split('\x1f'), tags: asText(tags).split(/\s+/).filter(Boolean) });
  }
  const cards = query('SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses, left, odue, odid FROM cards ORDER BY id').map((r) => ({
    id: Number(r[0]), nid: Number(r[1]), did: String(r[2]), ord: Number(r[3]), type: Number(r[4]), queue: Number(r[5]), due: Number(r[6]),
    ivl: Number(r[7]), factor: Number(r[8]), reps: Number(r[9]), lapses: Number(r[10]), left: Number(r[11]), odue: Number(r[12]), odid: String(r[13] || 0)
  }));
  let revlog = [];
  if (tables.has('revlog')) {
    revlog = query('SELECT id, cid, ease, ivl, type FROM revlog ORDER BY id').map((r) => ({ id: Number(r[0]), cid: Number(r[1]), ease: Number(r[2]), ivl: Number(r[3]), type: Number(r[4]) }));
  }
  return { crt: Number(crt) || 0, ver: Number(ver) || 0, rollover, models, decks, notes, cards, revlog };
}

function userError(msg) {
  const e = new Error(msg);
  e.userMessage = msg;
  return e;
}

// ---------------------------------------------------------------- card templates (what Anki shows on each side)

const stripTags = (s) => String(s || '').replace(/<[^>]*>/g, '');
const isEmptyField = (s) => stripTags(s).replace(/&nbsp;/gi, ' ').trim() === '';

function parseTemplate(src) {
  const re = /\{\{([^{}]*?)\}\}/g;
  const root = { kids: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) top().kids.push(src.slice(last, m.index));
    const t = m[1].trim();
    if (t[0] === '#' || t[0] === '^') {
      const node = { type: t[0], name: t.slice(1).trim(), kids: [] };
      top().kids.push(node);
      stack.push(node);
    } else if (t[0] === '/') {
      if (stack.length > 1) stack.pop();
    } else if (t[0] !== '!') {
      top().kids.push({ type: 'f', tag: t });
    }
    last = re.lastIndex;
  }
  if (last < src.length) top().kids.push(src.slice(last));
  return root;
}

/** cloze: the card for number `n` hides that deletion (front) or shows it in bold (back); the others show their text */
function clozeFilter(text, n, side) {
  return String(text).replace(/\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g, (m, num, answer, hint) => {
    if (Number(num) !== n) return answer;
    return side === 'front' ? '[' + (hint ? hint : '...') + ']' : '<b>' + answer + '</b>';
  });
}

function renderTemplate(src, fields, ctx) {
  const tree = parseTemplate(String(src || ''));
  const get = (name) => (Object.prototype.hasOwnProperty.call(fields, name) ? fields[name] : '');
  const special = (name) => {
    switch (name) {
      case 'FrontSide': return ctx.front || '';
      case 'Tags': return ctx.tags || '';
      case 'Deck': return ctx.deck || '';
      case 'Subdeck': return ctx.subdeck || '';
      case 'Card': return ctx.card || '';
      case 'Type': return ctx.type || '';
      default: return null;
    }
  };
  const field = (tag) => {
    const parts = tag.split(':').map((p) => p.trim());
    const name = parts[parts.length - 1];
    const filters = parts.slice(0, -1);
    let v = special(name);
    if (v === null) v = get(name);
    for (let i = filters.length - 1; i >= 0; i--) {
      const f = filters[i].toLowerCase();
      if (f === 'cloze' || f === 'cloze-only') v = clozeFilter(v, ctx.cloze || 1, ctx.side);
      else if (f === 'text') v = stripTags(v);
      else if (f === 'type') v = ctx.side === 'back' ? v : '';
      else if (f === 'hint') v = ctx.side === 'back' ? v : '';
      else if (f === 'furigana' || f === 'kanji') v = String(v).replace(/ ?([^ >\]]+?)\[(.+?)\]/g, '$1');
      else if (f === 'kana') v = String(v).replace(/ ?([^ >\]]+?)\[(.+?)\]/g, '$2');
      else if (f.startsWith('tts')) v = '';
    }
    return v;
  };
  const run = (node) => {
    let out = '';
    for (const k of node.kids) {
      if (typeof k === 'string') out += k;
      else if (k.type === 'f') out += field(k.tag);
      else {
        const has = !isEmptyField(special(k.name) !== null ? special(k.name) : get(k.name));
        if ((k.type === '#' && has) || (k.type === '^' && !has)) out += run(k);
      }
    }
    return out;
  };
  return run(tree);
}

// ---------------------------------------------------------------- media names

function shortHash(s) {
  let h = 2166136261;
  for (const ch of String(s)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
/** a file name that is safe on disk and in card text; names with Persian or other letters get a short code so they never collide */
function safeMediaName(orig) {
  const base = String(orig).split(/[\\/]/).pop();
  const clean = base.replace(/[^\w.\-]+/g, '_');
  if (clean === base) return clean;
  const dot = clean.lastIndexOf('.');
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : '';
  return stem.replace(/_+/g, '_').replace(/^_|_$/g, '') + '-' + shortHash(base) + ext;
}

// ---------------------------------------------------------------- progress

/** Anki card scheduling -> Cardly scheduling fields. */
function mapSchedule(card, opts, lastReviewMs) {
  const o = opts || {};
  const now = o.now || Date.now();
  const rollover = o.rolloverHour == null ? 4 : o.rolloverHour;
  const stepCount = Math.max(1, o.learningSteps || 2);
  const todayDay = Math.floor((now / 1000 - o.crt) / 86400);
  const dayStart = SM2.studyDayStart(now, rollover);
  const inFilter = card.odid && card.odid !== '0';
  const due = inFilter && card.odue ? card.odue : card.due;
  const ease = card.factor >= 1300 ? Math.round(card.factor) / 1000 : 2.5;

  const base = { reps: card.reps || 0, lapses: card.lapses || 0, ease, last: lastReviewMs || 0 };
  if (card.type === 0) return { state: 'new', step: 0, due: 0, interval: 0, ...base, ease: 2.5 };

  const dayDue = (d) => SM2.addDays(dayStart, d - todayDay);
  const secDue = (s) => s * 1000;
  // learning cards keep a time in seconds; "interday" ones and review cards keep a day number
  const asTime = (d, queue) => (queue === 1 || (queue !== 3 && d > 1e9) ? secDue(d) : dayDue(d));

  if (card.type === 2) return { state: 'review', step: 0, due: dayDue(due), interval: Math.max(1, card.ivl > 0 ? card.ivl : 1), ...base };

  const left = (card.left || 0) % 1000;
  const step = Math.max(0, Math.min(stepCount - 1, stepCount - left));
  if (card.type === 3) return { state: 'relearn', step: Math.min(step, 0), due: asTime(due, card.queue), interval: Math.max(1, card.ivl > 0 ? card.ivl : 1), ...base };
  return { state: 'learn', step, due: asTime(due, card.queue), interval: 0, ...base };
}

// ---------------------------------------------------------------- whole conversion

/** deck name as Anki keeps it ("English::Verbs") -> path parts */
const splitDeck = (name) => String(name || 'Default').split('::').map((s) => s.trim()).filter(Boolean);
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba)$/i;

/**
 * Turns a read collection into Cardly data.
 * opts: {
 *   now, rolloverHour (Cardly's, used for the day of each review), learningSteps,
 *   hasMedia(name) -> bool   (is this file in the Anki media folder / package?)
 * }
 * returns { decks: [{ path, name, cards }], history: { days, recent }, media: [{orig, saved, kind}], summary, stats }
 *  - card:    { front, back, tags, ak, created, sched, suspended }
 *  - days:    { 'YYYY-MM-DD': { deckIndex: [total, newSeen, rev, correct] } }   (deckIndex -1 = a deleted card)
 *  - recent:  [[ts, ankiCardId, rating, stateCode, interval, deckIndex]]  (the last 45 days, one by one)
 */
function buildImport(norm, opts) {
  const o = opts || {};
  const now = o.now || Date.now();
  const rollover = o.rolloverHour == null ? 4 : o.rolloverHour;
  const stats = {};
  const media = new Map(); // original name -> { saved, kind }
  const mapper = (re, kind) => (raw) => {
    let name = String(raw).split('?')[0].split('#')[0];
    try {
      name = decodeURIComponent(name);
    } catch (e) {
      /* keep the name as it is */
    }
    if (!re.test(name)) return null;
    if (media.has(name)) return media.get(name).saved;
    if (o.hasMedia && !o.hasMedia(name)) return null;
    const saved = safeMediaName(name);
    media.set(name, { saved, kind });
    return saved;
  };
  const imgMap = mapper(IMG_EXT, 'image');
  const soundMap = mapper(AUDIO_EXT, 'audio');

  const lastReview = new Map();
  for (const r of norm.revlog) if (r.ease > 0) lastReview.set(r.cid, r.id);

  const deckIndex = new Map(); // path key -> index
  const decks = [];
  const cardDeck = new Map(); // anki card id -> deck index
  let suspended = 0;
  let withProgress = 0;
  // new cards keep Anki's own order
  const sorted = norm.cards.slice().sort((a, b) => (a.type === 0 && b.type === 0 ? a.due - b.due || a.id - b.id : a.id - b.id));

  for (const c of sorted) {
    const note = norm.notes.get(c.nid);
    if (!note) continue;
    const model = norm.models[note.mid];
    const filtered = c.odid && c.odid !== '0';
    const deck = norm.decks[filtered ? c.odid : c.did];
    const parts = splitDeck(deck ? deck.name : 'Default');

    let frontHtml = '';
    let backHtml = '';
    let usable = false;
    if (model && model.tmpls.length) {
      const tmpl = model.cloze ? model.tmpls[0] : model.tmpls[c.ord] || model.tmpls[0];
      const fields = {};
      model.fields.forEach((n, i) => (fields[n] = note.fields[i] == null ? '' : note.fields[i]));
      const ctx = { tags: note.tags.join(' '), deck: parts.join('::'), subdeck: parts[parts.length - 1], card: tmpl.name, type: model.name, cloze: c.ord + 1 };
      frontHtml = renderTemplate(tmpl.qfmt, fields, Object.assign({ side: 'front', front: '' }, ctx));
      // the answer side repeats the question through {{FrontSide}}; Cardly already shows the front, so it is left out
      backHtml = renderTemplate(tmpl.afmt, fields, Object.assign({ side: 'back', front: '' }, ctx)).replace(/<hr[^>]*id=["']?answer["']?[^>]*>/gi, '');
      usable = !isEmptyField(frontHtml) && !isEmptyField(backHtml);
    }
    if (!usable) {
      // no usable template: first field on the front, the others on the back
      const f = note.fields.slice();
      if (model && !model.cloze && model.tmpls.length === 2 && c.ord === 1 && f.length >= 2) [f[0], f[1]] = [f[1], f[0]];
      frontHtml = f[0] || '';
      backHtml = f.slice(1).filter((x) => x && x.trim()).join('<br><br>');
    }
    const front = htmlToText(frontHtml, imgMap, stats, soundMap);
    const back = htmlToText(backHtml, imgMap, stats, soundMap);
    if (!front && !back) continue;

    const key = parts.join('\u0001');
    if (!deckIndex.has(key)) {
      deckIndex.set(key, decks.length);
      decks.push({ path: parts, name: parts.join(' › '), cards: [] });
    }
    const di = deckIndex.get(key);
    const card = {
      front,
      back,
      tags: note.tags,
      ak: String(c.id),
      created: note.id > 1e11 ? note.id + c.ord : now,
      sched: mapSchedule(c, { now, rolloverHour: rollover, learningSteps: o.learningSteps, crt: norm.crt }, lastReview.get(c.id))
    };
    if (card.sched.state !== 'new' || card.sched.reps) withProgress++;
    if (c.queue === -1) {
      card.suspended = true;
      suspended++;
    }
    decks[di].cards.push(card);
    cardDeck.set(c.id, di);
  }

  // ----- history
  const days = {};
  const recent = [];
  const seen = new Set();
  const recentFrom = now - 45 * 86400000; // the 30-day retention number is the only thing that reads these one by one
  let total = 0;
  let firstTs = 0;
  let lastTs = 0;
  for (const r of norm.revlog) {
    if (r.ease <= 0) continue; // manual rescheduling is not a review
    const isFirst = !seen.has(r.cid);
    seen.add(r.cid);
    // same codes Cardly uses: 0 new, 1 learning, 2 review, 3 relearning
    const stateCode = r.type === 1 || r.type === 3 ? 2 : r.type === 2 ? 3 : isFirst ? 0 : 1;
    const di = cardDeck.has(r.cid) ? cardDeck.get(r.cid) : -1;
    const dkey = SM2.dayKey(r.id, rollover);
    const day = (days[dkey] = days[dkey] || {});
    const d = (day[di] = day[di] || [0, 0, 0, 0]); // total, newSeen, rev, correct
    d[0]++;
    if (stateCode === 0) d[1]++;
    if (stateCode === 2) d[2]++;
    if (r.ease > 1) d[3]++;
    total++;
    if (!firstTs) firstTs = r.id;
    lastTs = r.id;
    if (r.id >= recentFrom) recent.push([r.id, String(r.cid), r.ease, stateCode, r.ivl > 0 ? r.ivl : 0, di]);
  }

  // decks sorted by name, so the parents come before their children; the history gets the new numbers
  const sortedDecks = decks.slice().sort((a, b) => a.name.localeCompare(b.name));
  const newIndex = new Map(sortedDecks.map((d, i) => [d, i]));
  const remap = new Map([[-1, -1]]);
  decks.forEach((d, i) => remap.set(i, newIndex.get(d)));
  for (const dk of Object.keys(days)) {
    const next = {};
    for (const [k, v] of Object.entries(days[dk])) next[remap.get(Number(k))] = v;
    days[dk] = next;
  }
  for (const r of recent) r[5] = remap.get(r[5]);

  return {
    decks: sortedDecks,
    history: { days, recent },
    media: [...media].map(([orig, m]) => ({ orig, saved: m.saved, kind: m.kind })),
    summary: {
      decks: sortedDecks.length,
      cards: sortedDecks.reduce((n, d) => n + d.cards.length, 0),
      notes: norm.notes.size,
      suspended,
      withProgress,
      reviews: total,
      firstReview: firstTs,
      lastReview: lastTs
    },
    stats
  };
}

module.exports = { patchCollation, rollbackMode, pbParse, readCollection, renderTemplate, clozeFilter, safeMediaName, mapSchedule, buildImport, splitDeck, userError };
