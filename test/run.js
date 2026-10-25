const assert = require('assert');
const SM2 = require('../src/sm2');
const R = require('../renderer/render');
const I = require('../src/importers');
const SA = require('../src/smartadd');
const L = require('../src/looks');
const F = require('../src/fsrs');

let passed = 0;
function t(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    console.error('FAIL  ' + name + '\n      ' + e.message);
    process.exitCode = 1;
  }
}

const NOW = new Date(2026, 9, 22, 10, 0, 0).getTime(); // 22 Oct 2026, 10:00
const MIN = SM2.MIN;
const DAY = SM2.DAY;

console.log('SM-2');
t('new card: Good -> second learning step (10 minutes)', () => {
  const c = SM2.scheduleFields();
  const { card } = SM2.answer(c, 3, NOW);
  assert.strictEqual(card.state, 'learn');
  assert.strictEqual(card.step, 1);
  assert.strictEqual(card.due, NOW + 10 * MIN);
});
t('new card: Again -> 1 minute', () => {
  const { card } = SM2.answer(SM2.scheduleFields(), 1, NOW);
  assert.strictEqual(card.due, NOW + 1 * MIN);
});
t('new card: Hard -> average of two steps (5.5 minutes)', () => {
  const { card } = SM2.answer(SM2.scheduleFields(), 2, NOW);
  assert.strictEqual(card.due, NOW + 5.5 * MIN);
});
t('new card: Easy -> graduates with 4 days', () => {
  const { card } = SM2.answer(SM2.scheduleFields(), 4, NOW);
  assert.strictEqual(card.state, 'review');
  assert.strictEqual(card.interval, 4);
});
t('last learning step: Good -> review with 1 day', () => {
  let c = SM2.scheduleFields();
  c = SM2.answer(c, 3, NOW).card;
  c = SM2.answer(c, 3, NOW + 10 * MIN).card;
  assert.strictEqual(c.state, 'review');
  assert.strictEqual(c.interval, 1);
});
t('review: intervals are always ordered hard < good < easy', () => {
  for (const interval of [1, 2, 5, 30, 400]) {
    const c = Object.assign(SM2.scheduleFields(), { state: 'review', interval, due: SM2.studyDayStart(NOW, 4), ease: 2.5 });
    const p = SM2.preview(c, NOW);
    assert.ok(p[1].days < p[2].days, `hard<good for ${interval}`);
    assert.ok(p[2].days < p[3].days, `good<easy for ${interval}`);
    assert.ok(p[1].days > interval, 'hard>current');
  }
});
t('review: Again -> relearning, ease goes down, lapses go up', () => {
  const c = Object.assign(SM2.scheduleFields(), { state: 'review', interval: 20, due: SM2.studyDayStart(NOW, 4), ease: 2.5, reps: 5 });
  const { card } = SM2.answer(c, 1, NOW);
  assert.strictEqual(card.state, 'relearn');
  assert.strictEqual(card.lapses, 1);
  assert.ok(Math.abs(card.ease - 2.3) < 1e-9);
  assert.strictEqual(card.due, NOW + 10 * MIN);
});
t('ease never drops below 1.3', () => {
  let c = Object.assign(SM2.scheduleFields(), { state: 'review', interval: 10, due: SM2.studyDayStart(NOW, 4), ease: 1.35 });
  c = SM2.answer(c, 2, NOW).card;
  assert.ok(c.ease >= 1.3);
});
t('the original card is not changed (no side effects)', () => {
  const c = SM2.scheduleFields();
  const snap = JSON.stringify(c);
  SM2.answer(c, 3, NOW);
  assert.strictEqual(JSON.stringify(c), snap);
});
t('the maximum interval is respected', () => {
  const c = Object.assign(SM2.scheduleFields(), { state: 'review', interval: 30000, due: SM2.studyDayStart(NOW, 4), ease: 3 });
  assert.ok(SM2.answer(c, 4, NOW).card.interval <= 36500);
});
t('a review card is not due tomorrow but is due today', () => {
  const today = Object.assign(SM2.scheduleFields(), { state: 'review', interval: 3, due: SM2.studyDayStart(NOW, 4) });
  const tomorrow = Object.assign({}, today, { due: SM2.addDays(SM2.studyDayStart(NOW, 4), 1) });
  assert.ok(SM2.isDue(today, NOW));
  assert.ok(!SM2.isDue(tomorrow, NOW));
});
t('2 AM still belongs to the previous day (rollover at 4)', () => {
  const late = new Date(2026, 9, 22, 2, 0, 0).getTime();
  assert.strictEqual(SM2.dayKey(late, 4), '2026-10-21');
  assert.strictEqual(SM2.dayKey(NOW, 4), '2026-10-22');
});
t('the study queue respects the daily limits', () => {
  const cards = [];
  for (let i = 0; i < 30; i++) cards.push(Object.assign(SM2.scheduleFields(), { id: 'n' + i, created: i }));
  for (let i = 0; i < 10; i++) cards.push(Object.assign(SM2.scheduleFields(), { id: 'r' + i, state: 'review', interval: 2, due: SM2.studyDayStart(NOW, 4) - DAY }));
  const q = SM2.buildQueue(cards, NOW, { newLimit: 20, reviewLimit: 5, newDone: 5, reviewDone: 0 });
  assert.strictEqual(q.counts.fresh, 15);
  assert.strictEqual(q.counts.review, 5);
});

console.log('Content rendering');
const fakeKatex = { renderToString: (src, o) => `<k${o.displayMode ? ' d' : ''}>${src}</k>` };
t('inline and display math', () => {
  const h = R.renderContent('انرژی $E=mc^2$ است\n$$\\int_0^1 x\\,dx$$', { katex: fakeKatex });
  assert.ok(h.includes('<k>E=mc^2</k>'));
  assert.ok(h.includes('<k d>\\int_0^1 x\\,dx</k>'));
});
t('dollar signs used for prices are not math', () => {
  const h = R.renderContent('قیمت 5$ و 10$ است', { katex: fakeKatex });
  assert.ok(!h.includes('<k>'));
});
t('dangerous HTML is escaped', () => {
  const h = R.renderContent('<img src=x onerror=alert(1)><script>x</script>', { katex: fakeKatex });
  assert.ok(!h.includes('<script>'));
  assert.ok(!/<img src=x/.test(h));
  assert.ok(h.includes('&lt;script&gt;'));
});
t('bold, italic and code', () => {
  const h = R.renderContent('**a** و *b* و `c<d`', { katex: fakeKatex });
  assert.ok(h.includes('<strong>a</strong>'));
  assert.ok(h.includes('<em>b</em>'));
  assert.ok(h.includes('<code>c&lt;d</code>'));
});
t('small label with two tildes', () => {
  const h = R.renderContent('word\n~~verb~~', { katex: fakeKatex });
  assert.ok(h.includes('<span class="label">verb</span>'));
});
t('a star inside math does not become italic', () => {
  const h = R.renderContent('$a*b*c$', { katex: fakeKatex });
  assert.ok(h.includes('<k>a*b*c</k>'));
});
t('an image needs a valid file name', () => {
  const ok = R.renderContent('![](img-1.png)', {});
  assert.ok(ok.includes('src="media://f/img-1.png"'));
  const bad = R.renderContent('![](x" onerror="y)', {});
  assert.ok(!bad.includes('<img'));
});
t('every line has automatic direction', () => {
  const h = R.renderContent('سلام\nhello', {});
  assert.strictEqual((h.match(/dir="auto"/g) || []).length, 2);
});
t('plain text for lists', () => {
  assert.strictEqual(R.plainText('**سلام** $x^2$ ![](a.png)'), 'سلام x^2 🖼');
});

console.log('Import');
t('simple CSV with quotes and a comma inside the text', () => {
  const rows = I.parseDelimited('a,"b, c","d ""q"""\n1,2,3\n', ',');
  assert.deepStrictEqual(rows, [['a', 'b, c', 'd "q"'], ['1', '2', '3']]);
});
t('CSV with a line break inside quotes', () => {
  const rows = I.parseDelimited('q,"line1\nline2"\n', ',');
  assert.strictEqual(rows[0][1], 'line1\nline2');
});
t('separator detection', () => {
  assert.strictEqual(I.detectDelimiter(['a\tb', 'c\td']), '\t');
  assert.strictEqual(I.detectDelimiter(['a;b', 'c;d']), ';');
  assert.strictEqual(I.detectDelimiter(['a,b', 'c,d']), ',');
});
t('Persian CSV with a header row', () => {
  const buf = Buffer.from('﻿سوال,جواب\nپایتخت ایران؟,تهران\n۲+۲,۴\n', 'utf8');
  const r = I.importText(buf, 'test.csv');
  assert.strictEqual(r.decks[0].name, 'test');
  assert.strictEqual(r.decks[0].cards.length, 2);
  assert.strictEqual(r.decks[0].cards[0].front, 'پایتخت ایران؟');
});
t('Anki text file (tab, HTML, tags column)', () => {
  const txt = '#separator:tab\n#html:true\n#tags column:3\nسلام<br>دنیا\t<b>hello</b>\ttag1 tag2\n';
  const r = I.importText(Buffer.from(txt), 'anki.txt');
  const c = r.decks[0].cards[0];
  assert.strictEqual(c.front, 'سلام\nدنیا');
  assert.strictEqual(c.back, '**hello**');
  assert.deepStrictEqual(c.tags, ['tag1', 'tag2']);
});
t('Anki HTML conversion: math, entities, images', () => {
  const map = (s) => (s === 'p.png' ? 'p.png' : null);
  const out = I.htmlToText('x &amp; y [$]a^2[/$]<div>[$$]\\frac{1}{2}[/$$]</div><img src="p.png">[sound:a.mp3]', map, {});
  assert.ok(out.includes('x & y $a^2$'));
  assert.ok(out.includes('$$\\frac{1}{2}$$'));
  assert.ok(out.includes('![](p.png)'));
  assert.ok(!out.includes('sound'));
});

console.log('Smart Add');
t('word list: numbering, commas, duplicates', () => {
  const w = SA.parseWords('1. abandon\n- Ability, able; abandon\n\n  give   up \n');
  assert.deepStrictEqual(w, ['abandon', 'Ability', 'able', 'give up']);
});
t('prompt contains the count, rules and every word', () => {
  const p = SA.buildPrompt(['abandon', 'give up'], { examples: 3, persian: true });
  assert.ok(p.includes('exactly 3 natural example'));
  assert.ok(p.includes('"persian"'));
  assert.ok(p.includes('1. abandon') && p.includes('2. give up'));
  assert.ok(!SA.buildPrompt(['a'], { examples: 2, persian: false }).includes('"persian"'));
});
t('reply: plain array, fenced, and text around it', () => {
  const arr = '[{"word":"abandon","pos":"Verb","definition":"to leave","persian":"ترک کردن","examples":["He abandoned it.","She did too."]}]';
  assert.strictEqual(SA.parseReply(arr).items.length, 1);
  assert.strictEqual(SA.parseReply('Sure! Here you go:\n```json\n' + arr + '\n```\nEnjoy').items[0].pos, 'verb');
});
t('reply: bad entries are skipped, garbage gives an error', () => {
  const r = SA.parseReply('[{"word":"a"},{"word":"b","definition":"x","examples":[]},5]');
  assert.strictEqual(r.items.length, 1);
  assert.strictEqual(r.skipped, 2);
  assert.ok(SA.parseReply('I cannot help').error);
});
t('reply copied from a chat site with backslashes before brackets', () => {
  const escaped = '[ { "word": "abandon", "pos": "verb", "definition": "To leave.", "persian": "ترک کردن", "examples": \\[ "One.", "Two." \\] }, { "word": "ability", "pos": "noun", "definition": "Power.", "persian": "توانایی", "examples": \\[ "Three." \\] } \\]';
  const r = SA.parseReply(escaped);
  assert.strictEqual(r.items.length, 2);
  assert.strictEqual(r.items[0].examples.length, 2);
  assert.strictEqual(SA.parseReply('[{"word":"a","definition":"b","examples":["x",],}]').items.length, 1);
  assert.strictEqual(SA.parseReply('[{“word”:“a”,“definition”:“b”,“examples”:[“x”]}]').items.length, 1);
});
t('card text matches the pack format and respects the example limit', () => {
  const c = SA.toCard({ word: 'abandon', pos: 'verb', definition: 'to leave', persian: 'ترک کردن', examples: ['a', 'b', 'c', 'd'] }, { examples: 2 });
  assert.strictEqual(c.front, 'abandon\n~~verb~~');
  assert.strictEqual(c.back, 'ترک کردن\n\nto leave\n\n- a\n- b');
  assert.strictEqual(c.sf, 'abandon');
  assert.strictEqual(SA.frontKey(c.front), 'abandon');
});
t('looks: every look follows Light / Dark / Auto', () => {
  for (const look of Object.keys(L.LOOKS)) {
    assert.strictEqual(L.resolve({ look, theme: 'dark' }, false).mode, 'dark', look);
    assert.strictEqual(L.resolve({ look, theme: 'light' }, true).mode, 'light', look);
    assert.strictEqual(L.resolve({ look, theme: 'system' }, true).mode, 'dark', look);
    assert.strictEqual(L.resolve({ look, theme: 'system' }, false).mode, 'light', look);
  }
});
t('looks: the old Graphite name is Frost in dark mode', () => {
  const r = L.resolve({ look: 'graphite', theme: 'light' }, false);
  assert.strictEqual(r.look, 'frost');
  assert.strictEqual(r.mode, 'dark');
});
t('looks: unknown look or accent falls back, accent has a light and a dark variant', () => {
  const a = L.resolve({ look: 'nope', accent: 'nope', theme: 'light' }, false);
  assert.strictEqual(a.look, 'glass');
  assert.strictEqual(a.accentKey, 'blue');
  assert.strictEqual(a.accent, L.ACCENTS.blue.light);
  assert.strictEqual(a.onAccent, '#ffffff');
  const d = L.resolve({ look: 'frost', theme: 'dark', accent: 'rose' }, false);
  assert.strictEqual(d.accent, L.ACCENTS.rose.dark);
  assert.strictEqual(d.onAccent, '#0b1020');
  assert.ok(/^rgba\(\d+, \d+, \d+, 0\.2\)$/.test(d.accentSoft));
  assert.strictEqual(L.resolve({ look: 'paper' }, false).accentKey, 'green');
  assert.strictEqual(L.resolve({ look: 'paper', accent: 'orange' }, false).accentKey, 'orange');
});
t('looks: app font is empty by default and known fonts give a stack', () => {
  assert.strictEqual(L.resolve({ look: 'paper' }, false).font, '');
  assert.strictEqual(L.resolve({ appFont: 'nope' }, false).font, '');
  assert.ok(/Cambria/.test(L.resolve({ appFont: 'cambria' }, false).font));
  assert.ok(Object.values(L.FONTS).every((f) => f.name && f.stack));
});
t('looks: every look has a background color for both modes', () => {
  for (const k of Object.keys(L.LOOKS)) for (const m of ['light', 'dark']) assert.ok(/^#[0-9a-f]{6}$/i.test(L.LOOKS[k].bg[m]), k + ' ' + m);
});
t('audio: [sound:file] becomes a play button; odd names stay as text', () => {
  const html = R.renderContent('Hello [sound:cat-1.mp3] there [sound:<img onerror=x>]', {});
  assert.ok(html.includes('class="sound-btn"') && html.includes('data-sound="cat-1.mp3"'));
  assert.ok(!html.includes('<img onerror'));
  assert.ok(R.plainText('a [sound:x.mp3] b').includes('🔊'));
});
t('audio: the importer keeps [sound:] only for files it can bring over', () => {
  const kept = I.htmlToText('hi [sound:a b.mp3]', null, {}, (n) => n.replace(/ /g, '_'));

  assert.ok(kept.includes('[sound:a_b.mp3]'));
  const stats = {};
  assert.strictEqual(I.htmlToText('hi [sound:a.mp3]', null, stats, () => null), 'hi');
  assert.strictEqual(stats.sounds, 1);
});
console.log('\nNew scheduling method (FSRS)');
const near = (a, b, eps = 1e-5) => assert.ok(Math.abs(a - b) < eps, a + ' vs ' + b);
t('fsrs: the numbers match an independent calculation of the published formulas', () => {
  const w = F.DEFAULT_W;
  const ref = {"R_S_S": 0.9, "I_S_0.9": 5.0, "I_S_0.8": 16.579798931154908, "D0": [6.4133, 5.112170705601055, 2.118103970459015, 1], "nd": [8.347534, 6.671767, 4.996, 3.320233], "seq": [[0.909493, 10.964332, 2.116986], [0.935918, 33.204609, 2.115869], [0.945034, 61.990222, 4.757146], [0.941885, 121.897086, 4.753389], [0.941089, 3.777414, 8.266475], [0.937565, 6.519131, 8.259208]], "rs": [23.246875110466817, 32.02672948198673, 51.25386164681294], "fs": 1.3919869729546932, "ss": [0.5185397991541629, 1.5, 1.5345873292180081, 2.639954029648401]};
  near(F.retrievability(w, 5, 5), ref.R_S_S);
  near(F.interval(w, 5, 0.9), ref['I_S_0.9']);
  near(F.interval(w, 5, 0.8), ref['I_S_0.8'], 1e-9);
  [1, 2, 3, 4].forEach((g, i) => near(F.initD(w, g), ref.D0[i]));
  [1, 2, 3, 4].forEach((g, i) => near(F.nextD(w, 5, g), ref.nd[i]));
  [2, 3, 4].forEach((g, i) => near(F.recallS(w, 5, 10, 0.9, g), ref.rs[i], 1e-9));
  near(F.forgetS(w, 5, 10, 0.9), ref.fs, 1e-9);
  [1, 2, 3, 4].forEach((g, i) => near(F.sameDayS(w, 1.5, g), ref.ss[i], 1e-9));
  // a whole history: good, good, hard, good, again, good
  let S = F.initS(w, 3);
  let D = F.initD(w, 3);
  [[2, 3], [6, 3], [15, 2], [30, 3], [60, 1], [2, 3]].forEach(([t, g], i) => {
    const R = F.retrievability(w, t, S);
    const S2 = g === 1 ? F.forgetS(w, D, S, R) : F.recallS(w, D, S, R, g);
    D = F.nextD(w, D, g);
    S = S2;
    near(R, ref.seq[i][0], 1e-5);
    near(S, ref.seq[i][1], 1e-4);
    near(D, ref.seq[i][2], 1e-5);
  });
});
t('fsrs: 90 % remembered exactly when the interval equals stability', () => {
  for (const S of [0.5, 3, 40, 900]) near(F.interval(F.DEFAULT_W, S, 0.9), S, 1e-6);
});
const FS = { scheduler: 'fsrs', desiredRetention: 0.9 };
const reviewCard = (extra) => Object.assign(SM2.scheduleFields(), { id: 1, state: 'review', interval: 10, due: SM2.studyDayStart(NOW, 4), ease: 2.5, reps: 5, last: NOW - 10 * DAY }, extra);
t('fsrs: a new card keeps the same learning steps, then gets its first long interval', () => {
  let c = SM2.scheduleFields();
  let r = SM2.answer(c, 3, NOW, FS);
  assert.strictEqual(r.card.state, 'learn');
  assert.strictEqual(r.card.due, NOW + 10 * MIN);
  assert.ok(r.card.stab > 0 && r.card.diff >= 1 && r.card.diff <= 10);
  r = SM2.answer(r.card, 3, NOW + 10 * MIN, FS); // second step done: graduates
  assert.strictEqual(r.card.state, 'review');
  assert.ok(r.card.interval >= 2 && r.card.interval <= 6, 'first interval ' + r.card.interval);
  assert.strictEqual(r.card.due, SM2.addDays(SM2.studyDayStart(NOW + 10 * MIN, 4), r.card.interval));
});
t('fsrs: easy on a new card graduates at once with a longer interval than good', () => {
  const easy = SM2.answer(SM2.scheduleFields(), 4, NOW, FS).card;
  assert.strictEqual(easy.state, 'review');
  assert.ok(easy.interval >= 6, 'easy ' + easy.interval);
});
t('fsrs: the four answers on a review card give again < hard < good < easy', () => {
  const c = reviewCard({ stab: 10, diff: 5 });
  const p = SM2.preview(c, NOW, FS);
  assert.ok(p[0].ms < p[1].ms || p[0].days === null);
  assert.ok(p[1].days < p[2].days && p[2].days < p[3].days, JSON.stringify(p.map((x) => x.days)));
});
t('fsrs: forgetting counts a lapse, goes to relearning, and the next interval is much shorter', () => {
  const c = reviewCard({ stab: 30, diff: 5, interval: 30, due: SM2.studyDayStart(NOW, 4) });
  const r = SM2.answer(c, 1, NOW, FS).card;
  assert.strictEqual(r.state, 'relearn');
  assert.strictEqual(r.lapses, 1);
  assert.ok(r.stab < c.stab);
  const back = SM2.answer(r, 3, NOW + 10 * MIN, FS).card;
  assert.strictEqual(back.state, 'review');
  assert.ok(back.interval < 15, 'after lapse ' + back.interval);
});
t('fsrs: an easy card grows faster than a hard one when answered the same way', () => {
  const easy = SM2.answer(reviewCard({ stab: 10, diff: 2 }), 3, NOW, FS).card;
  const hard = SM2.answer(reviewCard({ stab: 10, diff: 9 }), 3, NOW, FS).card;
  assert.ok(easy.interval > hard.interval, easy.interval + ' vs ' + hard.interval);
});
t('fsrs: a card that came from the older method (no hidden numbers) still works', () => {
  const c = reviewCard({ interval: 20, ease: 2.3, due: SM2.studyDayStart(NOW, 4) });
  const r = SM2.answer(c, 3, NOW, FS).card;
  assert.ok(r.interval > 20, 'interval ' + r.interval);
  assert.ok(r.stab > 0 && r.diff >= 1 && r.diff <= 10);
});
t('fsrs: reviewing late is rewarded a little (longer next interval than on time)', () => {
  const onTime = SM2.answer(reviewCard({ stab: 10, diff: 5, due: SM2.studyDayStart(NOW, 4) }), 3, NOW, FS).card;
  const late = SM2.answer(reviewCard({ stab: 10, diff: 5, due: SM2.addDays(SM2.studyDayStart(NOW, 4), -5) }), 3, NOW, FS).card;
  assert.ok(late.interval >= onTime.interval, late.interval + ' vs ' + onTime.interval);
});
t('fsrs: a higher target memory means shorter intervals', () => {
  const c = reviewCard({ stab: 20, diff: 5, interval: 20 });
  const a = SM2.answer(c, 3, NOW, { scheduler: 'fsrs', desiredRetention: 0.95 }).card.interval;
  const b = SM2.answer(c, 3, NOW, { scheduler: 'fsrs', desiredRetention: 0.8 }).card.interval;
  assert.ok(a < b, a + ' vs ' + b);
});
t('classic stays the default and gives the same results as before', () => {
  const r = SM2.answer(SM2.scheduleFields(), 3, NOW).card;
  assert.strictEqual(r.stab, undefined);
  assert.strictEqual(r.due, NOW + 10 * MIN);
  assert.strictEqual(SM2.DEFAULTS.scheduler, 'classic');
});
t('fsrs: the original card object is never changed', () => {
  const c = reviewCard({ stab: 10, diff: 5 });
  const copy = JSON.stringify(c);
  SM2.answer(c, 3, NOW, FS);
  SM2.preview(c, NOW, FS);
  assert.strictEqual(JSON.stringify(c), copy);
});

console.log('\nWord topics');
const fs = require('fs');
const path = require('path');
// the example topic is always checked; real topics (topic-*.js) are checked when present
const topicFiles = fs.readdirSync(path.join(__dirname, '../src/packs')).filter((f) => f.startsWith('topic-') || f === '_example-topic.js');
const topics = topicFiles.map((f) => require('../src/packs/' + f));
t('topics: there are several topics and each has sections', () => {
  assert.ok(topics.length >= 1);
  for (const tp of topics) {
    assert.strictEqual(tp.kind, 'topic');
    assert.ok(tp.id.startsWith('topic-') && tp.name && tp.description && tp.decks.length >= 1, tp.id);
  }
});
t('topics: every card has a Persian meaning, an English meaning and exactly three examples', () => {
  const bad = [];
  for (const tp of topics)
    for (const d of tp.decks)
      for (const c of d.cards) {
        const parts = c.back.split('\n\n');
        const examples = (parts[parts.length - 1].match(/^- .+$/gm) || []).length;
        const persian = /[\u0600-\u06FF]/.test(parts[0]);
        const english = parts.length === 3 && /[A-Za-z]/.test(parts[1]);
        if (!(examples === 3 && persian && english && c.front.includes('\n~~') && c.sf)) bad.push(tp.id + ' / ' + c.front.split('\n')[0]);
      }
  assert.deepStrictEqual(bad, []);
});
t('topics: no Urdu or other non-Persian letters slipped into the Persian text', () => {
  const odd = /[\u0679\u0688\u0691\u06BA\u06D2\u06BE\u06C1\u06C3\u0643\u064A]/; // Urdu letters, Arabic kaf and yeh
  const bad = [];
  for (const tp of topics) for (const d of tp.decks) for (const c of d.cards) if (odd.test(c.back)) bad.push(c.front.split('\n')[0]);
  assert.deepStrictEqual(bad, []);
});
t('topics: no word is repeated inside one section, and cards are unique inside a topic', () => {
  const bad = [];
  for (const tp of topics) {
    const seen = new Set();
    for (const d of tp.decks) for (const c of d.cards) {
      const k = c.front;
      if (seen.has(k)) bad.push(tp.id + ' / ' + k.replace('\n', ' '));
      seen.add(k);
    }
  }
  assert.deepStrictEqual(bad, []);
});
t('topics: examples really contain the word (or a form of it)', () => {
  const bad = [];
  for (const tp of topics)
    for (const d of tp.decks)
      for (const c of d.cards) {
        const word = c.front.split('\n')[0].toLowerCase();
        const stem = word.replace(/(ing|ed|es|s|e|y)$/, '').split(' ')[0];
        const ex = c.back.split('\n').filter((l) => l.startsWith('- '));
        const hits = ex.filter((l) => l.toLowerCase().includes(stem.slice(0, Math.max(3, stem.length - 1)))).length;
        if (hits < 2) bad.push(word);
      }
  assert.ok(bad.length <= 6, 'examples without the word: ' + bad.join(', '));
});
t('topics: the card text draws as a dictionary entry', () => {
  const c = topics[0].decks[0].cards[0];
  const html = R.renderContent(c.back, {});
  assert.ok(html.includes('bullet'));
});

t('suspended cards are left out of the queue and the counts', () => {
  const mk = (id, extra) => Object.assign(SM2.scheduleFields(), { id, created: id }, extra);
  const cards = [mk(1), mk(2, { suspended: true }), mk(3, { state: 'review', interval: 5, due: SM2.studyDayStart(NOW, 4) }), mk(4, { state: 'review', interval: 5, due: SM2.studyDayStart(NOW, 4), suspended: true })];
  const q = SM2.buildQueue(cards, NOW, { newLimit: 20, reviewLimit: 200 });
  assert.deepStrictEqual(q.fresh.map((c) => c.id), [1]);
  assert.deepStrictEqual(q.review.map((c) => c.id), [3]);
  assert.strictEqual(q.counts.fresh + q.counts.review, 2);
});
console.log(`\n${passed} tests passed` + (process.exitCode ? ' - some tests failed' : ''));
