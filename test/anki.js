/* Tests for reading an Anki collection directly. Fixtures are real SQLite files made with node:sqlite
 * (the app itself uses sql.js; both read the same file format). */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { DatabaseSync } = require('node:sqlite');
const SM2 = require('../src/sm2');
const A = require('../src/anki');

let passed = 0;
function t(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    console.error('FAIL  ' + name + '\n      ' + (e.stack || e.message));
    process.exitCode = 1;
  }
}

const NOW = new Date(2026, 9, 22, 12, 0, 0).getTime();
const DAYMS = 86400000;
// the collection was created 100 study days ago, at 04:00
const CRT = Math.round(SM2.addDays(SM2.studyDayStart(NOW, 4), -100) / 1000);
const TODAY = 100;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cardly-anki-'));

// ---- tiny protobuf writer for the new layout
const varint = (n) => {
  const out = [];
  while (n > 127) {
    out.push((n % 128) | 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return Buffer.from(out);
};
const pbNum = (f, n) => Buffer.concat([varint(f * 8), varint(n)]);
const pbBytes = (f, b) => {
  const buf = Buffer.isBuffer(b) ? b : Buffer.from(String(b), 'utf8');
  return Buffer.concat([varint(f * 8 + 2), varint(buf.length), buf]);
};

const MODELS = {
  basic: { name: 'Basic', cloze: false, flds: ['Front', 'Back'], tm: [['Card 1', '{{Front}}', '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}']] },
  rev: {
    name: 'Basic (and reversed card)', cloze: false, flds: ['Front', 'Back'],
    tm: [['Card 1', '{{Front}}', '{{FrontSide}}<hr id=answer>{{Back}}'], ['Card 2', '{{Back}}', '{{FrontSide}}<hr id=answer>{{Front}}']]
  },
  cloze: { name: 'Cloze', cloze: true, flds: ['Text', 'Extra'], tm: [['Cloze', '{{cloze:Text}}', '{{cloze:Text}}<br>{{Extra}}']] },
  hint: {
    name: 'With hint', cloze: false, flds: ['Word', 'Hint', 'Meaning'],
    tm: [['Card 1', '{{Word}}{{#Hint}}<div>(hint)</div>{{/Hint}}{{^Hint}}<i>no hint</i>{{/Hint}}', '{{FrontSide}}<hr id=answer>{{Meaning}} [{{Tags}}] {{Deck}}']]
  }
};
const MIDS = { basic: 1001, rev: 1002, cloze: 1003, hint: 1004 };
const DECKS = { 1: 'Default', 2: 'Lang::Verbs', 3: 'Lang', 4: 'Cram' };

// notes: [id, model, fields, tags]
const NOTES = [
  [1700000000001, 'basic', ['hello', 'سلام <img src="hi.png"> [sound:hi.mp3]'], ' greeting easy '],
  [1700000000002, 'rev', ['run', 'دویدن'], ''],
  [1700000000003, 'cloze', ['Paris is the capital of {{c1::France}} and {{c2::Europe::where}}', 'extra'], ' geo '],
  [1700000000004, 'hint', ['table', 'furniture', 'میز'], ' home '],
  [1700000000005, 'basic', ['review me', 'yes'], ''],
  [1700000000006, 'basic', ['learning', 'now'], ''],
  [1700000000007, 'basic', ['relearning', 'lapsed'], ''],
  [1700000000008, 'basic', ['suspended one', 'zzz'], ''],
  [1700000000009, 'basic', ['in cram', 'filtered'], ''],
  [1700000000010, 'basic', ['interday', 'learning'], '']
];
// cards: [id, noteIndex, did, ord, type, queue, due, ivl, factor, reps, lapses, left, odue, odid]
const CARDS = [
  [2001, 0, 1, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0],
  [2002, 1, 2, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0],
  [2003, 1, 2, 1, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0],
  [2004, 2, 3, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0],
  [2005, 2, 3, 1, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0],
  [2006, 3, 1, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0],
  [2007, 4, 2, 0, 2, 2, TODAY + 3, 10, 2300, 6, 1, 0, 0, 0],
  [2008, 5, 2, 0, 1, 1, Math.floor(NOW / 1000) + 600, 0, 2500, 1, 0, 1001, 0, 0],
  [2009, 6, 2, 0, 3, 1, Math.floor(NOW / 1000) + 300, 4, 2100, 9, 2, 1001, 0, 0],
  [2010, 7, 2, 0, 2, -1, TODAY + 9, 30, 2500, 8, 0, 0, 0, 0],
  [2011, 8, 4, 0, 2, 2, TODAY + 40, 20, 2500, 5, 0, 0, TODAY - 2, 2],
  [2012, 9, 2, 0, 1, 3, TODAY + 1, 1, 2500, 2, 0, 1001, 0, 0]
];
const at = (daysAgo, hour) => SM2.addDays(SM2.studyDayStart(NOW, 4), -daysAgo) + (hour - 4) * 3600000; // hour of that study day
// revlog: [id, cid, ease, ivl, type]
const REVLOG = [
  [at(5, 9), 2007, 3, -600, 0], // learned: first time
  [at(5, 9) + 600000, 2007, 3, 1, 0],
  [at(4, 10), 2007, 3, 4, 1],
  [at(1, 10), 2007, 4, 10, 1],
  [at(1, 11), 2008, 1, -60, 0],
  [at(1, 12), 2009, 1, -600, 2],
  [at(0, 9), 2009, 3, 4, 2],
  [at(0, 10), 2007, 0, 0, 4], // manual: ignored
  [at(60, 9), 2010, 3, 5, 1],
  [at(200, 9), 2011, 2, 3, 1],
  [at(0, 11), 99999, 3, 1, 1] // a card that was deleted
];

function insertCommon(db) {
  db.exec(`CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld integer, csum integer, flags integer, data text);
    CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text);
    CREATE TABLE revlog (id integer primary key, cid integer, usn integer, ease integer, ivl integer, lastIvl integer, factor integer, time integer, type integer);`);
  const nIns = db.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const noteIds = [];
  NOTES.forEach(([id, m, fields, tags], i) => {
    nIns.run(id, 'g' + i, MIDS[m], 0, 0, tags, fields.join('\x1f'), 0, 0, 0, '');
    noteIds.push(id);
  });
  const cIns = db.prepare('INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for (const c of CARDS) cIns.run(c[0], noteIds[c[1]], c[2], c[3], 0, 0, c[4], c[5], c[6], c[7], c[8], c[9], c[10], c[11], c[12], c[13], 0, '');
  const rIns = db.prepare('INSERT INTO revlog VALUES (?,?,?,?,?,?,?,?,?)');
  for (const r of REVLOG) rIns.run(r[0], r[1], 0, r[2], r[3], 0, 2500, 3000, r[4]);
}

function makeLegacy(file) {
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text)');
  const models = {};
  for (const [k, m] of Object.entries(MODELS)) {
    models[MIDS[k]] = {
      id: MIDS[k], name: m.name, type: m.cloze ? 1 : 0,
      flds: m.flds.map((n, i) => ({ name: n, ord: i })),
      tmpls: m.tm.map((x, i) => ({ name: x[0], ord: i, qfmt: x[1], afmt: x[2] }))
    };
  }
  const decks = {};
  for (const [id, name] of Object.entries(DECKS)) decks[id] = { id: Number(id), name, dyn: id === '4' ? 1 : 0 };
  db.prepare('INSERT INTO col VALUES (1,?,0,0,11,0,0,0,?,?,?,?,?)').run(CRT, JSON.stringify({ rollover: 4 }), JSON.stringify(models), JSON.stringify(decks), '{}', '{}');
  insertCommon(db);
  db.close();
}

function makeNew(file, unicase) {
  const db = new DatabaseSync(file);
  const coll = unicase ? 'collate nocase ' : ''; // "unicase" has the same length as "nocase " (we swap it afterwards)
  db.exec(`CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);
    CREATE TABLE notetypes (id integer primary key, name text not null ${coll}, mtime_secs integer, usn integer, config blob);
    CREATE UNIQUE INDEX idx_notetypes_name ON notetypes (name ${coll});
    CREATE TABLE fields (ntid integer, ord integer, name text not null ${coll}, config blob, primary key (ntid, ord));
    CREATE TABLE templates (ntid integer, ord integer, name text not null ${coll}, mtime_secs integer, usn integer, config blob, primary key (ntid, ord));
    CREATE TABLE decks (id integer primary key, name text not null ${coll}, mtime_secs integer, usn integer, common blob, kind blob);
    CREATE UNIQUE INDEX idx_decks_name ON decks (name ${coll});
    CREATE TABLE config (KEY text not null primary key, usn integer, mtime_secs integer, val blob);`);
  const nt = db.prepare('INSERT INTO notetypes VALUES (?,?,?,?,?)');
  const fl = db.prepare('INSERT INTO fields VALUES (?,?,?,?)');
  const tp = db.prepare('INSERT INTO templates VALUES (?,?,?,?,?,?)');
  for (const [k, m] of Object.entries(MODELS)) {
    nt.run(MIDS[k], m.name, 0, 0, pbNum(1, m.cloze ? 1 : 0));
    m.flds.forEach((n, i) => fl.run(MIDS[k], i, n, Buffer.alloc(0)));
    m.tm.forEach((x, i) => tp.run(MIDS[k], i, x[0], 0, 0, Buffer.concat([pbBytes(1, x[1]), pbBytes(2, x[2])])));
  }
  const dk = db.prepare('INSERT INTO decks VALUES (?,?,?,?,?,?)');
  for (const [id, name] of Object.entries(DECKS)) {
    // filtered decks have field 2 (a "filtered" message) in kind; normal ones have field 1
    dk.run(Number(id), name.split('::').join('\x1f'), 0, 0, Buffer.alloc(0), id === '4' ? pbBytes(2, Buffer.alloc(0)) : pbBytes(1, Buffer.alloc(0)));
  }
  db.prepare('INSERT INTO config VALUES (?,?,?,?)').run('rollover', 0, 0, Buffer.from('4'));
  db.prepare("INSERT INTO col VALUES (1,?,0,0,18,0,0,0,'','','','','')").run(CRT);
  insertCommon(db);
  db.close();
  if (unicase) {
    const buf = fs.readFileSync(file);
    let i = -1;
    let n = 0;
    while ((i = buf.indexOf('collate nocase ', i + 1, 'latin1')) !== -1) {
      buf.write('collate unicase', i, 'latin1');
      n++;
    }
    assert.ok(n >= 4, 'fixture should contain several collations');
    fs.writeFileSync(file, buf);
  }
}

/** a query function over a database file or buffer, like the one the app gives the reader */
const openDbs = [];
function openQuery(bytes) {
  const f = path.join(tmp, 'open-' + Math.random().toString(36).slice(2) + '.db');
  fs.writeFileSync(f, bytes);
  const db = new DatabaseSync(f);
  openDbs.push(db);
  return (sql) => db.prepare(sql).all().map((r) => Object.values(r));
}

const legacyFile = path.join(tmp, 'legacy.anki2');
const newFile = path.join(tmp, 'new.anki2');
makeLegacy(legacyFile);
makeNew(newFile, true);

function build(file, extra) {
  const bytes = A.rollbackMode(A.patchCollation(fs.readFileSync(file)));
  const norm = A.readCollection(openQuery(bytes));
  const have = new Set(['hi.png', 'hi.mp3']);
  return { norm, res: A.buildImport(norm, Object.assign({ now: NOW, rolloverHour: 4, learningSteps: 2, hasMedia: (n) => have.has(n) }, extra)) };
}
const findCard = (res, front) => {
  for (const d of res.decks) for (const c of d.cards) if (c.front === front) return c;
  return null;
};

if (process.env.ANKI_DUMP) fs.writeFileSync(process.env.ANKI_DUMP, JSON.stringify(build(newFile).res)); // used to feed the screen tests

console.log('Anki: bytes and protobuf');
t('collation: "unicase" becomes "nocase " and nothing else changes', () => {
  const raw = fs.readFileSync(newFile);
  assert.ok(raw.includes('collate unicase'));
  const p = A.patchCollation(raw);
  assert.ok(!p.includes('collate unicase'));
  assert.strictEqual(p.length, raw.length);
  assert.ok(p.includes('collate nocase '));
});
t('collation: the file with unicase opens only after patching (when SQLite checks)', () => {
  const q = openQuery(A.patchCollation(fs.readFileSync(newFile)));
  assert.strictEqual(q('SELECT count(*) FROM notetypes')[0][0], 4);
});
t('rollback mode: header bytes 18 and 19 become 1', () => {
  const b = Buffer.alloc(100);
  b.write('SQLite format 3\0', 0, 'latin1');
  b[18] = 2;
  b[19] = 2;
  A.rollbackMode(b);
  assert.deepStrictEqual([b[18], b[19]], [1, 1]);
});
t('protobuf: numbers and strings', () => {
  const m = A.pbParse(Buffer.concat([pbNum(1, 300), pbBytes(2, 'سلام'), pbNum(3, 0)]));
  assert.strictEqual(m.get(1)[0], 300);
  assert.strictEqual(Buffer.from(m.get(2)[0]).toString('utf8'), 'سلام');
});

console.log('Anki: both layouts give the same result');
for (const [label, file] of [['older layout', legacyFile], ['newer layout (unicase)', newFile]]) {
  t(label + ': decks, nesting and counts', () => {
    const { res } = build(file);
    assert.deepStrictEqual(res.decks.map((d) => d.name), ['Default', 'Lang', 'Lang › Verbs']);
    assert.deepStrictEqual(res.decks.map((d) => d.path), [['Default'], ['Lang'], ['Lang', 'Verbs']]);
    assert.strictEqual(res.summary.cards, 12);
    assert.strictEqual(res.summary.suspended, 1);
  });
  t(label + ': basic card text, tags, images and sound', () => {
    const { res } = build(file);
    const c = findCard(res, 'hello');
    assert.ok(c);
    assert.ok(/^سلام/.test(c.back));
    assert.ok(c.back.includes('![](hi.png)'));
    assert.ok(c.back.includes('[sound:hi.mp3]'));
    assert.deepStrictEqual(c.tags, ['greeting', 'easy']);
    assert.deepStrictEqual(res.media.map((m) => m.orig).sort(), ['hi.mp3', 'hi.png']);
  });
  t(label + ': the answer side does not repeat the question', () => {
    const { res } = build(file);
    assert.strictEqual(findCard(res, 'review me').back, 'yes');
  });
  t(label + ': reversed note gives two cards, the second swapped', () => {
    const { res } = build(file);
    const verbs = res.decks.find((d) => d.name === 'Lang › Verbs').cards;
    const a = verbs.find((c) => c.front === 'run');
    const b = verbs.find((c) => c.front === 'دویدن');
    assert.ok(a && b);
    assert.strictEqual(b.back, 'run');
  });
  t(label + ': cloze cards hide only their own deletion', () => {
    const { res } = build(file);
    const lang = res.decks.find((d) => d.name === 'Lang').cards;
    const c1 = lang.find((c) => c.front.startsWith('Paris') && c.front.includes('[...]'));
    const c2 = lang.find((c) => c.front.includes('[where]'));
    assert.ok(c1 && c2);
    assert.ok(c1.front.includes('Europe') && !c1.front.includes('France'));
    assert.ok(c1.back.includes('**France**') && c1.back.includes('extra'));
    assert.ok(c2.front.includes('France'));
  });
  t(label + ': template conditionals, tags and deck names are filled in', () => {
    const { res } = build(file);
    const c = findCard(res, 'table\n(hint)');
    assert.ok(c, 'front: ' + JSON.stringify(res.decks[0].cards.map((x) => x.front)));
    assert.ok(/^میز \[home\] Default$/.test(c.back), c.back);
  });
  t(label + ': new cards keep Anki order and have no progress', () => {
    const { res } = build(file);
    const c = findCard(res, 'hello');
    assert.strictEqual(c.sched.state, 'new');
    assert.strictEqual(c.sched.reps, 0);
    assert.strictEqual(c.created, 1700000000001);
    const order = res.decks.flatMap((d) => d.cards).filter((x) => x.sched.state === 'new').sort((a, b) => a.created - b.created);
    assert.ok(order.length >= 5);
  });
  t(label + ': review card keeps interval, ease, reps, lapses and due day', () => {
    const { res } = build(file);
    const c = findCard(res, 'review me');
    assert.strictEqual(c.sched.state, 'review');
    assert.strictEqual(c.sched.interval, 10);
    assert.strictEqual(c.sched.ease, 2.3);
    assert.strictEqual(c.sched.reps, 6);
    assert.strictEqual(c.sched.lapses, 1);
    assert.strictEqual(c.sched.due, SM2.addDays(SM2.studyDayStart(NOW, 4), 3));
    assert.strictEqual(c.sched.last, at(1, 10));
  });
  t(label + ': learning, relearning and day-learning cards', () => {
    const { res } = build(file);
    const l = findCard(res, 'learning');
    assert.strictEqual(l.sched.state, 'learn');
    assert.strictEqual(l.sched.due, Math.floor(NOW / 1000) * 1000 + 600000);
    assert.strictEqual(l.sched.step, 1 - 1 + 1 - 1 + 0 + (2 - 1)); // 1 step left of 2 -> step index 1
    const r = findCard(res, 'relearning');
    assert.strictEqual(r.sched.state, 'relearn');
    assert.strictEqual(r.sched.interval, 4);
    assert.strictEqual(r.sched.lapses, 2);
    assert.strictEqual(r.sched.due, Math.floor(NOW / 1000) * 1000 + 300000);
    const d = findCard(res, 'interday');
    assert.strictEqual(d.sched.state, 'learn');
    assert.strictEqual(d.sched.due, SM2.addDays(SM2.studyDayStart(NOW, 4), 1));
  });
  t(label + ': suspended and filtered-deck cards', () => {
    const { res } = build(file);
    assert.strictEqual(findCard(res, 'suspended one').suspended, true);
    assert.ok(!findCard(res, 'review me').suspended);
    // the card in the "Cram" filtered deck goes back to its home deck (Lang::Verbs) with its home due day
    const home = res.decks.find((d) => d.name === 'Lang › Verbs').cards.find((c) => c.front === 'in cram');
    assert.ok(home);
    assert.strictEqual(home.sched.due, SM2.addDays(SM2.studyDayStart(NOW, 4), -2));
    assert.ok(!res.decks.some((d) => d.name === 'Cram'));
  });
  t(label + ': history is counted per day with new, review and correct', () => {
    const { res } = build(file);
    const k = (n) => SM2.dayKey(at(n, 12), 4);
    const sum = (key) => {
      const out = [0, 0, 0, 0];
      for (const v of Object.values(res.history.days[key] || {})) v.forEach((x, i) => (out[i] += x));
      return out;
    };
    assert.deepStrictEqual(sum(k(5)), [2, 1, 0, 2]);
    assert.deepStrictEqual(sum(k(4)), [1, 0, 1, 1]);
    // yesterday: review (correct), learn-new (again), relearn (again)
    assert.deepStrictEqual(sum(k(1)), [3, 1, 1, 1]);
    // today: a relearn answer (not counted as a review, like Cardly) and a review of a deleted card
    assert.deepStrictEqual(sum(k(0)), [2, 0, 1, 2]);
    assert.strictEqual(res.summary.reviews, 10); // the manual entry is not counted
    assert.strictEqual(res.history.days[k(0)]['-1'][0], 1); // deleted card
  });
  t(label + ': recent history lists reviews of the last 45 days only', () => {
    const { res } = build(file);
    assert.ok(res.history.recent.every((r) => r[0] >= NOW - 45 * DAYMS));
    assert.strictEqual(res.history.recent.length, 8); // not the entries from 60 and 200 days ago, not the manual one
    const first = res.history.recent[0];
    assert.strictEqual(first[1], '2007'); // the oldest entry inside the window
    assert.ok(first[2] >= 1 && first[2] <= 4);
  });
}
t('both layouts agree card for card', () => {
  const a = build(legacyFile).res;
  const b = build(newFile).res;
  assert.deepStrictEqual(a.decks, b.decks);
  assert.deepStrictEqual(a.history, b.history);
});

console.log('Anki: details');
t('template: FrontSide, conditionals, unknown filters', () => {
  const f = { A: 'x', B: '', C: '<b>c</b>' };
  assert.strictEqual(A.renderTemplate('{{A}}{{#B}}no{{/B}}{{^B}}yes{{/B}}', f, { side: 'front' }), 'xyes');
  assert.strictEqual(A.renderTemplate('{{text:C}}|{{weird:A}}', f, { side: 'front' }), 'c|x');
  assert.strictEqual(A.renderTemplate('{{FrontSide}}{{A}}', f, { side: 'back', front: 'Q' }), 'Qx');
  assert.strictEqual(A.renderTemplate('{{A}}{{!comment}}', f, { side: 'front' }), 'x');
  assert.strictEqual(A.renderTemplate('{{#A}}{{#B}}n{{/B}}{{#C}}y{{/C}}{{/A}}', f, { side: 'front' }), 'y');
});
t('cloze filter', () => {
  const s = 'a {{c1::b}} c {{c2::d::hint}}';
  assert.strictEqual(A.clozeFilter(s, 1, 'front'), 'a [...] c d');
  assert.strictEqual(A.clozeFilter(s, 2, 'front'), 'a b c [hint]');
  assert.strictEqual(A.clozeFilter(s, 2, 'back'), 'a b c <b>d</b>');
});
t('media names: safe, stable, and different for different Persian names', () => {
  assert.strictEqual(A.safeMediaName('cat.png'), 'cat.png');
  assert.strictEqual(A.safeMediaName('my file (1).jpg'), A.safeMediaName('my file (1).jpg'));
  assert.ok(/^[\w.\-]+$/.test(A.safeMediaName('my file (1).jpg')));
  const p1 = A.safeMediaName('گربه.png');
  const p2 = A.safeMediaName('سگ.png');
  assert.notStrictEqual(p1, p2);
  assert.ok(/^[\w.\-]+$/.test(p1) && p1.endsWith('.png'));
});
t('files that are missing from the media folder are skipped, not broken links', () => {
  const { res } = build(legacyFile, { hasMedia: () => false });
  assert.strictEqual(res.media.length, 0);
  assert.ok(!findCard(res, 'hello').back.includes('![]('));
  assert.strictEqual(res.stats.images, 1);
  assert.strictEqual(res.stats.sounds, 1);
});
t('a broken file gives a readable error, not a crash', () => {
  const f = path.join(tmp, 'empty.db');
  const db = new DatabaseSync(f);
  db.exec('CREATE TABLE col (id integer, crt integer, ver integer, conf text, models text, decks text)');
  db.close();
  assert.throws(() => A.readCollection(openQuery(fs.readFileSync(f))), /Collection info/);
});
t('mapSchedule: ease 0 in the file falls back to 2.5; negative interval is read as seconds', () => {
  const s = A.mapSchedule({ type: 2, queue: 2, due: TODAY, ivl: -600, factor: 0, reps: 3, lapses: 0, left: 0, odue: 0, odid: '0' }, { now: NOW, rolloverHour: 4, crt: CRT, learningSteps: 2 }, 0);
  assert.strictEqual(s.ease, 2.5);
  assert.strictEqual(s.interval, 1);
  assert.strictEqual(s.due, SM2.studyDayStart(NOW, 4));
});

console.log('Anki: export packages (.apkg / .colpkg)');
let JSZip = null;
try {
  JSZip = require('jszip');
} catch (e) {
  try {
    JSZip = require('/opt/node-tools/node_modules/jszip');
  } catch (e2) {
    console.log('  (jszip is not installed here, package tests skipped; run npm install)');
  }
}
const { setOpener } = require('../src/ankidb');
const I = require('../src/importers');
setOpener(async (buf) => ({ query: openQuery(buf), close() {} }));
{
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const mp3 = Buffer.from('fffb9000', 'hex');
  const makeZip = async (mode) => {
    const zip = new JSZip();
    if (mode === 'legacy') {
      zip.file('collection.anki2', fs.readFileSync(legacyFile));
      zip.file('media', JSON.stringify({ 0: 'hi.png', 1: 'hi.mp3' }));
      zip.file('0', png);
      zip.file('1', mp3);
    } else if (mode === 'modern') {
      zip.file('collection.anki21b', zlib.zstdCompressSync(fs.readFileSync(newFile)));
      const entry = (n) => pbBytes(1, Buffer.concat([pbBytes(1, n), pbNum(2, 4)]));
      zip.file('media', zlib.zstdCompressSync(Buffer.concat([entry('hi.png'), entry('hi.mp3')])));
      zip.file('0', zlib.zstdCompressSync(png));
      zip.file('1', zlib.zstdCompressSync(mp3));
      zip.file('meta', pbNum(1, 3));
    } else {
      // stub only
      const f = path.join(tmp, 'stub.db');
      const db = new DatabaseSync(f);
      db.exec('CREATE TABLE col (id integer primary key, crt integer, ver integer, conf text, models text, decks text);' +
        'CREATE TABLE notes (id integer primary key, mid integer, flds text, tags text);' +
        'CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer);' +
        'CREATE TABLE revlog (id integer primary key, cid integer, ease integer, ivl integer, type integer);');
      db.prepare("INSERT INTO col VALUES (1, 0, 11, '{}', '{}', '{}')").run();
      db.prepare("INSERT INTO notes VALUES (1, 1, ?, '')").run('Please update to the latest Anki version\x1fto import this');
      db.prepare('INSERT INTO cards VALUES (1,1,1,0,0,0,1,0,0,0,0,0,0,0)').run();
      db.close();
      zip.file('collection.anki2', fs.readFileSync(f));
      zip.file('media', '{}');
    }
    return zip.generateAsync({ type: 'nodebuffer' });
  };
  (async () => {
    const live = require('../src/ankilive');
    // a pretend Anki folder:  Anki2/User 1/collection.anki2 + collection.media
    const root = path.join(tmp, 'Anki2');
    const prof = path.join(root, 'User 1');
    fs.mkdirSync(path.join(prof, 'collection.media'), { recursive: true });
    fs.mkdirSync(path.join(root, 'addons21'), { recursive: true });
    fs.copyFileSync(newFile, path.join(prof, 'collection.anki2'));
    fs.writeFileSync(path.join(prof, 'collection.media', 'hi.png'), 'PNGDATA');
    fs.writeFileSync(path.join(prof, 'collection.media', 'hi.mp3'), 'MP3DATA');
    fs.writeFileSync(path.join(prof, 'collection.media', 'unused.jpg'), 'X');
    try {
      const list = await live.scanProfiles([root, path.join(tmp, 'nothing-here')]);
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].name, 'User 1');
      assert.strictEqual(list[0].walBytes, 0);
      const before = fs.readFileSync(list[0].file);
      const msgs = [];
      const r = await live.readProfile({ file: list[0].file, now: NOW, rolloverHour: 4, learningSteps: 2 }, (m) => msgs.push(m));
      assert.strictEqual(r.anki.summary.cards, 12);
      assert.ok(msgs.length >= 2);
      assert.deepStrictEqual(r.anki.media.map((m) => m.saved).sort(), ['hi.mp3', 'hi.png']);
      assert.strictEqual(r.warnings.length, 0);
      assert.ok(fs.readFileSync(list[0].file).equals(before), 'Anki file must not change');
      const dest = path.join(tmp, 'cardly-media');
      const c = await live.copyMedia({ mediaDir: r.source.mediaDir, destDir: dest, list: r.anki.media.concat([{ orig: 'gone.png', saved: 'gone.png' }, { orig: '../x', saved: '../evil.png' }]) });
      assert.deepStrictEqual([c.copied, c.missing], [2, 1]);
      assert.strictEqual(fs.readFileSync(path.join(dest, 'hi.png'), 'utf8'), 'PNGDATA');
      assert.ok(!fs.existsSync(path.join(tmp, 'evil.png')));
      // Anki open: a non-empty -wal file next to the collection
      fs.writeFileSync(list[0].file + '-wal', 'pending');
      const r2 = await live.readProfile({ file: list[0].file, now: NOW }, null);
      assert.ok(r2.warnings.some((w) => /open/.test(w)));
      assert.ok((await live.scanProfiles([root]))[0].walBytes > 0);
      passed += 1;
      console.log('  ok  live profile: scan, read (Anki file untouched), copy media, open-Anki warning');
      await assert.rejects(() => live.readProfile({ file: path.join(tmp, 'nope.anki2') }), /not found/);
      passed += 1;
      console.log('  ok  live profile: a missing file gives a clear message');
    } catch (e) {
      console.error('FAIL  live profile\n      ' + (e.stack || e.message));
      process.exitCode = 1;
    }
    if (!JSZip) console.log('  (jszip is not installed here, package tests skipped; run npm install)');
    else await packageTests();
    // Windows cannot delete a file that is still open, so close every database first
    for (const d of openDbs) { try { d.close(); } catch (e) { /* already closed */ } }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* temp files are cleaned up by the system later */ }
    console.log(`\n${passed} tests passed` + (process.exitCode ? ' — some tests failed' : ''));
  })();

  async function packageTests() {
    for (const mode of ['legacy', 'modern']) {
      const out = path.join(tmp, 'media-' + mode);
      const zipBuf = await makeZip(mode);
      try {
        const r = await I.importFile(zipBuf, 'x.apkg', { mediaDir: out, rich: true, now: NOW, rolloverHour: 4, learningSteps: 2 });
        assert.strictEqual(r.kind, 'anki');
        assert.strictEqual(r.anki.summary.cards, 12);
        assert.ok(fs.existsSync(path.join(out, 'hi.png')) && fs.existsSync(path.join(out, 'hi.mp3')));
        assert.deepStrictEqual([...fs.readFileSync(path.join(out, 'hi.png'))], [...png]); // zstd files are unpacked
        assert.strictEqual(r.anki.decks.find((d) => d.name === 'Default').cards[0].back.includes('[sound:hi.mp3]'), true);
        passed++;
        console.log('  ok  package (' + mode + '): cards, progress and media');
      } catch (e) {
        console.error('FAIL  package (' + mode + ')\n      ' + (e.stack || e.message));
        process.exitCode = 1;
      }
    }
    try {
      const r = await I.importFile(await makeZip('legacy'), 'x.apkg', { mediaDir: path.join(tmp, 'm2') });
      assert.ok(r.decks.length === 3 && r.decks[0].cards[0].sched === undefined);
      assert.ok(r.warnings.some((w) => /From Anki/.test(w)));
      passed++;
      console.log('  ok  package: the old simple import still gives plain cards');
      const stubZip = await makeZip('stub');
      await assert.rejects(() => I.importFile(stubZip, 'x.apkg', {}), /placeholder/);
      passed++;
      console.log('  ok  package: the "please update" placeholder gives a clear message');
      await assert.rejects(() => I.importFile(Buffer.from('not a zip'), 'x.apkg', {}), /not a valid Anki package/);
      passed++;
      console.log('  ok  package: a file that is not a zip gives a clear message');
    } catch (e) {
      console.error('FAIL  package extras\n      ' + (e.stack || e.message));
      process.exitCode = 1;
    }
  }
}
