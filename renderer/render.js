/* Converts card text (math and simple markup) into safe HTML.
 * Supported: $math$, **bold**, *italic*, ~~small label~~, `code`, ![](image), [sound:file], line breaks.
 * All text is escaped first, so arbitrary HTML never runs. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CardRender = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?!\s)((?:\\.|[^$\\\n])+?)(?<!\s)\$(?!\d)/g;
  const MARK = '\u0000';

  function renderContent(text, opts) {
    const katex = opts && opts.katex;
    const stash = [];
    const hold = (html) => {
      stash.push(html);
      return MARK + (stash.length - 1) + MARK;
    };

    let s = String(text == null ? '' : text).replace(/\r\n?/g, '\n');

    // 1) math
    s = s.replace(MATH_RE, (m, d1, d2, i1, i2) => {
      const display = d1 !== undefined || d2 !== undefined;
      const src = (d1 !== undefined ? d1 : d2 !== undefined ? d2 : i1 !== undefined ? i1 : i2).trim();
      let html;
      try {
        if (!katex) throw new Error('no katex');
        html = katex.renderToString(src, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false });
      } catch (e) {
        html = '<code>' + esc(src) + '</code>';
      }
      return hold('<span class="math' + (display ? ' math-display' : '') + '">' + html + '</span>');
    });

    // 2) code
    s = s.replace(/`([^`\n]+)`/g, (m, code) => hold('<code>' + esc(code) + '</code>'));

    // 3) escaped characters
    s = s.replace(/\\([*`$\\])/g, (m, ch) => hold(esc(ch)));

    // 4) image (before the general escape, so the file name can be validated)
    s = s.replace(/!\[[^\]\n]*\]\(([^)\n]+)\)/g, (m, src) => {
      const name = src.trim();
      if (!/^[\w.\-؀-ۿ ]+$/.test(name)) return hold(esc(m));
      return hold('<img class="card-img" alt="" src="media://f/' + encodeURIComponent(name) + '">');
    });

    // 4b) sound: [sound:file.mp3] becomes a play button
    s = s.replace(/\[sound:([^\]\n]+)\]/g, (m, src) => {
      const name = src.trim();
      if (!/^[\w.\-؀-ۿ ]+$/.test(name)) return hold(esc(m));
      return hold('<button type="button" class="sound-btn" data-sound="' + esc(name) + '" title="Play audio" aria-label="Play audio"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7L8 5Z"/></svg></button>');
    });

    // 5) escape the rest of the text
    s = esc(s);

    // 6) bold and italic
    s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+?)\*(?![*\w])/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~\n]+?)~~/g, '<span class="label">$1</span>');

    // 7) lines; each line takes its direction from its first letter (for mixed Persian/English text)
    const lines = s.split('\n').map((ln) => {
      if (!ln.trim()) return '<div class="ln gap"></div>';
      const bullet = /^\s*[-•]\s+/.test(ln);
      const body = bullet ? ln.replace(/^\s*[-•]\s+/, '') : ln;
      return '<div class="ln' + (bullet ? ' bullet' : '') + '" dir="auto">' + body + '</div>';
    });
    s = lines.join('');

    // 8) put the held parts back
    s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => stash[Number(i)]);
    return s;
  }

  /** Plain text (for lists and search): removes markup and math */
  function plainText(text) {
    return String(text == null ? '' : text)
      .replace(/!\[[^\]\n]*\]\([^)\n]+\)/g, '🖼')
      .replace(/\[sound:[^\]\n]+\]/g, '🔊')
      .replace(/\$\$([\s\S]+?)\$\$/g, ' $1 ')
      .replace(/\\\[([\s\S]+?)\\\]/g, ' $1 ')
      .replace(/\\\(([\s\S]+?)\\\)/g, ' $1 ')
      .replace(/\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return { renderContent, plainText, esc };
});
