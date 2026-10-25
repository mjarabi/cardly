/* Turns the HTML Anki stores in its fields into the plain text Cardly uses (with ![](image), $math$, **bold**).
 * Shared by the file importer and the direct Anki reader. */


const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»' };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch (err) {
        return m;
      }
    }
    const v = ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

/** imgMap(src) returns the saved file name of an image, or null when it is not available.
 *  soundMap(name) does the same for audio; when it is missing the [sound:...] marker is dropped. */
function htmlToText(html, imgMap, stats, soundMap) {
  let s = String(html == null ? '' : html);
  // Anki math
  s = s.replace(/\[\$\$\]([\s\S]*?)\[\/\$\$\]/g, (m, t) => '$$' + t + '$$');
  s = s.replace(/\[\$\]([\s\S]*?)\[\/\$\]/g, (m, t) => '$' + t + '$');
  s = s.replace(/\[latex\]([\s\S]*?)\[\/latex\]/gi, (m, t) => '$' + t + '$');
  // styles and scripts that some templates carry along
  s = s.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/\[anki:[^\]]*\]/g, '');
  // audio: kept as [sound:file] when the file is available, otherwise dropped
  s = s.replace(/\[sound:([^\]]*)\]/g, (m, name) => {
    const saved = soundMap ? soundMap(decodeEntities(name).trim()) : null;
    if (saved) return ' [sound:' + saved + '] ';
    if (stats) stats.sounds = (stats.sounds || 0) + 1;
    return '';
  });
  // images
  s = s.replace(/<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi, (m, a, b, c) => {
    const src = decodeEntities(a || b || c || '');
    const name = imgMap ? imgMap(src) : null;
    if (name) return '\n![](' + name + ')\n';
    if (stats) stats.images = (stats.images || 0) + 1;
    return '';
  });
  // a block that starts in the middle of a line starts a new line
  s = s.replace(/<(div|p)\b[^>]*>/gi, (m, t, off, str) => (/(^|\n|<br\s*\/?>|<\/(div|p|li|tr|h[1-6])>)\s*$/i.test(str.slice(0, off)) ? '' : '\n'));
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(div|p|li|tr|h[1-6])>/gi, '\n');
  s = s.replace(/<li\b[^>]*>/gi, '- ');
  s = s.replace(/<\/?(b|strong)\b[^>]*>/gi, '**');
  s = s.replace(/<\/?(i|em)\b[^>]*>/gi, '*');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = s.replace(/\*{4,}/g, '').replace(/\*\*\s*\*\*/g, ' ');
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}


module.exports = { htmlToText, decodeEntities };
