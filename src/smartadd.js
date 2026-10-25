/* Smart Add: build a prompt for an AI, read its reply, and turn it into flashcards.
 * Pure functions (no network, no DOM) so they can be unit-tested.
 * Works in the renderer (window.SmartAdd) and in node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SmartAdd = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_WORDS = 400;

  /** split pasted text into a clean, unique list of words/phrases (one per line, or separated by commas/semicolons) */
  function parseWords(text) {
    const parts = String(text || '')
      .replace(/\r/g, '')
      .split(/[\n;,،؛\t]+/)
      .map((w) => w.replace(/^[\s\-•*\d.)]+(?=[A-Za-z])/, '').trim()) // "1. word", "- word"
      .map((w) => w.replace(/\s+/g, ' '))
      .filter((w) => w && w.length <= 60);
    const seen = new Set();
    const out = [];
    for (const w of parts) {
      const k = w.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(w);
      if (out.length >= MAX_WORDS) break;
    }
    return out;
  }

  /** the instruction text sent to the AI (or copied by the user) */
  function buildPrompt(words, opts) {
    const n = Math.min(6, Math.max(1, Number(opts && opts.examples) || 3));
    const persian = !opts || opts.persian !== false;
    const shape = persian ? '{"word":"","pos":"","definition":"","persian":"","examples":["",""]}' : '{"word":"","pos":"","definition":"","examples":["",""]}';
    const lines = [
      'You are a careful English learner\'s dictionary writer. For each English word or phrase in the list, write one entry.',
      '',
      'Rules for every entry:',
      '- "word": the word exactly as given.',
      '- "pos": the part of speech, one of: noun, verb, adjective, adverb, preposition, conjunction, pronoun, interjection, phrase. If the word has several, use the most common one.',
      '- "definition": ONE short, clear definition in the simple style of the Longman Dictionary of Contemporary English. Use easy, common words. Do not copy text from any dictionary.'
    ];
    if (persian) lines.push('- "persian": the natural Persian meaning, 1 to 3 short options separated by the Persian comma (،).');
    lines.push(
      `- "examples": exactly ${n} natural example sentences that use the word, each in a different situation, at an easy-to-intermediate level, each under 18 words.`,
      '',
      'Return ONLY a JSON array in the same order as the list. No explanation, no markdown, no code fences. Each item must look like:',
      shape,
      '',
      'Words:',
      ...words.map((w, i) => `${i + 1}. ${w}`)
    );
    return lines.join('\n');
  }

  function str(v) {
    return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  }

  /** read the AI's reply; tolerant of code fences and extra text around the JSON */
  function parseReply(text) {
    let s = String(text || '').trim();
    s = s.replace(/```(?:json)?/gi, '');
    // Chat websites often put a backslash before [ ] { } _ * when you copy rendered text. JSON never has those, so remove them.
    s = s.replace(/\\([\[\]{}()_*#<>~|!+=`-])/g, '$1');
    const a = s.indexOf('[');
    const b = s.lastIndexOf(']');
    let data = null;
    if (a >= 0 && b > a) {
      const body = s.slice(a, b + 1);
      const attempts = [body, body.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'"), body.replace(/,\s*([\]}])/g, '$1')];
      for (const t of attempts) {
        try {
          data = JSON.parse(t);
          break;
        } catch (e) {
          data = null;
        }
      }
    }
    if (data === null) {
      // maybe the AI returned one object per line, or a single object
      const objs = [];
      const re = /\{[^{}]*\}/g;
      let m;
      while ((m = re.exec(s))) {
        try {
          objs.push(JSON.parse(m[0]));
        } catch (e) {
          /* skip */
        }
      }
      if (objs.length) data = objs;
    }
    if (!Array.isArray(data)) return { items: [], error: 'Could not find a valid list in the reply.' };
    const items = [];
    let skipped = 0;
    for (const it of data) {
      if (!it || typeof it !== 'object') {
        skipped++;
        continue;
      }
      const word = str(it.word);
      const definition = str(it.definition);
      if (!word || !definition) {
        skipped++;
        continue;
      }
      const ex = Array.isArray(it.examples) ? it.examples : typeof it.example === 'string' ? [it.example] : [];
      items.push({
        word,
        pos: str(it.pos).toLowerCase().replace(/[^a-z ]/g, ''),
        definition,
        persian: str(it.persian || it.meaning),
        examples: ex.map(str).filter(Boolean)
      });
    }
    return { items, skipped, error: items.length ? null : 'The reply had no usable entries.' };
  }

  /** one parsed entry -> card text. Same look as the built-in packs. */
  function toCard(item, opts) {
    const n = Math.min(6, Math.max(1, Number(opts && opts.examples) || 3));
    const front = item.word + (item.pos ? '\n~~' + item.pos + '~~' : '');
    const parts = [];
    if (item.persian) parts.push(item.persian);
    parts.push(item.definition);
    const ex = item.examples.slice(0, n);
    if (ex.length) parts.push(ex.map((e) => '- ' + e).join('\n'));
    return { front, back: parts.join('\n\n'), sf: item.word, tags: ['smart-add'] };
  }

  /** the first line of a card front, lower-cased, for duplicate checks */
  function frontKey(front) {
    return String(front || '').split('\n')[0].trim().toLowerCase();
  }

  /** split a list into groups of `size` */
  function chunk(list, size) {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
  }

  return { parseWords, buildPrompt, parseReply, toCard, frontKey, chunk, MAX_WORDS };
});
