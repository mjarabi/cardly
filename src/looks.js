/* Looks (visual styles) and accent colors. Pure data and one function, so it can be unit-tested.
 * Works in the renderer (window.Looks) and in node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Looks = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // Every look has a light and a dark version. The user picks Light / Dark / Auto in Settings.
  const LOOKS = {
    glass: { name: 'Glass', note: 'Soft frosted glass', accent: 'blue', bg: { light: '#eef1f7', dark: '#0d0f16' } },
    frost: { name: 'Frost', note: 'Clean and flat', accent: 'blue', bg: { light: '#eef1f6', dark: '#111215' } },
    paper: { name: 'Paper', note: 'Warm, like a book', accent: 'green', bg: { light: '#f4efe6', dark: '#171512' } },
    midnight: { name: 'Midnight', note: 'Cool navy glass', accent: 'teal', bg: { light: '#e8eefb', dark: '#0a1020' } }
  };
  // "Graphite" (an early name) is now Frost in dark mode
  const LEGACY = { graphite: { look: 'frost', theme: 'dark' } };

  // each color has a variant for light screens (white text on it) and one for dark screens (dark text on it)
  const ACCENTS = {
    blue: { name: 'Blue', light: '#2f6fed', dark: '#7c9cff' },
    teal: { name: 'Teal', light: '#0f7f86', dark: '#5eead4' },
    green: { name: 'Green', light: '#2f7d57', dark: '#6ee7a8' },
    violet: { name: 'Violet', light: '#6b4fd8', dark: '#b79cff' },
    orange: { name: 'Orange', light: '#b8500a', dark: '#ffb26b' },
    rose: { name: 'Rose', light: '#c2335a', dark: '#ff8fb0' }
  };

  // fonts that ship with Windows. Persian letters fall back to the system font automatically.
  const FONTS = {
    segoe: { name: 'Segoe UI', stack: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif" },
    calibri: { name: 'Calibri', stack: "Calibri, 'Segoe UI', system-ui, sans-serif" },
    verdana: { name: 'Verdana', stack: "Verdana, 'Segoe UI', system-ui, sans-serif" },
    tahoma: { name: 'Tahoma', stack: "Tahoma, 'Segoe UI', system-ui, sans-serif" },
    cambria: { name: 'Cambria (serif)', stack: "Cambria, Georgia, 'Times New Roman', serif" },
    georgia: { name: 'Georgia (serif)', stack: "Georgia, Cambria, 'Times New Roman', serif" }
  };

  const hexToRgb = (h) => {
    const n = parseInt(String(h).slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  /** settings -> what to put on the page */
  function resolve(settings, systemDark) {
    const s = Object.assign({}, settings || {});
    if (LEGACY[s.look]) Object.assign(s, LEGACY[s.look]);
    const look = LOOKS[s.look] ? s.look : 'glass';
    const def = LOOKS[look];
    const mode = s.theme === 'dark' ? 'dark' : s.theme === 'light' ? 'light' : systemDark ? 'dark' : 'light';
    const key = ACCENTS[s.accent] ? s.accent : def.accent;
    const hex = ACCENTS[key][mode];
    const [r, g, b] = hexToRgb(hex);
    return {
      look,
      mode,
      accentKey: key,
      accent: hex,
      accentSoft: 'rgba(' + r + ', ' + g + ', ' + b + ', ' + (mode === 'dark' ? 0.2 : 0.13) + ')',
      onAccent: mode === 'dark' ? '#0b1020' : '#ffffff',
      bg: def.bg[mode],
      font: FONTS[s.appFont] ? FONTS[s.appFont].stack : ''
    };
  }

  return { LOOKS, LEGACY, ACCENTS, FONTS, resolve };
});
