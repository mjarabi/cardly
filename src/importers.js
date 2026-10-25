/* Imports cards from Anki files (.apkg) and table files (.csv / .tsv / .txt).
 * Every importer returns the same shape:
 *   { kind, decks: [{ name, cards: [{ front, back, tags: [] }] }], warnings: [] } */
const fs = require('fs');
const path = require('path');

const { htmlToText, decodeEntities } = require('./html');

// ---------- CSV / TSV ----------

function decodeText(buf) {
  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes('�')) {
    try {
      // old Persian Excel files are usually windows-1256
      const alt = new TextDecoder('windows-1256').decode(buf);
      if (!alt.includes('�')) return alt;
    } catch (e) {
      /* ignore */
    }
  }
  return text;
}

function detectDelimiter(lines) {
  const candidates = ['\t', ';', ',', '|'];
  let best = ',';
  let bestScore = 0;
  for (const d of candidates) {
    let score = 0;
    for (const line of lines.slice(0, 20)) {
      let inQ = false;
      let n = 0;
      for (const ch of line) {
        if (ch === '"') inQ = !inQ;
        else if (ch === d && !inQ) n++;
      }
      score += n > 0 ? 1 + n * 0.01 : 0;
    }
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function parseDelimited(text, delim) {
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      inQ = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const HEADER_WORDS = ['front', 'back', 'question', 'answer', 'term', 'definition', 'سوال', 'جواب', 'پرسش', 'پاسخ', 'روی کارت', 'پشت کارت', 'رو', 'پشت', 'واژه', 'معنی'];

function looksLikeHeader(row) {
  const cells = row.slice(0, 3).map((c) => c.trim().toLowerCase());
  return cells.filter((c) => HEADER_WORDS.includes(c)).length >= 2;
}

function importText(buf, fileName) {
  const text = decodeText(buf);
  const warnings = [];
  const meta = {};
  const bodyLines = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^#([a-z ]+):(.*)$/i.exec(line);
    if (m && bodyLines.length === 0) meta[m[1].trim().toLowerCase()] = m[2].trim();
    else bodyLines.push(line);
  }
  const body = bodyLines.join('\n');
  const sepNames = { tab: '\t', comma: ',', semicolon: ';', pipe: '|', space: ' ' };
  const delim = sepNames[meta.separator] || detectDelimiter(bodyLines);
  const rows = parseDelimited(body, delim);
  if (!rows.length) throw userError('The file is empty or no rows were found.');

  const isHtml = String(meta.html).toLowerCase() === 'true';
  const tagsCol = meta['tags column'] ? parseInt(meta['tags column'], 10) - 1 : null;
  const hasHeader = looksLikeHeader(rows[0]);
  const conv = (v) => (isHtml ? htmlToText(v, null, null) : String(v || '').trim());

  const cards = [];
  rows.forEach((r, idx) => {
    if (idx === 0 && hasHeader) return;
    let tags = [];
    let cols = r;
    if (tagsCol !== null && tagsCol >= 0 && tagsCol < r.length) {
      tags = (r[tagsCol] || '').split(/\s+/).filter(Boolean);
      cols = r.filter((_, i) => i !== tagsCol);
    } else if (r.length >= 3 && !isHtml) {
      tags = (r[2] || '').split(/[\s,;]+/).filter(Boolean);
    }
    const front = conv(cols[0]);
    const back = conv(cols[1]);
    if (front || back) cards.push({ front, back, tags });
  });
  if (!cards.length) throw userError('No cards found. Each row needs at least two columns (front and back).');
  if (rows.some((r) => r.length < 2)) warnings.push('Some rows had only one column; those cards have an empty back.');

  const delimName = { '\t': 'tab', ',': 'comma', ';': 'semicolon', '|': 'pipe', ' ': 'space' }[delim];
  return {
    kind: 'text',
    detail: `Delimiter: ${delimName}${hasHeader ? ' · header row skipped' : ''}`,
    decks: [{ name: path.basename(fileName, path.extname(fileName)), cards }],
    warnings
  };
}

// ---------- Anki ----------

function userError(msg) {
  const e = new Error(msg);
  e.userMessage = msg;
  return e;
}

/** .apkg / .colpkg. Default: the old simple result (cards only, all new).
 *  With opts.rich the full conversion is returned (nesting, progress, history) for the "From Anki" screen. */
async function importAnki(buf, mediaDir, opts) {
  const o = opts || {};
  const { openPackage } = require('./ankipkg');
  const AK = require('./anki');
  const pkg = await openPackage(buf);
  const built = AK.buildImport(pkg.norm, { hasMedia: pkg.hasMedia, rolloverHour: o.rolloverHour, learningSteps: o.learningSteps, now: o.now });
  const written = mediaDir ? await pkg.writeMedia(built.media, mediaDir) : 0;
  const images = built.media.filter((m) => m.kind === 'image').length;
  const sounds = built.media.filter((m) => m.kind === 'audio').length;

  const warnings = [];
  if (built.stats.sounds) warnings.push(`${built.stats.sounds} audio file(s) were not found in the package and were skipped.`);
  if (built.stats.images) warnings.push(`${built.stats.images} image(s) were missing or unsupported.`);
  if (written < built.media.length) warnings.push(`${built.media.length - written} media file(s) could not be copied.`);
  const detail = `${images} image(s), ${sounds} audio file(s)`;

  if (o.rich) return { kind: 'anki', detail, anki: built, warnings };
  warnings.push('Review progress is not imported here; every card arrives as new. Use "From Anki" in the sidebar to bring progress and history too.');
  return {
    kind: 'anki',
    detail,
    decks: built.decks.map((d) => ({ name: d.name, cards: d.cards.map((c) => ({ front: c.front, back: c.back, tags: c.tags })) })),
    warnings
  };
}

async function importFile(buf, fileName, opts) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.apkg' || ext === '.colpkg') return importAnki(buf, opts && opts.mediaDir, opts);
  if (['.csv', '.tsv', '.txt'].includes(ext)) return importText(buf, fileName);
  throw userError('Unsupported file type. Use apkg, csv, tsv or txt.');
}

module.exports = { importFile, importText, importAnki, parseDelimited, detectDelimiter, htmlToText, decodeEntities };
