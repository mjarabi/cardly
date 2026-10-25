(() => {
  'use strict';

  const { renderContent, plainText } = window.CardRender;
  const SM2 = window.SM2;
  const Speech = window.Speech;
  const SmartAdd = window.SmartAdd;
  const api = window.api;
  const KATEX = window.katex || null;
  if (!KATEX) console.warn('KaTeX not found; formulas will show as plain text. Run "npm install".');

  // ============================================================
  //  Helpers
  // ============================================================

  const DAY = SM2.DAY;
  const num = (x) => Number(x).toLocaleString('en-US');
  const toLatin = (s) => String(s).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  let uidSeq = 0;
  const uid = () => Date.now().toString(36) + (uidSeq++).toString(36) + Math.random().toString(36).slice(2, 6);
  const $main = document.getElementById('main');
  const $side = document.getElementById('sidebar');

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    let pendingValue;
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value') pendingValue = v;
        else if (k === 'checked' || k === 'disabled') el[k] = true;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    if (pendingValue !== undefined) el.value = pendingValue;
    return el;
  }

  const ICONS = {
    decks: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    more: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
    flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9Z"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/>',
    play: '<path d="M7 4.5v15l12-7.5-12-7.5Z"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/>',
    speaker: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    pack: '<path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z"/><path d="M4 21a2 2 0 0 1 2-2h13"/><path d="M9 8h6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9Z"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'
  };
  function icon(name, size = 20) {
    return h('span', {
      class: 'ico',
      html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`
    });
  }

  function toast(msg, kind) {
    const el = h('div', { class: 'toast' + (kind === 'error' ? ' error' : '') }, msg);
    document.getElementById('toasts').append(el);
    setTimeout(() => el.remove(), kind === 'error' ? 5000 : 2600);
  }

  const fmtDays = (d) => (d < 30 ? `${num(d)} d` : d < 365 ? `${num(+(d / 30).toFixed(1))} mo` : `${num(+(d / 365).toFixed(1))} y`);
  const fmtMs = (ms) => {
    const m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return `${num(m)} min`;
    const hr = Math.round(m / 60);
    return hr < 24 ? `${num(hr)} h` : fmtDays(Math.round(hr / 24));
  };
  const fmtPreview = (p) => (p.days != null ? fmtDays(p.days) : fmtMs(p.ms));
  const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

  // deck icons use the accent color (soft background); no rainbow colors
  function tileColor() {
    return 'var(--accent-soft)';
  }

  // ============================================================
  //  Data
  // ============================================================

  const DEFAULT_SETTINGS = {
    theme: 'system',
    look: 'glass',
    accent: '',
    appFont: '',
    newPerDay: 20,
    reviewsPerDay: 200,
    learningSteps: '1 10',
    relearnSteps: '10',
    scheduler: 'classic',
    desiredRetention: 90,
    cardScale: 1,
    editorDir: 'auto',
    cardFont: 'default',
    cardFontCustom: '',
    autoplay: 'off',
    voiceURI: '',
    ttsRate: 0.9,
    ttsEngine: 'system',
    neuralVoice: 1,
    ai: { preset: 'deepseek', baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-v4-flash' }
  };
  const AI_PRESETS = {
    deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
    openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: '' },
    groq: { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: '' },
    openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: '' },
    ollama: { label: 'Local computer (Ollama)', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
    custom: { label: 'Other (OpenAI-compatible)', baseUrl: '', model: '' }
  };
  // servers running on this computer (Ollama, 9router, ...) usually need no key
  const isLocalUrl = (u) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(String(u || '').trim());
  const aiReady = (a) => !!(a.baseUrl && a.model && (a.apiKey || isLocalUrl(a.baseUrl)));
  const aiCfg = () => Object.assign({}, DEFAULT_SETTINGS.ai, db.settings.ai);
  let db = normalize(null);
  let byId = new Map();
  const searchCache = new WeakMap();

  function normalize(d) {
    const out = Object.assign({ version: 2, decks: [], cards: [], revlog: [], daily: {}, settings: {} }, d || {});
    out.settings = Object.assign({}, DEFAULT_SETTINGS, (d && d.settings) || {});
    for (const k of ['decks', 'cards', 'revlog']) if (!Array.isArray(out[k])) out[k] = [];
    if (!out.daily || typeof out.daily !== 'object') out.daily = {};
    const ids = new Set(out.decks.map((x) => x.id));
    for (const dk of out.decks) if (!dk.parentId || !ids.has(dk.parentId) || dk.parentId === dk.id) dk.parentId = null;
    return out;
  }
  const reindex = () => {
    byId = new Map(db.cards.map((c) => [c.id, c]));
  };

  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 400);
  }
  async function flush() {
    clearTimeout(saveTimer);
    try {
      await api.saveData(JSON.stringify(db));
    } catch (e) {
      toast('Saving failed: ' + (e.message || e), 'error');
    }
  }
  window.addEventListener('blur', flush);
  document.addEventListener('visibilitychange', () => document.hidden && flush());
  window.addEventListener('beforeunload', flush);

  const parseSteps = (s) =>
    toLatin(s || '')
      .split(/[\s,،]+/)
      .map(Number)
      .filter((x) => isFinite(x) && x > 0);
  const cfg = () =>
    Object.assign({}, SM2.DEFAULTS, {
      learningSteps: parseSteps(db.settings.learningSteps),
      relearnSteps: parseSteps(db.settings.relearnSteps),
      scheduler: db.settings.scheduler === 'fsrs' ? 'fsrs' : 'classic',
      desiredRetention: Math.min(0.97, Math.max(0.7, (Number(db.settings.desiredRetention) || 90) / 100))
    });
  const todayKey = () => SM2.dayKey(Date.now(), cfg().rolloverHour);
  const todayStats = () => db.daily[todayKey()] || { total: 0, newSeen: 0, rev: 0, correct: 0 };
  const queueFor = (cards) => {
    const d = todayStats();
    return SM2.buildQueue(cards, Date.now(), {
      config: cfg(),
      newLimit: db.settings.newPerDay,
      newDone: d.newSeen,
      reviewLimit: db.settings.reviewsPerDay,
      reviewDone: d.rev
    });
  };

  // ---------- Decks (nested) ----------
  const deckById = (id) => db.decks.find((d) => d.id === id);
  const childrenOf = (id) => db.decks.filter((d) => (d.parentId || null) === id);
  function descendantIds(id) {
    const out = [id];
    for (const c of childrenOf(id)) out.push(...descendantIds(c.id));
    return out;
  }
  function cardsOfDeck(id) {
    const set = new Set(descendantIds(id));
    return db.cards.filter((c) => set.has(c.deckId));
  }
  function deckPath(d) {
    const parts = [d.name];
    let p = d;
    while (p.parentId && (p = deckById(p.parentId))) parts.unshift(p.name);
    return parts.join(' › ');
  }
  function treeRows(parentId, depth, out) {
    for (const d of childrenOf(parentId)) {
      out.push({ deck: d, depth });
      treeRows(d.id, depth + 1, out);
    }
    return out;
  }
  const deckOptionEls = () => treeRows(null, 0, []).map(({ deck, depth }) => h('option', { value: deck.id }, '\u00A0\u00A0\u00A0'.repeat(depth) + (depth ? '↳ ' : '') + deck.name));

  function createDeck(name, parentId, extra) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    const pid = parentId || null;
    const existing = db.decks.find((d) => (d.parentId || null) === pid && d.name.toLowerCase() === clean.toLowerCase());
    if (existing) return existing;
    const deck = Object.assign({ id: uid(), name: clean, parentId: pid, created: Date.now() }, extra || {});
    db.decks.push(deck);
    persist();
    return deck;
  }
  function newCard(deckId, front, back, tags, order, extra) {
    return Object.assign({ id: uid(), deckId, front, back, tags: tags || [], created: Date.now() + (order || 0) }, extra || {}, SM2.scheduleFields(cfg()));
  }
  const parseTags = (s) =>
    String(s || '')
      .split(/[\s,،]+/)
      .map((t) => t.trim())
      .filter(Boolean);

  // ============================================================
  //  Theme and card font
  // ============================================================

  const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
  const FA_RANGE = 'U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200D';

  function applyCardFont() {
    let styleEl = document.getElementById('card-font-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'card-font-style';
      document.head.append(styleEl);
    }
    const root = document.documentElement;
    const s = db.settings;
    const known = { vazirmatn: 'Vazirmatn', tahoma: 'Tahoma', segoe: 'Segoe UI' };
    const name = s.cardFont === 'custom' ? String(s.cardFontCustom || '').replace(/["'\\<>{};]/g, '').trim() : known[s.cardFont];
    if (!name) {
      styleEl.textContent = '';
      root.style.setProperty('--card-font', 'var(--font)');
      return;
    }
    // only Persian and Arabic letters use this font; Latin letters keep the app's English font
    const locals = [name, name + ' Regular', name.replace(/ /g, '') + '-Regular'].map((n) => `local("${n}")`);
    let src = locals.join(', ');
    if (s.cardFont === 'vazirmatn') src += ", url('fonts/Vazirmatn.woff2') format('woff2')";
    styleEl.textContent = `@font-face{font-family:'CardFa';src:${src};unicode-range:${FA_RANGE};font-weight:100 900;}`;
    root.style.setProperty('--card-font', "'CardFa', var(--font)");
  }

  const NEURAL_VOICES = [
    ['Default · American female', 0],
    ['Bella · American female', 1],
    ['Nicole · American female', 2],
    ['Sarah · American female', 3],
    ['Sky · American female', 4],
    ['Adam · American male', 5],
    ['Michael · American male', 6],
    ['Emma · British female', 7],
    ['Isabella · British female', 8],
    ['George · British male', 9],
    ['Lewis · British male', 10]
  ];
  function applySpeech() {
    Speech.configure({ neural: db.settings.ttsEngine === 'neural', sid: db.settings.neuralVoice });
  }
  Speech.onMessage((kind, text) => toast(text, kind === 'error' ? 'error' : undefined));

  // status of the natural voice (is the package installed? is the model folder there?)
  async function refreshTts() {
    state.tts = Object.assign({}, state.tts, { loading: true });
    try {
      state.tts = Object.assign({ loading: false }, await api.ttsStatus());
    } catch (e) {
      state.tts = { loading: false, ok: false, error: String((e && e.message) || e) };
    }
    if (state.view === 'settings' && !modalStack.length) renderAll();
  }

  function applyTheme() {
    applySpeech();
    if (db.settings.look === 'graphite') {
      // early name of Frost in dark mode
      db.settings.look = 'frost';
      db.settings.theme = 'dark';
    }
    const r = Looks.resolve(db.settings, darkMQ.matches);
    const root = document.documentElement;
    root.dataset.theme = r.mode;
    root.dataset.look = r.look;
    root.style.setProperty('--accent', r.accent);
    root.style.setProperty('--accent-soft', r.accentSoft);
    root.style.setProperty('--on-accent', r.onAccent);
    if (r.font) root.style.setProperty('--font', r.font);
    else root.style.removeProperty('--font');
    root.style.setProperty('--card-scale', String(db.settings.cardScale || 1));
    applyCardFont();
    api.setTheme(r.mode, r.bg);
  }
  darkMQ.addEventListener('change', () => db.settings.theme === 'system' && applyTheme());

  // ============================================================
  //  Audio
  // ============================================================

  function cardSpeech(card, side) {
    const v = side === 'front' ? card.sf : card.sb;
    return v != null ? v : Speech.speakable(side === 'front' ? card.front : card.back);
  }
  function speakCard(card, side) {
    const t = cardSpeech(card, side);
    if (t) Speech.speak(t, { voiceURI: db.settings.voiceURI, rate: db.settings.ttsRate, lang: card.lang });
  }
  function autoSpeak(side) {
    const a = db.settings.autoplay;
    const s = state.session;
    if (!s || !s.current) return;
    if (side === 'front' && (a === 'front' || a === 'both')) speakCard(s.current, 'front');
    if (side === 'back' && a === 'both') speakCard(s.current, 'back');
  }
  function speakButton(card, side) {
    if (!Speech.available || !cardSpeech(card, side)) return null;
    return h('button', { class: 'speak', title: 'Listen (R)', onclick: (e) => { e.stopPropagation(); speakCard(card, side); } }, icon('speaker', 20));
  }

  // ============================================================
  //  Dialogs and menus
  // ============================================================

  const modalStack = [];
  function openModal({ title, content, actions = [], wide = false, onClose }) {
    const overlay = h('div', { class: 'overlay', onmousedown: (e) => e.target === overlay && close() });
    const modal = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' });
    const handle = { close };
    function close() {
      overlay.remove();
      const i = modalStack.indexOf(handle);
      if (i >= 0) modalStack.splice(i, 1);
      if (onClose) onClose();
    }
    modal.append(h('h2', null, title), content);
    if (actions.length) {
      modal.append(
        h(
          'div',
          { class: 'modal-actions' },
          actions.map((a) =>
            h(
              'button',
              {
                class: 'btn' + (a.kind ? ' ' + a.kind : '') + (a.end ? ' end' : ''),
                onclick: async () => {
                  const r = a.onClick ? await a.onClick(close) : undefined;
                  if (r !== false) close();
                }
              },
              a.label
            )
          )
        )
      );
    }
    overlay.append(modal);
    document.getElementById('modal-root').append(overlay);
    modalStack.push(handle);
    const first = modal.querySelector('input,textarea,select');
    if (first) setTimeout(() => first.focus(), 30);
    return handle;
  }

  function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
      let answered = false;
      openModal({
        title,
        content: h('p', { style: { margin: 0, lineHeight: 1.6 } }, message),
        actions: [
          { label: 'Cancel', kind: 'ghost', end: true },
          { label: confirmLabel, kind: danger ? 'danger' : 'primary', onClick: () => { answered = true; resolve(true); } }
        ],
        onClose: () => !answered && resolve(false)
      });
    });
  }

  /** Dialog to create a deck or section: a name and an optional parent deck */
  function deckDialog({ title, parentId = '', value = '', confirmLabel = 'Create', askParent = true }) {
    return new Promise((resolve) => {
      let answered = false;
      const input = h('input', { class: 'input', dir: 'auto', value, maxlength: '80', placeholder: 'e.g. Electronics' });
      const parentSel = h('select', { class: 'input' }, h('option', { value: '' }, 'None (top level)'), deckOptionEls());
      parentSel.value = parentId || '';
      const submit = (close) => {
        const v = input.value.trim();
        if (!v) {
          input.focus();
          return false;
        }
        answered = true;
        resolve({ name: v, parentId: askParent ? parentSel.value || null : null });
        if (close) close();
      };
      const handle = openModal({
        title,
        content: h('div', null, h('div', { class: 'field' }, h('label', null, 'Name'), input), askParent ? h('div', { class: 'field' }, h('label', null, 'Inside'), parentSel) : null),
        actions: [{ label: 'Cancel', kind: 'ghost', end: true }, { label: confirmLabel, kind: 'primary', onClick: submit }],
        onClose: () => !answered && resolve(null)
      });
      input.addEventListener('keydown', (e) => e.key === 'Enter' && submit(handle.close));
    });
  }

  let openMenuEl = null;
  function closeMenu() {
    if (openMenuEl) openMenuEl.remove();
    openMenuEl = null;
  }
  function openMenu(anchor, items) {
    closeMenu();
    const menu = h(
      'div',
      { class: 'menu' },
      items.map((it) => h('button', { class: it.danger ? 'danger' : '', onclick: () => { closeMenu(); it.onClick(); } }, icon(it.icon, 17), it.label))
    );
    document.body.append(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.top = Math.min(r.bottom + 6, window.innerHeight - menu.offsetHeight - 10) + 'px';
    menu.style.left = Math.max(10, Math.min(r.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 10)) + 'px';
    openMenuEl = menu;
    setTimeout(() => document.addEventListener('mousedown', outsideMenu, { once: true }), 0);
  }
  function outsideMenu(e) {
    if (openMenuEl && !openMenuEl.contains(e.target)) closeMenu();
  }

  // ============================================================
  //  Content
  // ============================================================

  // Puts a small speaker in front of every English line, so one example sentence can be played on its own.
  function addLineSpeakers(root, lang) {
    if (!Speech.available) return;
    for (const line of root.querySelectorAll(':scope > .ln')) {
      if (line.classList.contains('gap') || line.querySelector('.math, img')) continue;
      const clone = line.cloneNode(true);
      clone.querySelectorAll('.label').forEach((n) => n.remove());
      const text = Speech.speakable(clone.textContent.replace(/\s+/g, ' ').trim());
      if (!text || (text.match(/\p{Script=Latin}/gu) || []).length < 2) continue;
      const btn = h('button', { class: 'speak-line', type: 'button', title: 'Listen to this line', 'aria-label': 'Listen to this line' }, icon('speaker', 15));
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        Speech.speak(text, { voiceURI: db.settings.voiceURI, rate: db.settings.ttsRate, lang });
      });
      line.prepend(btn);
    }
  }
  // the small play buttons that [sound:file] turns into
  document.addEventListener(
    'click',
    (e) => {
      const b = e.target && e.target.closest ? e.target.closest('.sound-btn') : null;
      if (!b) return;
      e.stopPropagation();
      e.preventDefault();
      if (window.Speech && b.dataset.sound) Speech.playFile('media://f/' + encodeURIComponent(b.dataset.sound));
    },
    true
  );
  const rendered = (text, opts) => {
    const el = h('div', { class: 'rendered', html: renderContent(text, { katex: KATEX }) });
    if (opts && opts.lineAudio) addLineSpeakers(el, opts.lang);
    return el;
  };
  // a side is "long" on its own text only, so a short front stays big and centered even if the back is long
  const sideLong = (t) => plainText(t).length > 240 || String(t).split('\n').length > 7;
  function searchText(c) {
    let s = searchCache.get(c);
    if (s === undefined) {
      s = (plainText(c.front) + ' ' + plainText(c.back) + ' ' + c.tags.join(' ')).toLowerCase();
      searchCache.set(c, s);
    }
    return s;
  }

  // ============================================================
  //  Navigation
  // ============================================================

  const state = {
    view: 'library',
    session: null,
    browse: { q: '', deck: '', limit: 100 },
    addDeckId: null,
    addedToday: 0,
    lastEditor: null,
    info: null,
    packs: null,
    online: null,
    onlineLang: 'all',
    libraryOn: false,
    tts: null,
    anki: { stage: 'start', scanned: false, profiles: [], data: null, source: null, warnings: [], error: '', progress: '', selected: new Set(), optProgress: true, optHistory: true, optMedia: true, parentId: '', result: null },
    smart: { words: '', n: 3, persian: true, mode: 'api', deckId: '', items: [], busy: false, stop: false, status: '', error: '', paste: '', batch: 0 }
  };

  function setView(v) {
    state.view = v;
    state.lastEditor = null;
    closeMenu();
    renderAll();
    $main.scrollTop = 0;
  }

  function renderAll() {
    renderSidebar();
    $main.replaceChildren();
    const views = { library: viewLibrary, study: viewStudy, packs: viewPacks, add: viewAdd, smart: viewSmart, browse: viewBrowse, stats: viewStats, settings: viewSettings, anki: viewAnki, topics: viewTopics, online: viewOnline };
    $main.append((views[state.view] || viewLibrary)());
  }

  // Content packs are optional files in src/packs. Their pages only appear when such files exist.
  function hasPacks(topics) {
    return !!(state.packs && state.packs.some((p) => (p.kind === 'topic') === topics));
  }

  function renderSidebar() {
    const q = queueFor(db.cards).counts;
    const due = q.learn + q.review + q.fresh;
    const nav = (id, label, ic, badge) =>
      h(
        'button',
        { class: 'nav' + (state.view === id || (id === 'library' && state.view === 'study') ? ' active' : ''), onclick: () => setView(id) },
        icon(ic),
        label,
        badge ? h('span', { class: 'badge' }, num(badge)) : null
      );
    $side.replaceChildren(
      ...[
      h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }, icon('sparkle', 19)), 'Cardly'),
      nav('library', 'Library', 'decks', due),
      hasPacks(true) ? nav('topics', 'Word Topics', 'book') : null,
      state.libraryOn ? nav('online', 'Online Library', 'globe') : null,
      hasPacks(false) ? nav('packs', 'Starter Packs', 'pack') : null,
      nav('add', 'Add Cards', 'plus'),
      nav('smart', 'Smart Add', 'sparkle'),
      nav('anki', 'From Anki', 'download'),
      nav('browse', 'Browse', 'list'),
      nav('stats', 'Statistics', 'chart'),
      nav('settings', 'Settings', 'settings'),
      h('div', { class: 'spacer' }),
      h('button', { class: 'nav', onclick: startImport }, icon('download'), 'Import file'),
      h('div', { class: 'side-foot' }, h('span', { class: 'dot' }), 'Saved automatically on this PC')
      ].filter(Boolean)
    );
  }

  // ============================================================
  //  Library
  // ============================================================

  function chipsFor(counts) {
    const chip = (cls, n, label) => h('span', { class: `chip ${cls}` + (n ? '' : ' zero') }, `${num(n)} ${label}`);
    return h('div', { class: 'deck-chips' }, chip('new', counts.fresh, 'new'), chip('learn', counts.learn, 'learning'), chip('review', counts.review, 'review'));
  }

  function deckMenuItems(d) {
    return [
      { label: 'Rename', icon: 'edit', onClick: () => renameDeckDialog(d) },
      { label: 'Add section', icon: 'plus', onClick: () => newDeckDialog(d.id) },
      { label: 'Export as CSV', icon: 'upload', onClick: () => exportDeck(d) },
      { label: 'Delete', icon: 'trash', danger: true, onClick: () => deleteDeckDialog(d) }
    ];
  }

  function viewLibrary() {
    const page = h('div', { class: 'page' });
    if (!db.decks.length) {
      page.append(
        h(
          'div',
          { class: 'empty' },
          h('div', { class: 'stack' }, h('i'), h('i'), h('i')),
          h('h2', null, 'Welcome to Cardly'),
          h('p', null, hasPacks(false) ? 'Start with a ready-made vocabulary pack, build your own deck, or bring cards from Anki or a spreadsheet.' : 'Build your own deck, or bring cards from Anki or a spreadsheet.'),
          h(
            'div',
            { class: 'row-btns' },
            hasPacks(false) ? h('button', { class: 'btn primary lg', onclick: () => setView('packs') }, icon('pack'), 'Browse Starter Packs') : null,
            state.libraryOn ? h('button', { class: hasPacks(false) ? 'btn lg' : 'btn primary lg', onclick: () => setView('online') }, icon('globe'), 'Online Library') : null,
            h('button', { class: hasPacks(false) || state.libraryOn ? 'btn lg' : 'btn primary lg', onclick: () => newDeckDialog(null) }, icon('plus'), 'Create a deck'),
            h('button', { class: 'btn lg', onclick: startImport }, icon('download'), 'Import file')
          )
        )
      );
      return page;
    }

    const all = queueFor(db.cards).counts;
    const dueTotal = all.learn + all.review + all.fresh;
    page.append(
      h('div', { class: 'page-head' }, h('h1', null, 'Library'), h('div', { class: 'grow' }), h('button', { class: 'btn tint', onclick: () => newDeckDialog(null) }, icon('plus', 18), 'New Deck')),
      h(
        'div',
        { class: 'hero' },
        h('div', { class: 'grow' }, h('h2', null, dueTotal ? `${num(dueTotal)} cards ready today` : 'All caught up'), h('p', null, dueTotal ? `${num(all.fresh)} new · ${num(all.learn)} learning · ${num(all.review)} to review` : 'Come back tomorrow. Short, regular reviews beat long cramming.')),
        dueTotal ? h('button', { class: 'btn lg', onclick: () => startStudy(null) }, icon('play', 18), 'Study All') : null
      )
    );

    const list = h('div', { class: 'deck-list' });
    for (const d of childrenOf(null)) {
      const subs = treeRows(d.id, 0, []);
      const deckCards = cardsOfDeck(d.id);
      const counts = queueFor(deckCards).counts;
      const total = counts.learn + counts.review + counts.fresh;
      const more = h('button', { class: 'icon-btn', title: 'Options' }, icon('more'));
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        openMenu(more, deckMenuItems(d));
      });

      const rows = h('div', { class: 'rows' });
      for (const { deck: sd, depth } of subs) {
        const sc = queueFor(cardsOfDeck(sd.id)).counts;
        const st = sc.learn + sc.review + sc.fresh;
        const sMore = h('button', { class: 'icon-btn', title: 'Options' }, icon('more', 18));
        sMore.addEventListener('click', (e) => {
          e.stopPropagation();
          openMenu(sMore, deckMenuItems(sd));
        });
        rows.append(
          h(
            'div',
            { class: 'row', onclick: () => st && startStudy(sd.id), style: { paddingInlineStart: 16 + depth * 22 + 'px' } },
            h('span', { class: 'name', dir: 'auto' }, sd.name),
            h('span', { class: 'count' }, `${num(cardsOfDeck(sd.id).length)} cards`),
            chipsFor(sc),
            h('button', { class: 'btn sm tint', disabled: st ? null : true, onclick: (e) => { e.stopPropagation(); startStudy(sd.id); } }, 'Study'),
            sMore
          )
        );
      }
      rows.append(h('div', { class: 'row add', onclick: () => newDeckDialog(d.id) }, icon('plus', 16), h('span', { class: 'name' }, 'Add section')));

      list.append(
        h(
          'div',
          { class: 'deck-card glass' },
          h(
            'div',
            { class: 'deck-head' },
            h('div', { class: 'deck-tile', style: { background: tileColor(d.name) } }, icon(d.packId ? 'pack' : 'decks', 22)),
            h('div', { class: 'grow' }, h('div', { class: 'deck-title', dir: 'auto' }, d.name), h('div', { class: 'deck-sub' }, `${num(deckCards.length)} cards · ${num(subs.length)} section${subs.length === 1 ? '' : 's'}`)),
            chipsFor(counts),
            h('button', { class: 'btn primary', disabled: total ? null : true, onclick: () => startStudy(d.id) }, icon('play', 16), 'Study'),
            more
          ),
          rows
        )
      );
    }
    page.append(list);
    return page;
  }

  async function newDeckDialog(parentId) {
    const r = await deckDialog({ title: parentId ? 'New Section' : 'New Deck', parentId: parentId || '' });
    if (!r) return;
    const d = createDeck(r.name, r.parentId);
    state.addDeckId = d.id;
    renderAll();
    toast(r.parentId ? 'Section created' : 'Deck created');
  }
  async function renameDeckDialog(d) {
    const r = await deckDialog({ title: 'Rename', value: d.name, confirmLabel: 'Save', askParent: false });
    if (!r) return;
    d.name = r.name;
    persist();
    renderAll();
  }
  async function deleteDeckDialog(d) {
    const ids = new Set(descendantIds(d.id));
    const n = db.cards.filter((c) => ids.has(c.deckId)).length;
    const ok = await confirmDialog({
      title: 'Delete deck',
      message: `"${d.name}"${ids.size > 1 ? ` and its ${ids.size - 1} section(s)` : ''} will be deleted along with ${num(n)} card(s). This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;
    db.decks = db.decks.filter((x) => !ids.has(x.id));
    db.cards = db.cards.filter((c) => !ids.has(c.deckId));
    reindex();
    persist();
    renderAll();
    toast('Deck deleted');
  }

  // ============================================================
  //  Starter Packs
  // ============================================================

  function packInfo(pack) {
    const have = new Set();
    for (const c of db.cards) if (c.pk) have.add(c.pk);
    let total = 0;
    let missing = 0;
    for (const sub of pack.decks)
      for (const c of sub.cards) {
        total++;
        if (!have.has(pack.id + '|' + sub.name + '|' + c.front)) missing++;
      }
    return { total, missing };
  }

  /** how many cards of one section of a pack are already in the library */
  function subInfo(pack, sub) {
    const have = new Set();
    for (const c of db.cards) if (c.pk) have.add(c.pk);
    let missing = 0;
    for (const c of sub.cards) if (!have.has(pack.id + '|' + sub.name + '|' + c.front)) missing++;
    return { total: sub.cards.length, missing };
  }

  function installPack(pack, onlySub) {
    const root = db.decks.find((d) => d.packId === pack.id && !d.sub) || createDeck(pack.name, null, { packId: pack.id });
    const have = new Set();
    for (const c of db.cards) if (c.pk) have.add(c.pk);
    let added = 0;
    let order = 0;
    for (const sub of pack.decks) {
      if (onlySub && sub.name !== onlySub) continue;
      const deck = db.decks.find((d) => d.packId === pack.id && d.sub === sub.name) || createDeck(sub.name, root.id, { packId: pack.id, sub: sub.name });
      for (const c of sub.cards) {
        const pk = pack.id + '|' + sub.name + '|' + c.front;
        if (have.has(pk)) continue;
        db.cards.push(newCard(deck.id, c.front, c.back, c.tags, order++, { pk, sf: c.sf, sb: c.sb, lang: c.lang }));
        added++;
      }
    }
    reindex();
    persist();
    return added;
  }

  function viewPacks() {
    const page = h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('h1', null, 'Starter Packs'), h('span', { class: 'sub' }, 'Ready-made decks you can add with one click')));
    if (state.packs === null) {
      api
        .listPacks()
        .then((p) => {
          state.packs = p || [];
          if (state.view === 'packs') renderAll();
        })
        .catch(() => {
          state.packs = [];
          if (state.view === 'packs') renderAll();
        });
      page.append(h('p', { class: 'hint' }, 'Loading…'));
      return page;
    }
    if (!state.packs.length) {
      page.append(h('div', { class: 'empty' }, h('h2', null, 'No packs found'), h('p', null, 'Packs are files inside the src/packs folder.')));
      return page;
    }
    const grid = h('div', { class: 'pack-grid' });
    for (const pack of state.packs.filter((p) => p.kind !== 'topic')) {
      const info = packInfo(pack);
      const installed = info.missing === 0;
      const started = info.missing < info.total;
      grid.append(
        h(
          'div',
          { class: 'pack glass' },
          h('div', { class: 'pack-top' }, h('div', { class: 'deck-tile', style: { background: tileColor(pack.name) } }, icon('pack', 22)), h('div', { class: 'grow' }, h('h3', null, pack.name), h('div', { class: 'deck-sub' }, `${num(info.total)} cards · ${pack.decks.length} sections`))),
          h('p', null, pack.description),
          h('div', { class: 'pack-levels' }, pack.decks.map((s) => h('span', { class: 'chip' }, `${s.name.split(' ·')[0]} · ${s.cards.length}`))),
          h(
            'div',
            { style: { display: 'flex', gap: '10px', marginTop: '4px' } },
            installed
              ? h('button', { class: 'btn', onclick: () => setView('library') }, icon('check', 17), 'Added · Open Library')
              : h(
                  'button',
                  {
                    class: 'btn primary',
                    onclick: () => {
                      const n = installPack(pack);
                      toast(`${num(n)} cards added`);
                      renderAll();
                    }
                  },
                  icon('plus', 17),
                  started ? `Update (+${num(info.missing)})` : 'Add to My Decks'
                )
          )
        )
      );
    }
    page.append(grid);
    page.append(h('p', { class: 'hint', style: { marginTop: '18px' } }, 'Need a bigger list? Import your own CSV or Anki file from the Import button.'));
    return page;
  }

  // ============================================================
  //  Study
  // ============================================================

  function sessionPool() {
    const s = state.session;
    return s.ids ? db.cards.filter((c) => s.ids.has(c.deckId)) : db.cards;
  }

  function startStudy(deckId) {
    const ids = deckId ? new Set(descendantIds(deckId)) : null;
    const cards = ids ? db.cards.filter((c) => ids.has(c.deckId)) : db.cards;
    const q = queueFor(cards);
    if (q.counts.learn + q.counts.review + q.counts.fresh === 0) {
      toast('Nothing left to study today 🎉');
      return;
    }
    state.session = { deckId, ids, reviewIds: q.review.map((c) => c.id), newIds: q.fresh.map((c) => c.id), current: null, shown: false, undo: [], answered: 0, correct: 0, started: Date.now() };
    nextCard();
    setView('study');
    autoSpeak('front');
  }

  function nextCard() {
    const s = state.session;
    const now = Date.now();
    const learning = sessionPool()
      .filter((c) => c.state === 'learn' || c.state === 'relearn')
      .sort((a, b) => a.due - b.due);
    let pick = null;
    if (learning.length && learning[0].due <= now) pick = learning[0];
    while (!pick && s.reviewIds.length) {
      const c = byId.get(s.reviewIds.shift());
      if (c && c.state === 'review') pick = c;
    }
    while (!pick && s.newIds.length) {
      const c = byId.get(s.newIds.shift());
      if (c && c.state === 'new') pick = c;
    }
    if (!pick && learning.length && learning[0].due <= now + cfg().learnAheadMin * 60000) pick = learning[0];
    s.current = pick;
    s.shown = false;
  }

  function answerCurrent(rating) {
    const s = state.session;
    const card = s.current;
    if (!card || !s.shown) return;
    const now = Date.now();
    const before = Object.assign({}, card);
    const { card: updated, prevState } = SM2.answer(card, rating, now, cfg());
    Object.assign(card, updated);
    const key = SM2.dayKey(now, cfg().rolloverHour);
    const d = (db.daily[key] = db.daily[key] || { total: 0, newSeen: 0, rev: 0, correct: 0 });
    d.total++;
    if (prevState === 'new') d.newSeen++;
    if (prevState === 'review') d.rev++;
    if (rating > 1) d.correct++;
    const stateCode = { new: 0, learn: 1, review: 2, relearn: 3 }[prevState];
    db.revlog.push([now, card.id, rating, stateCode, card.state === 'review' ? card.interval : 0]);
    if (db.revlog.length > 60000) db.revlog.splice(0, db.revlog.length - 50000);
    s.undo.push({ id: card.id, before, key, prevState, rating });
    s.answered++;
    if (rating > 1) s.correct++;
    persist();
    nextCard();
    renderAll();
    autoSpeak('front');
  }

  function undoAnswer() {
    const s = state.session;
    if (!s || !s.undo.length) return;
    const u = s.undo.pop();
    const card = byId.get(u.id);
    if (!card) return;
    Object.assign(card, u.before);
    const d = db.daily[u.key];
    if (!('stab' in u.before)) {
      delete card.stab;
      delete card.diff;
    }
    if (d) {
      d.total = Math.max(0, d.total - 1);
      if (u.prevState === 'new') d.newSeen = Math.max(0, d.newSeen - 1);
      if (u.prevState === 'review') d.rev = Math.max(0, d.rev - 1);
      if (u.rating > 1) d.correct = Math.max(0, d.correct - 1);
    }
    db.revlog.pop();
    s.answered = Math.max(0, s.answered - 1);
    if (u.rating > 1) s.correct = Math.max(0, s.correct - 1);
    // the card that was on screen must not be lost: put it back at the front of its queue
    const displaced = s.current;
    if (displaced && displaced.id !== card.id) {
      if (displaced.state === 'new') s.newIds.unshift(displaced.id);
      else if (displaced.state === 'review') s.reviewIds.unshift(displaced.id);
    }
    s.current = card;
    s.shown = false;
    persist();
    renderAll();
    toast('Answer undone');
  }

  function revealAnswer() {
    const s = state.session;
    if (!s || !s.current || s.shown) return;
    s.shown = true;
    renderAll();
    autoSpeak('back');
  }

  function exitStudy() {
    Speech.stop();
    state.session = null;
    setView('library');
  }

  function viewStudy() {
    const s = state.session;
    if (!s) return viewLibrary();
    const c = s.current;
    const deckName = s.deckId ? (deckById(s.deckId) || {}).name : 'All decks';

    if (!c) {
      const secs = Math.max(1, Math.round((Date.now() - s.started) / 1000));
      const acc = s.answered ? Math.round((s.correct / s.answered) * 100) : 0;
      return h(
        'div',
        { class: 'study' },
        h(
          'div',
          { class: 'done' },
          h('div', { class: 'big' }, '🎉'),
          h('h2', null, 'Session complete'),
          h('p', { class: 'hint' }, 'Nicely done. The rest of your cards will come back at the right time.'),
          h(
            'div',
            { class: 'stat-row' },
            h('div', { class: 'tile' }, h('div', { class: 'v' }, num(s.answered)), h('div', { class: 'k' }, 'cards reviewed')),
            h('div', { class: 'tile' }, h('div', { class: 'v' }, num(acc) + '%'), h('div', { class: 'k' }, 'answered correctly')),
            h('div', { class: 'tile' }, h('div', { class: 'v' }, secs < 90 ? `${num(secs)} s` : `${num(Math.round(secs / 60))} min`), h('div', { class: 'k' }, 'time'))
          ),
          h('button', { class: 'btn primary lg', onclick: exitStudy }, 'Back to Library')
        )
      );
    }

    const learnCount = sessionPool().filter((x) => (x.state === 'learn' || x.state === 'relearn') && x.due <= Date.now() + cfg().learnAheadMin * 60000).length;
    const nCount = s.newIds.length + (c.state === 'new' ? 1 : 0);
    const rCount = s.reviewIds.length + (c.state === 'review' ? 1 : 0);
    const cur = c.state === 'new' ? 'n' : c.state === 'review' ? 'r' : 'l';
    const pct = Math.round((s.answered / Math.max(1, s.answered + nCount + rCount + learnCount)) * 100);

    const card = h('div', { class: 'flashcard' }, h('div', { class: 'face' + (sideLong(c.front) ? ' long' : '') }, rendered(c.front), speakButton(c, 'front')));
    if (s.shown) card.append(h('div', { class: 'divider' }), h('div', { class: 'face back-face' + (sideLong(c.back) ? ' long' : '') }, rendered(c.back, { lineAudio: true, lang: c.lang }), speakButton(c, 'back')));

    let actions;
    if (!s.shown) {
      actions = h('button', { class: 'btn primary lg', onclick: revealAnswer, style: { minWidth: '260px' } }, 'Show Answer', h('kbd', null, 'Space'));
    } else {
      const p = SM2.preview(c, Date.now(), cfg());
      const names = ['Again', 'Hard', 'Good', 'Easy'];
      const cls = ['again', 'hard', 'good', 'easy'];
      actions = h(
        'div',
        { class: 'rates' },
        p.map((x, i) => h('button', { class: 'rate ' + cls[i], onclick: () => answerCurrent(x.rating) }, h('small', null, fmtPreview(x)), h('b', null, names[i]), h('kbd', null, String(i + 1))))
      );
    }

    return h(
      'div',
      { class: 'study' },
      h(
        'div',
        { class: 'study-top' },
        h('button', { class: 'icon-btn', title: 'Back (Esc)', onclick: exitStudy }, icon('back')),
        h('div', { class: 'study-title', dir: 'auto' }, deckName),
        h('div', { class: 'counts' }, h('span', { class: 'n' + (cur === 'n' ? ' cur' : '') }, num(nCount)), h('span', { class: 'l' + (cur === 'l' ? ' cur' : '') }, num(learnCount)), h('span', { class: 'r' + (cur === 'r' ? ' cur' : '') }, num(rCount))),
        h('button', { class: 'icon-btn', title: 'Undo last answer (Ctrl+Z)', disabled: s.undo.length ? null : true, onclick: undoAnswer }, icon('undo')),
        h('button', { class: 'icon-btn', title: 'Edit card (E)', onclick: () => openCardEditor(c, () => renderAll()) }, icon('edit'))
      ),
      h('div', { class: 'progress' }, h('i', { style: { width: pct + '%' } })),
      card,
      h('div', { class: 'study-actions' }, actions)
    );
  }

  // ============================================================
  //  Card editor
  // ============================================================

  const FORMULA_CHIPS = [
    ['\\frac{a}{b}', 'Fraction'],
    ['\\sqrt{x}', 'Square root'],
    ['x^{2}', 'Power'],
    ['x_{i}', 'Subscript'],
    ['\\int_{a}^{b} f(x)\\,dx', 'Integral'],
    ['\\sum_{i=1}^{n} x_i', 'Sum'],
    ['\\Omega', 'Ohm'],
    ['\\mu', 'Micro'],
    ['\\Delta', 'Delta'],
    ['\\rightarrow', 'Arrow']
  ];

  function insertAt(ta, text) {
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  }
  function wrapSel(ta, left, right, placeholder) {
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const sel = ta.value.slice(s, e) || placeholder;
    ta.setRangeText(left + sel + right, s, e, 'end');
    ta.selectionStart = s + left.length;
    ta.selectionEnd = s + left.length + sel.length;
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  }
  async function addImageFile(ta, file) {
    const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const name = await api.saveMedia(bytes, ext);
      insertAt(ta, `\n![](${name})\n`);
    } catch (e) {
      toast(e.message || 'Could not add the image', 'error');
    }
  }

  function makeEditor(label, value, placeholder, onInput) {
    const ta = h('textarea', { class: 'input', placeholder, value: value || '' });
    ta.addEventListener('input', () => onInput && onInput());
    ta.addEventListener('focus', () => (state.lastEditor = ta));
    ta.addEventListener('paste', (e) => {
      const f = [...(e.clipboardData ? e.clipboardData.files : [])].find((x) => x.type.startsWith('image/'));
      if (f) {
        e.preventDefault();
        addImageFile(ta, f);
      }
    });
    const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    file.addEventListener('change', () => {
      if (file.files[0]) addImageFile(ta, file.files[0]);
      file.value = '';
    });
    const tb = (content, title, fn) => h('button', { class: 'tb', type: 'button', title, onclick: fn }, content);
    // In a right-to-left box the $ signs around a formula can look misplaced (display only; the saved text is correct).
    const dirBtn = h('button', { class: 'tb dir', type: 'button', title: 'Writing direction of this box. The preview is always correct.' });
    const applyDir = () => {
      const ltr = db.settings.editorDir === 'ltr';
      ta.setAttribute('dir', ltr ? 'ltr' : 'auto');
      dirBtn.textContent = ltr ? 'Direction: LTR' : 'Direction: Auto';
      dirBtn.classList.toggle('on', ltr);
    };
    dirBtn.addEventListener('click', () => {
      db.settings.editorDir = db.settings.editorDir === 'ltr' ? 'auto' : 'ltr';
      persist();
      document.querySelectorAll('textarea[data-editor]').forEach((t) => t.dispatchEvent(new Event('cardly-dir')));
    });
    ta.setAttribute('data-editor', '1');
    ta.addEventListener('cardly-dir', applyDir);
    applyDir();
    const toolbar = h(
      'div',
      { class: 'toolbar' },
      tb('B', 'Bold', () => wrapSel(ta, '**', '**', 'text')),
      tb(h('i', null, 'I'), 'Italic', () => wrapSel(ta, '*', '*', 'text')),
      tb('$ x $', 'Inline formula', () => wrapSel(ta, '$', '$', 'x^2')),
      tb('$$', 'Display formula', () => wrapSel(ta, '$$', '$$', 'E = mc^2')),
      tb(icon('image', 17), 'Add image (or paste with Ctrl+V)', () => file.click()),
      h('span', { class: 'grow' }),
      dirBtn,
      file
    );
    return { ta, wrap: h('div', { class: 'field' }, h('label', null, label), toolbar, ta) };
  }

  function formulaChips() {
    return h(
      'div',
      null,
      h('div', { class: 'hint' }, 'Formula shortcuts (inserted at the cursor):'),
      h(
        'div',
        { class: 'chips-row' },
        FORMULA_CHIPS.map(([tex, name]) => {
          let inner;
          try {
            inner = KATEX ? KATEX.renderToString(tex, { throwOnError: false }) : tex;
          } catch (e) {
            inner = tex;
          }
          return h('button', { class: 'tb', type: 'button', title: name, onclick: () => state.lastEditor && insertAt(state.lastEditor, `$${tex}$`) }, h('span', { class: 'math', html: inner }));
        })
      )
    );
  }

  // ---------- Add cards ----------

  function viewAdd() {
    const page = h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('h1', null, 'Add Cards')));
    if (!db.decks.length) {
      page.append(
        h(
          'div',
          { class: 'empty' },
          h('div', { class: 'stack' }, h('i'), h('i'), h('i')),
          h('h2', null, 'No decks yet'),
          h('p', null, 'Create a deck first, for example "Electronics" with a section "Electronics Words".'),
          h('div', { class: 'row-btns' }, h('button', { class: 'btn primary lg', onclick: () => newDeckDialog(null) }, icon('plus'), 'Create a deck'))
        )
      );
      return page;
    }
    if (!deckById(state.addDeckId)) state.addDeckId = db.decks[0].id;

    const deckSel = h('select', { class: 'input', style: { maxWidth: '380px' } }, deckOptionEls());
    deckSel.value = state.addDeckId;
    deckSel.addEventListener('change', () => (state.addDeckId = deckSel.value));
    const tags = h('input', { class: 'input', dir: 'auto', placeholder: 'Tags separated by spaces (optional)' });
    const reversed = h('input', { type: 'checkbox' });
    const pvFront = h('div');
    const pvBack = h('div');
    const updatePreview = () => {
      pvFront.replaceChildren(rendered(front.ta.value || '…'));
      pvBack.replaceChildren(rendered(back.ta.value || '…'));
    };
    const front = makeEditor('Front', '', 'Question or word', updatePreview);
    const back = makeEditor('Back', '', 'Answer or meaning', updatePreview);
    const counter = h('span', { class: 'hint' }, state.addedToday ? `${num(state.addedToday)} added this session` : '');

    const save = () => {
      const f = front.ta.value.trim();
      const b = back.ta.value.trim();
      if (!f || !b) {
        toast('Fill in both sides of the card', 'error');
        (f ? back.ta : front.ta).focus();
        return;
      }
      const t = parseTags(tags.value);
      db.cards.push(newCard(state.addDeckId, f, b, t, 0));
      if (reversed.checked) db.cards.push(newCard(state.addDeckId, b, f, t, 1));
      reindex();
      persist();
      state.addedToday++;
      front.ta.value = '';
      back.ta.value = '';
      updatePreview();
      front.ta.focus();
      counter.textContent = `${num(state.addedToday)} added this session`;
      renderSidebar();
      toast(reversed.checked ? 'Two cards saved' : 'Card saved');
    };

    page.append(
      h(
        'div',
        { class: 'panel glass' },
        h(
          'div',
          { class: 'field' },
          h('label', null, 'Deck'),
          h('div', { style: { display: 'flex', gap: '8px' } }, deckSel, h('button', { class: 'btn tint', type: 'button', onclick: async () => { await newDeckDialog(null); renderAll(); } }, icon('plus', 16), 'New'))
        ),
        h('div', { class: 'add-grid' }, front.wrap, back.wrap),
        formulaChips(),
        h('div', { class: 'field', style: { marginTop: '16px' } }, h('label', null, 'Tags'), tags),
        h(
          'div',
          { class: 'form-foot' },
          h('button', { class: 'btn primary lg', onclick: save }, 'Save Card', h('kbd', { style: { background: 'rgba(255,255,255,.25)', color: '#fff' } }, 'Ctrl+Enter')),
          h('label', { class: 'check' }, reversed, 'Also create the reverse card'),
          h('div', { class: 'grow' }),
          counter
        )
      ),
      h('div', { class: 'preview' }, h('div', { class: 'preview-label' }, 'Preview'), h('div', { class: 'flashcard' }, pvFront, h('div', { class: 'divider' }), pvBack))
    );
    page.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        save();
      }
    });
    updatePreview();
    setTimeout(() => front.ta.focus(), 40);
    return page;
  }

  // ---------- Edit one card ----------

  function openCardEditor(card, onDone) {
    const deckSel = h('select', { class: 'input' }, deckOptionEls());
    deckSel.value = card.deckId;
    const front = makeEditor('Front', card.front, '', null);
    const back = makeEditor('Back', card.back, '', null);
    const tags = h('input', { class: 'input', dir: 'auto', value: card.tags.join(' ') });
    const suspend = h('input', { type: 'checkbox', checked: card.suspended ? true : null });
    const status = card.state === 'new' ? 'New card' : card.state === 'review' ? `Interval ${fmtDays(card.interval)} · reviewed ${num(card.reps)}× · forgotten ${num(card.lapses)}×` : 'Learning';
    openModal({
      title: 'Edit Card',
      wide: true,
      content: h('div', null, h('div', { class: 'field' }, h('label', null, 'Deck'), deckSel), front.wrap, back.wrap, formulaChips(), h('div', { class: 'field', style: { marginTop: '14px' } }, h('label', null, 'Tags'), tags), h('label', { class: 'check', style: { marginTop: '10px' } }, suspend, 'Suspend this card (keep it, but do not show it in study)'), h('div', { class: 'hint' }, status)),
      actions: [
        {
          label: 'Delete',
          kind: 'danger',
          onClick: async () => {
            if (!(await confirmDialog({ title: 'Delete card', message: 'Delete this card permanently?', confirmLabel: 'Delete', danger: true }))) return false;
            db.cards = db.cards.filter((c) => c.id !== card.id);
            reindex();
            persist();
            if (state.session && state.session.current && state.session.current.id === card.id) nextCard();
            if (onDone) onDone();
          }
        },
        {
          label: 'Reset progress',
          kind: 'ghost',
          onClick: () => {
            Object.assign(card, SM2.scheduleFields(cfg()));
            delete card.stab;
            delete card.diff;
            persist();
            toast('Progress reset');
            if (onDone) onDone();
          }
        },
        { label: 'Cancel', kind: 'ghost', end: true },
        {
          label: 'Save',
          kind: 'primary',
          onClick: () => {
            if (!front.ta.value.trim() || !back.ta.value.trim()) {
              toast('Fill in both sides of the card', 'error');
              return false;
            }
            const nf = front.ta.value.trim();
            const nb = back.ta.value.trim();
            // if the text changed, the saved pronunciation text no longer matches
            if (nf !== card.front) delete card.sf;
            if (nb !== card.back) delete card.sb;
            card.front = nf;
            card.back = nb;
            card.deckId = deckSel.value;
            card.tags = parseTags(tags.value);
            if (suspend.checked) card.suspended = true;
            else delete card.suspended;
            searchCache.delete(card);
            persist();
            if (onDone) onDone();
          }
        }
      ]
    });
  }

  // ============================================================
  //  Smart Add: a list of words -> full cards written by an AI
  // ============================================================

  const SMART_BATCH = 8; // words per request when connected to an AI
  const PASTE_BATCH = 25; // words per prompt in copy-and-paste mode

  function smartDeckId() {
    const sm = state.smart;
    if (!deckById(sm.deckId)) sm.deckId = db.decks.length ? db.decks[0].id : '';
    return sm.deckId;
  }
  const smartOpts = () => ({ examples: state.smart.n, persian: state.smart.persian });
  const smartRefresh = () => state.view === 'smart' && renderAll();

  function addSmartItems(items) {
    const sm = state.smart;
    const have = new Set(sm.items.map((x) => x.word.toLowerCase()));
    let added = 0;
    for (const it of items) {
      if (have.has(it.word.toLowerCase())) continue;
      have.add(it.word.toLowerCase());
      sm.items.push(Object.assign({ on: true }, it));
      added++;
    }
    return added;
  }

  async function smartGenerate() {
    const sm = state.smart;
    const ai = aiCfg();
    const words = SmartAdd.parseWords(sm.words).filter((w) => !sm.items.some((x) => x.word.toLowerCase() === w.toLowerCase()));
    if (!words.length) {
      sm.error = sm.items.length ? 'Every word in the list is already below.' : 'Type or paste some words first.';
      return smartRefresh();
    }
    if (!aiReady(ai)) {
      sm.error = 'The AI connection is not set up yet. Open Settings › AI connection.';
      return smartRefresh();
    }
    sm.busy = true;
    sm.stop = false;
    sm.error = '';
    const batches = SmartAdd.chunk(words, SMART_BATCH);
    let missing = 0;
    for (let i = 0; i < batches.length && !sm.stop; i++) {
      sm.status = `Writing cards… batch ${i + 1} of ${batches.length}`;
      smartRefresh();
      const batch = batches[i];
      let parsed = null;
      for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
        const r = await api.aiChat({
          baseUrl: ai.baseUrl,
          apiKey: ai.apiKey,
          model: ai.model,
          messages: [
            { role: 'system', content: 'You are a precise dictionary writer. You reply with valid JSON only.' },
            { role: 'user', content: SmartAdd.buildPrompt(batch, smartOpts()) }
          ]
        });
        if (!r.ok) {
          sm.error = r.error;
          sm.stop = true;
          break;
        }
        const pr = SmartAdd.parseReply(r.text);
        if (!pr.error) parsed = pr;
        else if (attempt === 1) {
          sm.error = 'The AI did not return a readable list (' + pr.error + ') Try again, or use the copy-and-paste mode.';
          sm.stop = true;
        }
      }
      if (parsed) {
        addSmartItems(parsed.items);
        const got = new Set(parsed.items.map((x) => x.word.toLowerCase()));
        missing += batch.filter((w) => !got.has(w.toLowerCase())).length;
      }
    }
    sm.busy = false;
    sm.status = '';
    if (missing && !sm.error) sm.error = `${num(missing)} word(s) did not come back. Press Generate again to retry only those.`;
    smartRefresh();
  }

  function smartPasteBatches() {
    return SmartAdd.chunk(SmartAdd.parseWords(state.smart.words), PASTE_BATCH);
  }

  function smartReadReply() {
    const sm = state.smart;
    const r = SmartAdd.parseReply(sm.paste);
    if (r.error) {
      sm.error = r.error + ' Make sure you copied the whole reply, starting with [ and ending with ].';
      return smartRefresh();
    }
    const added = addSmartItems(r.items);
    sm.error = r.skipped ? `${num(r.skipped)} entr${r.skipped === 1 ? 'y was' : 'ies were'} skipped because they were incomplete.` : '';
    sm.paste = '';
    const total = smartPasteBatches().length;
    if (sm.batch < total - 1) sm.batch++;
    toast(`${num(added)} cards added below`);
    smartRefresh();
  }

  function saveSmart() {
    const sm = state.smart;
    const deckId = smartDeckId();
    const chosen = sm.items.filter((x) => x.on);
    if (!deckId) {
      toast('Create a deck first', 'error');
      return;
    }
    if (!chosen.length) {
      toast('Nothing selected', 'error');
      return;
    }
    const existing = new Set(db.cards.filter((c) => c.deckId === deckId).map((c) => SmartAdd.frontKey(c.front)));
    let added = 0;
    let order = 0;
    for (const it of chosen) {
      const c = SmartAdd.toCard(it, smartOpts());
      if (existing.has(SmartAdd.frontKey(c.front))) continue;
      db.cards.push(newCard(deckId, c.front, c.back, c.tags, order++, { sf: c.sf }));
      added++;
    }
    reindex();
    persist();
    sm.items = sm.items.filter((x) => !x.on);
    toast(`${num(added)} cards saved to "${(deckById(deckId) || {}).name}"`);
    renderAll();
  }

  function viewSmart() {
    const sm = state.smart;
    const ai = aiCfg();
    const page = h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('h1', null, 'Smart Add'), h('span', { class: 'sub' }, 'Paste a list of words and get complete cards')));

    const words = SmartAdd.parseWords(sm.words);
    const counter = h('span', { class: 'hint' }, `${num(words.length)} word${words.length === 1 ? '' : 's'}`);
    const ta = h('textarea', { class: 'input', placeholder: 'abandon\nability\ngive up\n…', value: sm.words, dir: 'ltr', style: { minHeight: '150px' } });
    ta.addEventListener('input', () => {
      sm.words = ta.value;
      const n = SmartAdd.parseWords(ta.value).length;
      counter.textContent = `${num(n)} word${n === 1 ? '' : 's'}`;
    });

    const deckSel = h('select', { class: 'input', style: { maxWidth: '320px' } }, deckOptionEls());
    deckSel.value = smartDeckId();
    deckSel.addEventListener('change', () => {
      sm.deckId = deckSel.value;
      smartRefresh();
    });
    const newDeckBtn = h('button', { class: 'btn tint', type: 'button', onclick: async () => { await newDeckDialog(null); sm.deckId = state.addDeckId; renderAll(); } }, icon('plus', 16), 'New');

    const seg = (options, current, onPick) =>
      h('div', { class: 'seg' }, options.map(([v, label]) => h('button', { class: current === v ? 'on' : '', type: 'button', onclick: () => onPick(v) }, label)));
    const persianBox = h('input', { type: 'checkbox', checked: sm.persian ? true : null });
    persianBox.addEventListener('change', () => (sm.persian = persianBox.checked));

    const optionsRow = h(
      'div',
      { style: { display: 'flex', gap: '22px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' } },
      h('div', { class: 'field', style: { margin: 0 } }, h('label', null, 'Examples per word'), seg([[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], sm.n, (v) => { sm.n = v; smartRefresh(); })),
      h('label', { class: 'check' }, persianBox, 'Include the Persian meaning'),
      h('div', { class: 'field', style: { margin: 0 } }, h('label', null, 'Save into'), h('div', { style: { display: 'flex', gap: '8px' } }, db.decks.length ? deckSel : h('span', { class: 'hint' }, 'No deck yet'), newDeckBtn))
    );

    // --- how the cards get written
    const modeSeg = seg([['api', 'AI connection'], ['paste', 'Copy & paste (no key)']], sm.mode, (v) => { sm.mode = v; sm.error = ''; smartRefresh(); });
    let engine;
    if (sm.mode === 'api') {
      const ready = aiReady(ai);
      engine = h(
        'div',
        null,
        ready
          ? h('div', { class: 'hint', style: { marginBottom: '12px' } }, `Using ${(AI_PRESETS[ai.preset] || AI_PRESETS.custom).label} · ${ai.model}`)
          : h('div', { class: 'warn-box', style: { marginBottom: '12px' } }, 'The AI connection is not set up yet. ', h('a', { href: '#', style: { color: 'var(--accent)', fontWeight: 600 }, onclick: (e) => { e.preventDefault(); setView('settings'); } }, 'Open Settings › AI connection')),
        h(
          'div',
          { style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } },
          sm.busy
            ? h('button', { class: 'btn', onclick: () => { sm.stop = true; sm.status = 'Stopping after this batch…'; smartRefresh(); } }, 'Stop')
            : h('button', { class: 'btn primary lg', onclick: smartGenerate }, icon('sparkle', 18), 'Generate cards'),
          sm.status ? h('span', { class: 'hint' }, sm.status) : null
        )
      );
    } else {
      const batches = smartPasteBatches();
      if (sm.batch >= batches.length) sm.batch = Math.max(0, batches.length - 1);
      const prompt = batches.length ? SmartAdd.buildPrompt(batches[sm.batch], smartOpts()) : '';
      const promptBox = h('textarea', { class: 'input', readonly: true, style: { minHeight: '110px', fontFamily: 'Consolas, monospace', fontSize: '0.82rem' }, value: prompt });
      const replyBox = h('textarea', { class: 'input', placeholder: 'Paste the AI\'s reply here (it starts with [ and ends with ])', style: { minHeight: '110px' }, value: sm.paste });
      replyBox.addEventListener('input', () => (sm.paste = replyBox.value));
      engine = h(
        'div',
        null,
        h('div', { class: 'hint', style: { marginBottom: '10px' } }, 'Works with any free chat, for example the DeepSeek website. No account key needed.'),
        batches.length > 1
          ? h(
              'div',
              { style: { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' } },
              h('button', { class: 'btn sm', disabled: sm.batch === 0 ? true : null, onclick: () => { sm.batch--; smartRefresh(); } }, 'Previous'),
              h('span', { class: 'hint' }, `Part ${sm.batch + 1} of ${batches.length} (${PASTE_BATCH} words each)`),
              h('button', { class: 'btn sm', disabled: sm.batch >= batches.length - 1 ? true : null, onclick: () => { sm.batch++; smartRefresh(); } }, 'Next')
            )
          : null,
        h('div', { class: 'field' }, h('label', null, '1. Copy this request into your AI chat'), promptBox,
          h('div', null, h('button', { class: 'btn tint', disabled: prompt ? null : true, onclick: async () => { try { await navigator.clipboard.writeText(prompt); toast('Request copied'); } catch (e) { promptBox.select(); toast('Press Ctrl+C to copy', 'error'); } } }, 'Copy request'))),
        h('div', { class: 'field' }, h('label', null, '2. Paste its reply'), replyBox,
          h('div', null, h('button', { class: 'btn primary', disabled: prompt ? null : true, onclick: smartReadReply }, 'Read reply')))
      );
    }

    page.append(
      h(
        'div',
        { class: 'panel glass' },
        h('div', { class: 'field' }, h('label', null, 'Words (one per line, or separated by commas)'), ta, counter),
        optionsRow,
        h('div', { class: 'field' }, h('label', null, 'Writer'), h('div', null, modeSeg)),
        engine,
        sm.error ? h('div', { class: sm.items.length && !/not set up|rejected|balance|reach|Not found/.test(sm.error) ? 'warn-box' : 'err-box', style: { marginTop: '14px' } }, sm.error) : null
      )
    );

    // --- results
    if (sm.items.length) {
      const deckId = smartDeckId();
      const existing = new Set(db.cards.filter((c) => c.deckId === deckId).map((c) => SmartAdd.frontKey(c.front)));
      const list = h('div', { class: 'gen-list' });
      for (const it of sm.items) {
        const c = SmartAdd.toCard(it, smartOpts());
        const dup = existing.has(SmartAdd.frontKey(c.front));
        const box = h('input', { type: 'checkbox', checked: it.on && !dup ? true : null, disabled: dup ? true : null });
        box.addEventListener('change', () => {
          it.on = box.checked;
          saveBtn.textContent = saveLabel();
        });
        if (dup) it.on = false;
        list.append(
          h(
            'div',
            { class: 'gen-card glass' + (dup ? ' dup' : '') },
            h('label', { class: 'gen-pick' }, box),
            h('div', { class: 'gen-body' }, h('div', { class: 'gen-front' }, rendered(c.front)), h('div', { class: 'gen-back' }, rendered(c.back, { lineAudio: true })), dup ? h('div', { class: 'hint' }, 'Already in this deck') : null),
            h('button', { class: 'icon-btn', title: 'Remove', onclick: () => { sm.items = sm.items.filter((x) => x !== it); smartRefresh(); } }, icon('trash', 18))
          )
        );
      }
      const saveLabel = () => `Save ${num(sm.items.filter((x) => x.on).length)} cards`;
      const saveBtn = h('button', { class: 'btn primary lg', onclick: saveSmart }, saveLabel());
      page.append(
        h(
          'div',
          { class: 'page-head', style: { marginTop: '26px', marginBottom: '12px' } },
          h('h1', { style: { fontSize: '1.4rem' } }, `${num(sm.items.length)} cards ready`),
          h('div', { class: 'grow' }),
          h('button', { class: 'btn', onclick: () => { const all = sm.items.some((x) => !x.on); sm.items.forEach((x) => (x.on = all)); smartRefresh(); } }, 'Select all / none'),
          h('button', { class: 'btn', onclick: () => { sm.items = []; sm.error = ''; smartRefresh(); } }, 'Clear'),
          saveBtn
        ),
        list,
        h('div', { class: 'hint', style: { marginTop: '10px' } }, 'You can change any card later from Browse.')
      );
    }
    return page;
  }


  // ============================================================
  //  Word Topics: English words by subject, ready to learn
  // ============================================================

  // Cards for topics (local or online): one card per topic, with an Add button for every section
  function topicGrid(topics) {
    const grid = h('div', { class: 'pack-grid' });
    for (const pack of topics) {
      const info = packInfo(pack);
      const done = info.total - info.missing;
      const rows = pack.decks.map((sub) => {
        const si = subInfo(pack, sub);
        const added = si.missing === 0;
        const started = si.missing < si.total;
        const deck = db.decks.find((d) => d.packId === pack.id && d.sub === sub.name);
        return h(
          'div',
          { class: 'topic-sub' },
          h('div', { class: 'grow' }, h('div', { class: 'nm' }, sub.name), h('div', { class: 'hint', style: { margin: 0 } }, `${num(si.total)} word${si.total === 1 ? '' : 's'}` + (started && !added ? ` · ${num(si.total - si.missing)} added` : ''))),
          added && deck
            ? h('button', { class: 'btn sm tint', onclick: () => startStudy(deck.id) }, icon('play', 14), 'Study')
            : h(
                'button',
                {
                  class: 'btn sm primary',
                  onclick: () => {
                    const n = installPack(pack, sub.name);
                    toast(`${num(n)} words added to ${pack.name} › ${sub.name}`);
                    renderAll();
                  }
                },
                icon('plus', 14),
                started ? `Add the rest (${num(si.missing)})` : 'Add'
              )
        );
      });
      grid.append(
        h(
          'div',
          { class: 'pack glass' },
          h('div', { class: 'pack-top' }, h('div', { class: 'deck-tile', style: { background: tileColor(pack.name) } }, icon('book', 22)), h('div', { class: 'grow' }, h('h3', null, pack.name), h('div', { class: 'deck-sub' }, `${num(info.total)} word${info.total === 1 ? '' : 's'} · ${pack.decks.length} section${pack.decks.length === 1 ? '' : 's'}` + (done ? ` · ${num(done)} added` : '')))),
          h('p', null, pack.description),
          h('div', { class: 'topic-subs' }, rows),
          info.missing
            ? h(
                'div',
                { style: { display: 'flex', gap: '10px', marginTop: '2px' } },
                h(
                  'button',
                  {
                    class: 'btn',
                    onclick: () => {
                      const n = installPack(pack);
                      toast(`${num(n)} words added`);
                      renderAll();
                    }
                  },
                  icon('plus', 17),
                  done ? `Add everything left (${num(info.missing)})` : `Add the whole topic (${num(info.total)})`
                )
              )
            : h('div', { class: 'hint', style: { margin: 0 } }, 'Everything in this topic is in your library.')
        )
      );
    }
    return grid;
  }

  function viewTopics() {
    const page = h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('h1', null, 'Word Topics'), h('span', { class: 'sub' }, 'Learn English words by subject')));
    if (state.packs === null) {
      api
        .listPacks()
        .then((p) => {
          state.packs = p || [];
          if (state.view === 'topics') renderAll();
        })
        .catch(() => {
          state.packs = [];
          if (state.view === 'topics') renderAll();
        });
      page.append(h('p', { class: 'hint' }, 'Loading…'));
      return page;
    }
    const topics = state.packs.filter((p) => p.kind === 'topic');
    if (!topics.length) {
      page.append(h('div', { class: 'empty' }, h('h2', null, 'No topics found'), h('p', null, 'Topics are files named topic-*.js inside the src/packs folder.')));
      return page;
    }
    page.append(h('p', { class: 'hint', style: { margin: '-6px 0 16px' } }, 'Pick a topic, then add one section at a time (for example Animals › Pets). Each card has the Persian meaning, a simple English meaning and three example sentences.'));

    page.append(topicGrid(topics));
    page.append(h('p', { class: 'hint', style: { marginTop: '18px' } }, 'Need words that are not here? Use Smart Add: type a list of words and it writes the same kind of card for you.'));
    return page;
  }

  // ============================================================
  //  Online Library: decks downloaded from the project's GitHub repository
  // ============================================================

  function loadOnline() {
    if (state.online && state.online.loading) return;
    state.online = { loading: true };
    api
      .libraryLoad()
      .then((r) => {
        state.online = r || { ok: false, error: 'No answer.' };
      })
      .catch((e) => {
        state.online = { ok: false, error: String((e && e.message) || e) };
      })
      .then(() => state.view === 'online' && renderAll());
  }

  function viewOnline() {
    const page = h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('h1', null, 'Online Library'), h('span', { class: 'sub' }, 'Ready-made decks from the Cardly repository')));
    const o = state.online;
    if (!o || o.loading) {
      if (!o) loadOnline();
      page.append(h('p', { class: 'hint' }, 'Loading…'));
      return page;
    }
    if (!o.ok) {
      page.append(h('div', { class: 'err-box' }, o.error || 'The library could not be loaded.'), h('div', { style: { marginTop: '14px' } }, h('button', { class: 'btn primary', onclick: () => { state.online = null; renderAll(); } }, 'Try again')));
      return page;
    }
    const languages = Array.from(new Set(o.packs.map((p) => p.language))).sort();
    if (state.onlineLang !== 'all' && !languages.includes(state.onlineLang)) state.onlineLang = 'all';
    const bar = h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', margin: '-6px 0 16px' } });
    const seg = (options, current, onPick) => h('div', { class: 'seg' }, options.map(([v, label]) => h('button', { class: current === v ? 'on' : '', type: 'button', onclick: () => onPick(v) }, label)));
    if (languages.length > 1) bar.append(seg([['all', 'All'], ...languages.map((l) => [l, l])], state.onlineLang, (v) => { state.onlineLang = v; renderAll(); }));
    bar.append(h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: () => { state.online = null; renderAll(); } }, icon('refresh', 14), 'Refresh'));
    page.append(bar);
    if (o.offline) page.append(h('div', { class: 'warn-box', style: { marginBottom: '14px' } }, 'You seem to be offline, or GitHub did not answer. This is the last copy that was downloaded.'));
    if (o.errors && o.errors.length) page.append(h('div', { class: 'warn-box', style: { marginBottom: '14px' } }, h('div', null, `${num(o.errors.length)} file${o.errors.length === 1 ? ' was' : 's were'} skipped:`), h('ul', { style: { margin: '6px 0 0 18px' } }, o.errors.slice(0, 8).map((e) => h('li', null, e)))));
    const shown = o.packs.filter((p) => state.onlineLang === 'all' || p.language === state.onlineLang);
    if (!shown.length) {
      page.append(h('div', { class: 'empty' }, h('h2', null, 'Nothing here yet'), h('p', null, 'The library has no decks yet. New ones appear here as soon as they are added to the repository.')));
      return page;
    }
    page.append(topicGrid(shown));
    page.append(h('p', { class: 'hint', style: { marginTop: '18px' } }, 'These decks are downloaded from the project page on GitHub when you open this page. Nothing from your own library is sent anywhere.'));
    return page;
  }

  // ============================================================
  //  Browse
  // ============================================================

  function dueLabel(c) {
    if (c.suspended) return 'Suspended';
    if (c.state === 'new') return 'New';
    if (c.state !== 'review') return 'Learning';
    const start = SM2.studyDayStart(Date.now(), cfg().rolloverHour);
    const d = Math.round((c.due - start) / DAY);
    if (d < 0) return 'Overdue';
    if (d === 0) return 'Today';
    if (d === 1) return 'Tomorrow';
    return `In ${num(d)} days`;
  }

  function viewBrowse() {
    const b = state.browse;
    const list = h('div');
    const info = h('span', { class: 'sub' });

    const draw = () => {
      const q = toLatin(b.q).trim().toLowerCase();
      const ids = b.deck ? new Set(descendantIds(b.deck)) : null;
      const found = db.cards.filter((c) => (!ids || ids.has(c.deckId)) && (!q || searchText(c).includes(q))).sort((x, y) => y.created - x.created);
      info.textContent = `${num(found.length)} cards`;
      const shown = found.slice(0, b.limit);
      const table = h('div', { class: 'table glass' }, h('div', { class: 'row-card head' }, h('div', null, 'Front'), h('div', null, 'Back'), h('div', null, 'Deck'), h('div', null, 'Due')));
      if (!shown.length) table.append(h('div', { class: 'empty', style: { padding: '40px' } }, 'No cards found'));
      for (const c of shown) {
        const deck = deckById(c.deckId);
        table.append(
          h(
            'div',
            { class: 'row-card', onclick: () => openCardEditor(c, () => renderAll()) },
            h('div', { class: 'cell', dir: 'auto' }, plainText(c.front).slice(0, 120)),
            h('div', { class: 'cell muted', dir: 'auto' }, plainText(c.back).slice(0, 120)),
            h('div', { class: 'cell muted' }, deck ? deck.name : '—'),
            h('div', { class: 'cell muted' }, dueLabel(c))
          )
        );
      }
      if (found.length > shown.length) table.append(h('div', { class: 'more' }, h('button', { class: 'btn', onclick: () => { b.limit += 200; draw(); } }, `Show more (${num(found.length - shown.length)} left)`)));
      list.replaceChildren(table);
    };

    const search = h('input', { class: 'input', placeholder: 'Search fronts, backs and tags…', value: b.q, dir: 'auto' });
    search.addEventListener('input', () => {
      b.q = search.value;
      b.limit = 100;
      draw();
    });
    const deckSel = h('select', { class: 'input' }, h('option', { value: '' }, 'All decks'), deckOptionEls());
    deckSel.value = b.deck;
    deckSel.addEventListener('change', () => {
      b.deck = deckSel.value;
      b.limit = 100;
      draw();
    });

    draw();
    return h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('h1', null, 'Browse'), info), h('div', { class: 'filters' }, h('div', { class: 'search' }, icon('search', 18), search), deckSel), list);
  }

  // ============================================================
  //  Statistics
  // ============================================================

  function barChart(values, labels, titleFn) {
    const max = Math.max(1, ...values);
    return h(
      'div',
      null,
      h('div', { class: 'bars' }, values.map((v, i) => h('div', { class: 'b' + (v ? '' : ' zero'), style: { height: Math.max(4, Math.round((v / max) * 100)) + '%' }, title: titleFn(v, i) }))),
      h('div', { class: 'axis' }, h('span', null, labels[0]), h('span', null, labels[labels.length - 1]))
    );
  }


  // GitHub-style activity map: one square per day, last 53 weeks
  function activityMap() {
    const now = Date.now();
    const rollover = cfg().rolloverHour;
    const WEEKS = 53;
    const today = SM2.studyDayStart(now, rollover);
    const todayDow = new Date(today).getDay(); // 0 = Sunday
    const first = SM2.addDays(today, -(todayDow + 7 * (WEEKS - 1)));
    const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'short' });
    const longFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

    const days = [];
    let max = 0;
    let total = 0;
    let active = 0;
    for (let i = 0; i < WEEKS * 7 - (6 - todayDow); i++) {
      const ts = SM2.addDays(first, i);
      const d = db.daily[SM2.dayKey(ts, rollover)];
      const n = d ? d.total : 0;
      days.push({ ts, n, week: Math.floor(i / 7), dow: i % 7 });
      if (n > max) max = n;
      total += n;
      if (n) active++;
    }
    // streaks
    let longest = 0;
    let run = 0;
    for (const d of days) {
      run = d.n ? run + 1 : 0;
      if (run > longest) longest = run;
    }

    const grid = h('div', { class: 'hm-grid' });
    // month labels
    const labels = [];
    let lastMonth = -1;
    for (const d of days) {
      if (d.dow !== 0) continue;
      const m = new Date(d.ts).getMonth();
      if (m !== lastMonth) {
        labels.push({ col: d.week, name: monthFmt.format(d.ts) });
        lastMonth = m;
      }
    }
    labels.forEach((l, i) => {
      const next = labels[i + 1];
      if (next && next.col - l.col < 3) return;
      grid.append(h('span', { class: 'hm-month', style: { gridColumn: String(l.col + 2), gridRow: '1' } }, l.name));
    });
    [['Mon', 1], ['Wed', 3], ['Fri', 5]].forEach(([name, dow]) => grid.append(h('span', { class: 'hm-day', style: { gridColumn: '1', gridRow: String(dow + 2) } }, name)));

    for (const d of days) {
      const lvl = d.n === 0 ? 0 : Math.max(1, Math.ceil((4 * d.n) / max));
      const label = d.n ? `${num(d.n)} review${d.n === 1 ? '' : 's'} on ${longFmt.format(d.ts)}` : `No reviews on ${longFmt.format(d.ts)}`;
      grid.append(h('div', { class: 'hm-cell l' + lvl + (d.ts === today ? ' today' : ''), title: label, style: { gridColumn: String(d.week + 2), gridRow: String(d.dow + 2) } }));
    }

    const legend = h('div', { class: 'hm-legend' }, 'Less', [0, 1, 2, 3, 4].map((l) => h('i', { class: 'hm-cell l' + l })), 'More');
    const scroller = h('div', { class: 'hm-scroll' }, grid);

    return h(
      'div',
      { class: 'panel glass hm' },
      h('div', { class: 'hm-head' }, h('h2', null, `${num(total)} reviews in the last year`), h('div', { class: 'hm-meta' }, `${num(active)} active days · longest streak ${num(longest)} day${longest === 1 ? '' : 's'}`)),
      scroller,
      legend
    );
  }

  function viewStats() {
    const now = Date.now();
    const rollover = cfg().rolloverHour;
    const t = todayStats();

    let streak = 0;
    for (let i = 0; i < 4000; i++) {
      const d = db.daily[SM2.dayKey(SM2.addDays(now, -i), rollover)];
      if (d && d.total > 0) streak++;
      else if (i === 0) continue;
      else break;
    }

    const last30 = [];
    const labels30 = [];
    for (let i = 29; i >= 0; i--) {
      const ts = SM2.addDays(now, -i);
      const d = db.daily[SM2.dayKey(ts, rollover)];
      last30.push(d ? d.total : 0);
      labels30.push(dateFmt.format(ts));
    }

    const start = SM2.studyDayStart(now, rollover);
    const forecast = new Array(14).fill(0);
    for (const c of db.cards) {
      if (c.state === 'review') {
        const off = Math.max(0, Math.round((c.due - start) / DAY));
        if (off < 14) forecast[off]++;
      } else if (c.state === 'learn' || c.state === 'relearn') forecast[0]++;
    }
    const labelsF = forecast.map((_, i) => dateFmt.format(SM2.addDays(now, i)));

    const cutoff = now - 30 * DAY;
    let tot = 0;
    let ok = 0;
    for (const r of db.revlog) {
      if (r[0] >= cutoff && r[3] === 2) {
        tot++;
        if (r[2] > 1) ok++;
      }
    }
    const retention = tot ? Math.round((ok / tot) * 100) : null;
    const mature = db.cards.filter((c) => c.state === 'review' && c.interval >= 21).length;
    const learned = db.cards.filter((c) => c.state !== 'new').length;
    const tile = (v, k) => h('div', { class: 'tile' }, h('div', { class: 'v' }, v), h('div', { class: 'k' }, k));

    return h(
      'div',
      { class: 'page' },
      h('div', { class: 'page-head' }, h('h1', null, 'Statistics')),
      h(
        'div',
        { class: 'tiles' },
        tile(num(t.total), 'Reviewed today'),
        tile(h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } }, num(streak), h('span', { style: { color: 'var(--orange)' } }, icon('flame', 24))), 'Day streak'),
        tile(num(db.cards.length), 'Total cards'),
        tile(num(learned), 'Started cards'),
        tile(num(mature), 'Mature cards'),
        tile(retention === null ? '—' : num(retention) + '%', 'Retention (30 days)')
      ),
      activityMap(),
      h(
        'div',
        { class: 'charts' },
        h('div', { class: 'panel glass chart' }, h('h2', null, 'Reviews, last 30 days'), barChart(last30, labels30, (v, i) => `${labels30[i]}: ${num(v)} reviews`)),
        h('div', { class: 'panel glass chart' }, h('h2', null, 'Due, next 14 days'), barChart(forecast, labelsF, (v, i) => `${labelsF[i]}: ${num(v)} cards`))
      )
    );
  }

  function showNeuralHelp() {
    const code = (t) => h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '6px 0 12px' } }, h('code', { style: { flex: 1, padding: '8px 10px', borderRadius: '10px', background: 'var(--fill)', wordBreak: 'break-all', userSelect: 'all' } }, t), h('button', { class: 'btn sm', onclick: async () => { try { await navigator.clipboard.writeText(t); toast('Copied'); } catch (e) { toast('Select the text and press Ctrl+C', 'error'); } } }, 'Copy'));
    openModal({
      title: 'Set up the natural voice',
      wide: true,
      content: h(
        'div',
        { style: { lineHeight: 1.6 } },
        h('p', { style: { marginTop: 0 } }, h('b', null, 'Step 1. '), 'Install the voice engine. Close Cardly, open PowerShell in the project folder, and run:'),
        code('npm.cmd install --save-exact sherpa-onnx-node@1.12.23 sherpa-onnx-win-x64@1.12.23'),
        h('div', { class: 'hint', style: { margin: '-6px 0 12px' } }, 'This exact version is needed. The newest engine (2.x) no longer works with this voice model. If you already installed a newer one, the same command replaces it.'),
        h('p', null, h('b', null, 'Step 2. '), 'Download the voice model (about 330 MB, it is only data). Open this address in your browser:'),
        code('https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-en-v0_19.tar.bz2'),
        h('p', null, h('b', null, 'Step 3. '), 'Extract the file. Windows 11 can open it, or use 7-Zip. You get a folder named kokoro-en-v0_19.'),
        h('p', null, h('b', null, 'Step 4. '), 'Press "Voices folder" in Settings and move the kokoro-en-v0_19 folder into it. Then start Cardly again and press "Check again".'),
        h('div', { class: 'hint' }, 'The first sentence takes a few seconds while the model loads. After that it is fast, and sentences you have already heard play instantly. If anything is missing, Cardly uses the Windows voice instead.')
      ),
      actions: [{ label: 'Close', kind: 'primary', end: true }]
    });
  }

  // ============================================================
  //  Settings
  // ============================================================

  function viewSettings() {
    const s = db.settings;
    const row = (title, sub, ...controls) => h('div', { class: 'setting-row' }, h('div', { class: 'info' }, h('b', null, title), sub ? h('span', null, sub) : null), ...controls);
    const group = (title, ...rows) => [h('div', { class: 'group-title' }, title), h('div', { class: 'group glass' }, rows)];
    const seg = (options, current, onPick) =>
      h(
        'div',
        { class: 'seg' },
        options.map(([v, label]) => h('button', { class: current === v ? 'on' : '', onclick: () => onPick(v) }, label))
      );

    const numInput = (key, min, max) => {
      const el = h('input', { class: 'input', inputmode: 'numeric', value: String(s[key]) });
      el.addEventListener('change', () => {
        const n = Math.round(Number(toLatin(el.value).replace(/[^\d.]/g, '')));
        s[key] = isFinite(n) ? Math.min(max, Math.max(min, n)) : DEFAULT_SETTINGS[key];
        el.value = String(s[key]);
        persist();
        renderSidebar();
      });
      return el;
    };
    const stepsInput = (key, hint) => {
      const el = h('input', { class: 'input', value: s[key], placeholder: hint, dir: 'ltr' });
      el.addEventListener('change', () => {
        s[key] = parseSteps(el.value).join(' ');
        el.value = s[key];
        persist();
      });
      return el;
    };

    const scale = h('input', { type: 'range', min: '0.8', max: '1.5', step: '0.1', value: String(s.cardScale || 1), style: { width: '170px', accentColor: 'var(--accent)' } });
    scale.addEventListener('input', () => {
      s.cardScale = Number(scale.value);
      document.documentElement.style.setProperty('--card-scale', String(s.cardScale));
    });
    scale.addEventListener('change', persist);

    const fontSel = h(
      'select',
      { class: 'input' },
      [
        ['default', 'Same as the app (English font)'],
        ['vazirmatn', 'Vazirmatn'],
        ['tahoma', 'Tahoma'],
        ['segoe', 'Segoe UI'],
        ['custom', 'Custom font name…']
      ].map(([v, label]) => h('option', { value: v }, label))
    );
    fontSel.value = s.cardFont;
    fontSel.addEventListener('change', () => {
      s.cardFont = fontSel.value;
      applyCardFont();
      persist();
      renderAll();
    });
    const customFont = h('input', { class: 'input', placeholder: 'Installed font name', value: s.cardFontCustom || '', style: { width: '240px', textAlign: 'start' } });
    customFont.addEventListener('change', () => {
      s.cardFontCustom = customFont.value;
      applyCardFont();
      persist();
    });

    const ai = () => (s.ai = Object.assign({}, DEFAULT_SETTINGS.ai, s.ai));
    const providerSel = h('select', { class: 'input' }, Object.entries(AI_PRESETS).map(([k, v]) => h('option', { value: k }, v.label)));
    providerSel.value = ai().preset in AI_PRESETS ? ai().preset : 'custom';
    const wide = { width: '300px', textAlign: 'start' };
    const baseInput = h('input', { class: 'input', value: ai().baseUrl, placeholder: 'https://api.example.com/v1', style: wide, dir: 'ltr', spellcheck: 'false' });
    const modelInput = h('input', { class: 'input', value: ai().model, placeholder: 'model name', style: wide, dir: 'ltr', spellcheck: 'false' });
    const keyInput = h('input', { class: 'input', type: 'password', value: ai().apiKey, placeholder: 'sk-…', style: wide, dir: 'ltr', spellcheck: 'false' });
    providerSel.addEventListener('change', () => {
      const p = AI_PRESETS[providerSel.value];
      ai().preset = providerSel.value;
      if (providerSel.value !== 'custom') {
        s.ai.baseUrl = p.baseUrl;
        s.ai.model = p.model;
        baseInput.value = p.baseUrl;
        modelInput.value = p.model;
      }
      persist();
    });
    baseInput.addEventListener('change', () => { ai().baseUrl = baseInput.value.trim(); persist(); });
    modelInput.addEventListener('change', () => { ai().model = modelInput.value.trim(); persist(); });
    keyInput.addEventListener('change', () => { ai().apiKey = keyInput.value.trim(); persist(); });
    const testAi = async () => {
      s.ai.baseUrl = baseInput.value.trim();
      s.ai.model = modelInput.value.trim();
      s.ai.apiKey = keyInput.value.trim();
      persist();
      toast('Testing…');
      const r = await api.aiChat({ baseUrl: s.ai.baseUrl, apiKey: s.ai.apiKey, model: s.ai.model, messages: [{ role: 'user', content: 'Reply with the single word: ok' }] });
      if (r.ok) toast('Connected. The AI answered: ' + String(r.text).trim().slice(0, 40));
      else toast(r.error, 'error');
    };

    const voices = Speech.englishVoices();
    const voiceSel = h('select', { class: 'input' }, h('option', { value: '' }, 'Automatic (best English voice)'), voices.map((v) => h('option', { value: v.voiceURI }, `${v.name} · ${v.lang}`)));
    voiceSel.value = s.voiceURI;
    voiceSel.addEventListener('change', () => {
      s.voiceURI = voiceSel.value;
      persist();
    });
    const neuralOn = s.ttsEngine === 'neural';
    if (neuralOn && !state.tts) refreshTts();
    const neuralSel = h('select', { class: 'input' }, NEURAL_VOICES.map(([name, id]) => h('option', { value: String(id) }, name)));
    neuralSel.value = String(s.neuralVoice);
    neuralSel.addEventListener('change', () => {
      s.neuralVoice = Number(neuralSel.value);
      applySpeech();
      persist();
      Speech.speak('Hello! This is how your flashcards will sound.', { rate: s.ttsRate });
    });
    const tts = state.tts || {};
    let neuralStatus;
    if (!neuralOn) neuralStatus = '';
    else if (!state.tts || tts.loading) neuralStatus = 'Checking…';
    else if (tts.problem) neuralStatus = 'The engine package is too new for this model. Open "How to set up" and follow Step 1 again.';
    else if (tts.ready) neuralStatus = 'Ready. The model was found.';
    else if (tts.packageOk === false) neuralStatus = 'Step 1 is missing: the voice engine package is not installed.';
    else if (tts.ok && !tts.modelDir) neuralStatus = 'Step 2 is missing: the voice model was not found in the voices folder.';
    else neuralStatus = tts.error || 'Not ready.';

    // look picker: small previews of each look, drawn with the look's own colors
    const curMode = Looks.resolve(s, darkMQ.matches).mode;
    const miniStyle = (k) => {
      const acc = Looks.resolve({ ...s, look: k }, darkMQ.matches).accent;
      const dark = curMode === 'dark';
      const sets = {
        glass: dark ? ['linear-gradient(135deg,#1b2447,#2a2450)', 'rgba(255,255,255,.09)', 'rgba(255,255,255,.12)'] : ['linear-gradient(135deg,#dbe6f8,#e6e2f2)', 'rgba(255,255,255,.7)', 'rgba(255,255,255,.85)'],
        frost: dark ? ['#111215', '#1a1c21', '#1a1c21'] : ['#eef1f6', '#ffffff', '#ffffff'],
        paper: dark ? ['#171512', '#211e1a', '#292520'] : ['#f4efe6', '#fbf8f2', '#fffdf8'],
        midnight: dark ? ['linear-gradient(160deg,#0a1020,#0f1830)', 'rgba(255,255,255,.08)', 'rgba(255,255,255,.1)'] : ['linear-gradient(160deg,#eaf0fc,#dfe8fa)', 'rgba(255,255,255,.75)', 'rgba(255,255,255,.9)']
      }[k];
      return { bg: sets[0], side: sets[1], card: sets[2], acc };
    };
    const lookCard = (k) => {
      const m = miniStyle(k);
      const def = Looks.LOOKS[k];
      return h(
        'button',
        { class: 'look-card' + (s.look === k ? ' on' : ''), type: 'button', 'aria-pressed': String(s.look === k), onclick: () => { s.look = k; applyTheme(); persist(); renderAll(); } },
        h(
          'div',
          { class: 'look-mini', style: { background: m.bg } },
          h('i', { style: { width: '16px', background: m.side } }),
          h('i', { style: { flex: '1', background: m.card, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '5px' } }, h('i', { style: { width: '60%', height: '7px', background: m.acc, borderRadius: '4px' } }))
        ),
        h('b', null, def.name),
        h('small', null, def.note)
      );
    };
    const lookPicker = h(
      'div',
      { class: 'setting-row', style: { flexDirection: 'column', alignItems: 'stretch', gap: '12px' } },
      h('div', { class: 'info' }, h('b', null, 'Look'), h('span', null, 'Pick the style of the whole app')),
      h('div', { class: 'look-grid' }, Object.keys(Looks.LOOKS).map(lookCard))
    );
    const swatch = (key) => {
      const hex = Looks.ACCENTS[key][curMode];
      return h('button', { class: 'swatch' + (s.accent === key ? ' on' : ''), type: 'button', title: Looks.ACCENTS[key].name, 'aria-label': Looks.ACCENTS[key].name, style: { background: hex }, onclick: () => { s.accent = key; applyTheme(); persist(); renderAll(); } });
    };
    const appFontSel = h(
      'select',
      { class: 'input', 'aria-label': 'App font' },
      [['', 'Look default'], ...Object.entries(Looks.FONTS).map(([k, f]) => [k, f.name])].map(([v, label]) => h('option', { value: v }, label))
    );
    appFontSel.value = s.appFont || '';
    appFontSel.addEventListener('change', () => {
      s.appFont = appFontSel.value;
      applyTheme();
      persist();
    });
    const accentPicker = h(
      'div',
      { class: 'swatches' },
      h('button', { class: 'swatch auto' + (!s.accent ? ' on' : ''), type: 'button', onclick: () => { s.accent = ''; applyTheme(); persist(); renderAll(); } }, 'Look default'),
      Object.keys(Looks.ACCENTS).map(swatch)
    );

    const rateLabel = h('span', { class: 'hint', style: { width: '44px', textAlign: 'end' } }, `${Number(s.ttsRate).toFixed(2)}×`);
    const rate = h('input', { type: 'range', min: '0.6', max: '1.2', step: '0.05', value: String(s.ttsRate), style: { width: '170px', accentColor: 'var(--accent)' } });
    rate.addEventListener('input', () => {
      s.ttsRate = Number(rate.value);
      rateLabel.textContent = `${s.ttsRate.toFixed(2)}×`;
    });
    rate.addEventListener('change', persist);

    return h(
      'div',
      { class: 'page' },
      h('div', { class: 'page-head' }, h('h1', null, 'Settings')),
      group(
        'Appearance',
        lookPicker,
        row('Mode', 'Light, dark, or follow Windows', seg([['light', 'Light'], ['dark', 'Dark'], ['system', 'Auto']], s.theme, (v) => { s.theme = v; applyTheme(); persist(); renderAll(); })),
        row('Accent color', 'The one color used for buttons, highlights and progress', accentPicker),
        row('App font', 'Changes the font of the whole app. The Persian font for cards is a separate setting below.', appFontSel),
        row('Card text size', 'Applies to flashcards only', scale),
        row('Persian font on cards', 'Only Persian and Arabic letters on flashcards use it. The rest of the app stays in the English font.', fontSel),
        s.cardFont === 'custom' ? row('Custom font', 'The exact name of a font installed on Windows', customFont) : null,
        s.cardFont === 'vazirmatn' ? row('Vazirmatn', 'Install the font on Windows, or put Vazirmatn.woff2 in renderer/fonts', h('span')) : null
      ),
      group(
        'Study',
        row('New cards per day', 'Across all decks', numInput('newPerDay', 0, 9999)),
        row('Reviews per day', 'Across all decks', numInput('reviewsPerDay', 0, 9999)),
        row('Learning steps (minutes)', 'For new cards, separated by spaces', stepsInput('learningSteps', '1 10')),
        row('Relearning steps (minutes)', 'After you forget a card', stepsInput('relearnSteps', '10')),
        row(
          'Scheduling method',
          s.scheduler === 'fsrs'
            ? 'New: each card gets its own intervals, based on how hard it is for you. Usually fewer reviews. You still just press the same four buttons.'
            : 'Classic: the same rule for every card, like Anki. Switch to New for intervals that fit each card.',
          seg([['classic', 'Classic'], ['fsrs', 'New (per card)']], s.scheduler, (v) => {
            s.scheduler = v;
            persist();
            toast(v === 'fsrs' ? 'New method on. Your cards keep their dates; the new intervals start from each next review.' : 'Classic method on.');
            renderAll();
          })
        ),
        s.scheduler === 'fsrs'
          ? h('details', { class: 'adv' }, h('summary', null, 'Advanced'), row('Target memory (%)', 'How likely you should remember a card when it comes back. 90 is right for almost everyone. Higher means more reviews.', numInput('desiredRetention', 70, 97)))
          : null
      ),
      group(
        'Audio',
        row('Auto-play', 'Reads English text aloud while you study', seg([['off', 'Off'], ['front', 'Front'], ['both', 'Front + Back']], s.autoplay, (v) => { s.autoplay = v; persist(); renderAll(); })),
        row('Voice engine', 'Natural voices sound much smoother but need a one-time setup', seg([['system', 'Windows voices'], ['neural', 'Natural (offline)']], s.ttsEngine, (v) => { s.ttsEngine = v; applySpeech(); persist(); if (v === 'neural') refreshTts(); renderAll(); })),
        neuralOn ? row('Natural voice', neuralStatus, neuralSel) : null,
        neuralOn
          ? row(
              'Set up the natural voice',
              'Needs two things: the engine package and the voice model',
              h('button', { class: 'btn', onclick: showNeuralHelp }, 'How to set up'),
              h('button', { class: 'btn', onclick: () => api.ttsOpenFolder() }, icon('folder', 17), 'Voices folder'),
              h('button', { class: 'btn tint', onclick: () => { toast('Checking…'); refreshTts(); } }, 'Check again')
            )
          : null,
        row('Windows voice', voices.length ? 'Used when the engine above is "Windows voices"' : 'No English voices found. Add one in Windows Settings › Time & language › Speech.', voiceSel),
        row('Speed', 'Slower is easier for learning pronunciation', rateLabel, rate),
        row('Test the voice', 'Plays a short sample', h('button', { class: 'btn tint', onclick: () => Speech.speak('Hello! This is how your flashcards will sound.', { voiceURI: s.voiceURI, rate: s.ttsRate }) }, icon('speaker', 17), 'Play'))
      ),
      group(
        'AI connection (for Smart Add)',
        row('Provider', 'Any service that follows the OpenAI format works', providerSel),
        row('Server address', null, baseInput),
        row('API key', 'Stored on this PC only, not in backups. Leave empty for a server on this computer.', keyInput),
        row('Model', 'If a name is rejected, check the provider site for the current one', modelInput),
        row('Test the connection', 'Sends one tiny request', h('button', { class: 'btn tint', onclick: testAi }, icon('sparkle', 17), 'Test'))
      ),
      group(
        'Data',
        row('Backup', 'Saves decks, cards and history to one file', h('button', { class: 'btn', onclick: exportBackup }, icon('upload', 17), 'Save backup'), h('button', { class: 'btn', onclick: restoreBackup }, icon('download', 17), 'Restore')),
        row('Data folder', null, h('div', { class: 'path' }, state.info ? state.info.dataPath : ''), h('button', { class: 'btn', onclick: () => api.openDataFolder() }, icon('folder', 17), 'Open'))
      ),
      h('div', { class: 'hint', style: { textAlign: 'center', marginTop: '22px' } }, `Cardly ${state.info ? state.info.version : ''}`)
    );
  }

  async function exportBackup() {
    await flush();
    const stamp = new Date().toISOString().slice(0, 10);
    const r = await api.exportText({ suggestedName: `cardly-backup-${stamp}.json`, text: JSON.stringify(Object.assign({}, db, { settings: Object.assign({}, db.settings, { ai: Object.assign({}, db.settings.ai, { apiKey: '' }) }) })), filterName: 'Cardly backup', ext: 'json' });
    if (r && r.ok) toast('Backup saved');
  }

  async function restoreBackup() {
    const r = await api.pickBackup();
    if (!r || r.canceled) return;
    let parsed;
    try {
      parsed = JSON.parse(r.text);
      if (!parsed || !Array.isArray(parsed.decks) || !Array.isArray(parsed.cards)) throw new Error('bad');
    } catch (e) {
      toast('This is not a valid Cardly backup', 'error');
      return;
    }
    const ok = await confirmDialog({
      title: 'Restore backup',
      message: `Everything currently in the app will be replaced by this file (${num(parsed.decks.length)} decks, ${num(parsed.cards.length)} cards). Continue?`,
      confirmLabel: 'Replace',
      danger: true
    });
    if (!ok) return;
    const keepKey = aiCfg().apiKey;
    db = normalize(parsed);
    db.settings.ai = Object.assign({}, DEFAULT_SETTINGS.ai, db.settings.ai, { apiKey: keepKey });
    reindex();
    applyTheme();
    await flush();
    state.session = null;
    renderAll();
    toast('Backup restored');
  }

  // ============================================================
  //  Import and export
  // ============================================================

  async function startImport() {
    const res = await api.pickImport();
    if (!res || res.canceled) return;
    if (!res.ok) {
      openModal({ title: "Couldn't import", content: h('div', { class: 'err-box' }, res.error), actions: [{ label: 'Close', kind: 'primary', end: true }] });
      return;
    }
    const total = res.decks.reduce((x, d) => x + d.cards.length, 0);
    const isText = res.kind === 'text';

    const newName = h('input', { class: 'input', dir: 'auto', value: res.decks[0].name });
    const parentSel = h('select', { class: 'input' }, h('option', { value: '' }, 'None (top level)'), deckOptionEls());
    const existing = h('select', { class: 'input' }, deckOptionEls());
    const modeNew = h('input', { type: 'radio', name: 'mode', checked: true });
    const modeExisting = h('input', { type: 'radio', name: 'mode', disabled: db.decks.length ? null : true });
    const skipDup = h('input', { type: 'checkbox', checked: true });

    const content = h(
      'div',
      null,
      h('p', { style: { marginTop: 0 } }, `${num(total)} cards found. ${res.detail || ''}`),
      isText
        ? h(
            'div',
            { class: 'field' },
            h('label', { class: 'check' }, modeNew, 'New deck'),
            newName,
            h('label', { style: { marginTop: '8px' } }, 'Place it inside'),
            parentSel,
            h('label', { class: 'check', style: { marginTop: '12px' } }, modeExisting, 'Add to an existing deck or section'),
            existing
          )
        : h(
            'div',
            null,
            h('ul', { class: 'list-plain' }, res.decks.map((d) => h('li', null, h('span', { dir: 'auto', style: { flex: 1 } }, d.name), h('span', { class: 'badge' }, num(d.cards.length))))),
            h('div', { class: 'field' }, h('label', null, 'Place them inside'), parentSel)
          ),
      h('label', { class: 'check', style: { marginBottom: '8px' } }, skipDup, 'Skip duplicate cards'),
      (res.warnings || []).map((w) => h('div', { class: 'warn-box' }, w))
    );

    openModal({
      title: 'Import Cards',
      content,
      actions: [
        { label: 'Cancel', kind: 'ghost', end: true },
        {
          label: `Import ${num(total)} cards`,
          kind: 'primary',
          onClick: () => {
            const parentId = parentSel.value || null;
            let target = null;
            if (isText) target = modeExisting.checked ? deckById(existing.value) : createDeck(newName.value || res.decks[0].name, parentId);
            const r = doImport(res, target, parentId, skipDup.checked);
            toast(`${num(r.added)} cards imported` + (r.skipped ? ` · ${num(r.skipped)} duplicates skipped` : ''));
            state.view = 'library';
            renderAll();
          }
        }
      ]
    });
  }

  function doImport(res, forcedDeck, parentId, skipDuplicates) {
    const seen = new Set(db.cards.map((c) => c.deckId + '\u0001' + c.front + '\u0001' + c.back));
    let added = 0;
    let skipped = 0;
    let order = 0;
    for (const src of res.decks) {
      const deck = forcedDeck || createDeck(src.name, parentId);
      if (!deck) continue;
      for (const c of src.cards) {
        const key = deck.id + '\u0001' + c.front + '\u0001' + c.back;
        if (skipDuplicates && seen.has(key)) {
          skipped++;
          continue;
        }
        seen.add(key);
        db.cards.push(newCard(deck.id, c.front, c.back, c.tags, order++));
        added++;
      }
    }
    reindex();
    persist();
    return { added, skipped };
  }

  const csvQuote = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  async function exportDeck(d) {
    const rows = [['Front', 'Back', 'Tags'].map(csvQuote).join(',')];
    for (const c of cardsOfDeck(d.id)) rows.push([c.front, c.back, c.tags.join(' ')].map(csvQuote).join(','));
    const safe = d.name.replace(/[\\/:*?"<>|]+/g, '_');
    const r = await api.exportText({ suggestedName: safe + '.csv', text: rows.join('\r\n'), filterName: 'CSV table', ext: 'csv' });
    if (r && r.ok) toast('File saved');
  }

  // ============================================================
  //  From Anki: bring everything over from the Anki on this PC
  // ============================================================

  const ankiKey = (parts) => parts.join('\u0001');

  function ankiState() {
    return state.anki;
  }

  /** the deck tree shown in the summary: one node per path, with counts that include sub-decks */
  function ankiTree(decks) {
    const root = { name: '', path: [], kids: new Map(), own: 0, total: 0, idx: -1 };
    decks.forEach((d, i) => {
      let node = root;
      d.path.forEach((part, depth) => {
        if (!node.kids.has(part)) node.kids.set(part, { name: part, path: d.path.slice(0, depth + 1), kids: new Map(), own: 0, total: 0, idx: -1 });
        node = node.kids.get(part);
      });
      node.idx = i;
      node.own = d.cards.length;
    });
    const sum = (n) => {
      n.total = n.own + [...n.kids.values()].reduce((x, k) => x + sum(k), 0);
      return n.total;
    };
    sum(root);
    return root;
  }
  const treeIdx = (n) => [n.idx >= 0 ? [n.idx] : [], ...[...n.kids.values()].map(treeIdx)].flat();

  function ankiResetAfterRead() {
    const a = ankiState();
    a.selected = new Set(a.data.decks.map((_, i) => i));
    a.optProgress = true;
    a.optHistory = true;
    a.optMedia = true;
    a.parentId = '';
  }

  async function ankiScan() {
    const a = ankiState();
    a.stage = 'scanning';
    a.error = '';
    renderAll();
    try {
      a.profiles = (await api.ankiScan()) || [];
    } catch (e) {
      a.profiles = [];
      a.error = 'Could not look for Anki: ' + (e.message || e);
    }
    a.stage = 'start';
    a.scanned = true;
    if (state.view === 'anki') renderAll();
  }

  async function ankiLoad(promise, source) {
    const a = ankiState();
    a.stage = 'reading';
    a.error = '';
    a.progress = 'Starting…';
    renderAll();
    const opts = { rolloverHour: cfg().rolloverHour, learningSteps: Math.max(1, cfg().learningSteps.length) };
    let res;
    try {
      res = await promise(opts);
    } catch (e) {
      res = { ok: false, error: String((e && e.message) || e) };
    }
    if (res && res.canceled) {
      a.stage = 'start';
      if (state.view === 'anki') renderAll();
      return;
    }
    if (!res || !res.ok) {
      a.stage = 'start';
      a.error = (res && res.error) || 'Could not read the Anki data.';
      if (state.view === 'anki') renderAll();
      return;
    }
    const r = res.result;
    a.data = r.anki;
    a.warnings = r.warnings || [];
    a.source = source(r);
    ankiResetAfterRead();
    a.stage = 'summary';
    if (state.view === 'anki') renderAll();
  }

  const ankiReadProfile = (p) => ankiLoad((opts) => api.ankiRead(Object.assign({ file: p.file }, opts)), () => ({ kind: 'live', file: p.file, name: p.name }));
  const ankiReadFile = (file, name) => ankiLoad((opts) => api.ankiRead(Object.assign({ file }, opts)), () => ({ kind: 'live', file, name }));
  const ankiReadPackage = () => ankiLoad((opts) => api.ankiReadPackage(opts), () => ({ kind: 'package', name: 'export file' }));

  async function ankiPickManually() {
    const r = await api.ankiPickCollection();
    if (!r || r.canceled || !r.ok) return;
    ankiReadFile(r.file, r.name);
  }

  const ankiDate = (ts) => (ts ? new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
  const ankiSize = (b) => (b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? Math.round(b / 1e6) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB');

  function ankiMediaNames(text) {
    const out = [];
    String(text || '').replace(/!\[[^\]\n]*\]\(([^)\n]+)\)|\[sound:([^\]\n]+)\]/g, (m, a, b) => out.push((a || b).trim()));
    return out;
  }
  const ankiStripMedia = (text) =>
    String(text || '')
      .replace(/\n?!\[[^\]\n]*\]\([^)\n]+\)\n?/g, '\n')
      .replace(/ ?\[sound:[^\]\n]+\] ?/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  /** puts the chosen part of the read Anki data into Cardly. Safe to run again: cards are matched by their Anki id. */
  function applyAnkiImport(data, o) {
    const out = { added: 0, updated: 0, linked: 0, skipped: 0, decks: 0, days: 0, reviews: 0, suspended: 0 };
    const decksBefore = db.decks.length;
    const parentId = o.parentId || null;
    const byAk = new Map();
    const byText = new Map();
    for (const c of db.cards) {
      if (c.ak) byAk.set(c.ak, c);
      else byText.set(c.deckId + '\u0001' + c.front + '\u0001' + c.back, c);
    }
    const ensurePath = (parts) => {
      let pid = parentId;
      let deck = null;
      for (const p of parts) {
        deck = createDeck(p, pid);
        if (!deck) return null;
        pid = deck.id;
      }
      return deck;
    };
    const schedKeys = ['state', 'step', 'due', 'interval', 'ease', 'reps', 'lapses', 'last'];
    const minEase = cfg().minEase || 1.3;
    const akToId = new Map();
    const cardOfAk = new Map();

    data.decks.forEach((src, di) => {
      if (!o.selected.has(di)) return;
      const deck = ensurePath(src.path);
      if (!deck) return;
      for (const c of src.cards) {
        let front = c.front;
        let back = c.back;
        if (!o.media) {
          front = ankiStripMedia(front);
          back = ankiStripMedia(back);
          if (!front && !back) continue;
        }
        let card = byAk.get(c.ak);
        if (!card) {
          const twin = byText.get(deck.id + '\u0001' + front + '\u0001' + back);
          if (twin) {
            card = twin;
            card.ak = c.ak;
            byText.delete(deck.id + '\u0001' + front + '\u0001' + back);
            byAk.set(c.ak, card);
            out.linked++;
          }
        } else if (!(o.progress && c.sched && (c.sched.last || 0) > (card.last || 0))) {
          out.skipped++;
        }
        if (card) {
          // already in Cardly: take the scheduling from Anki only when Anki's copy was reviewed more recently
          if (o.progress && c.sched && (c.sched.last || 0) > (card.last || 0)) {
            for (const k of schedKeys) card[k] = c.sched[k];
            card.ease = Math.max(minEase, card.ease);
            out.updated++;
          }
          if (c.suspended && !card.suspended) card.suspended = true;
        } else {
          card = Object.assign({ id: uid(), deckId: deck.id, front, back, tags: c.tags || [], created: c.created, ak: c.ak }, SM2.scheduleFields(cfg()));
          if (o.progress && c.sched) {
            for (const k of schedKeys) card[k] = c.sched[k];
            card.ease = Math.max(minEase, card.ease);
          }
          if (c.suspended) card.suspended = true;
          db.cards.push(card);
          byAk.set(c.ak, card);
          out.added++;
        }
        if (card.suspended) out.suspended++;
        akToId.set(c.ak, card.id);
        cardOfAk.set(c.ak, card);
      }
    });
    out.decks = db.decks.length - decksBefore;

    if (o.history && data.history) {
      const allSelected = data.decks.every((_, i) => o.selected.has(i));
      const contrib = {};
      for (const [day, perDeck] of Object.entries(data.history.days)) {
        for (const [di, v] of Object.entries(perDeck)) {
          const idx = Number(di);
          if (idx === -1 ? !allSelected : !o.selected.has(idx)) continue;
          const c = contrib[day] || (contrib[day] = [0, 0, 0, 0]);
          for (let i = 0; i < 4; i++) c[i] += v[i];
        }
      }
      // what an earlier Anki import added is taken out first, so reading again never counts a day twice
      const old = db.ankiDaily || {};
      const keys = new Set([...Object.keys(old), ...Object.keys(contrib)]);
      for (const day of keys) {
        const ov = old[day] || [0, 0, 0, 0];
        const nv = contrib[day] || [0, 0, 0, 0];
        const d = db.daily[day] || { total: 0, newSeen: 0, rev: 0, correct: 0 };
        d.total = Math.max(0, d.total - ov[0] + nv[0]);
        d.newSeen = Math.max(0, d.newSeen - ov[1] + nv[1]);
        d.rev = Math.max(0, d.rev - ov[2] + nv[2]);
        d.correct = Math.max(0, d.correct - ov[3] + nv[3]);
        if (d.total === 0 && d.newSeen === 0 && d.rev === 0) delete db.daily[day];
        else db.daily[day] = d;
        if (nv[0]) {
          out.days++;
          out.reviews += nv[0];
        }
      }
      db.ankiDaily = contrib;
      // the last weeks one by one (used for the 30-day retention number)
      const cutoff = Date.now() - 45 * 86400000;
      db.revlog = db.revlog.filter((r) => r[5] !== 1);
      for (const r of data.history.recent) {
        if (r[0] < cutoff) continue;
        const id = akToId.get(r[1]);
        if (id) db.revlog.push([r[0], id, r[2], r[3], r[4], 1]);
      }
      db.revlog.sort((x, y) => x[0] - y[0]);
      if (db.revlog.length > 60000) db.revlog.splice(0, db.revlog.length - 50000);
    }
    reindex();
    persist();
    return out;
  }

  async function ankiRun() {
    const a = ankiState();
    const data = a.data;
    a.stage = 'importing';
    a.progress = 'Adding cards…';
    renderAll();
    await new Promise((r) => setTimeout(r, 30));
    let result;
    try {
      result = applyAnkiImport(data, { selected: a.selected, progress: a.optProgress, history: a.optHistory, media: a.optMedia, parentId: a.parentId || null });
    } catch (e) {
      a.stage = 'summary';
      a.error = 'Import failed: ' + (e.message || e);
      renderAll();
      return;
    }
    // files from the Anki media folder (an export file already brought its files when it was opened)
    if (a.optMedia && a.source.kind === 'live') {
      const used = new Set();
      data.decks.forEach((d, i) => {
        if (!a.selected.has(i)) return;
        for (const c of d.cards) for (const n of ankiMediaNames(c.front + '\n' + c.back)) used.add(n);
      });
      const list = data.media.filter((m) => used.has(m.saved));
      if (list.length) {
        a.progress = `Copying ${num(list.length)} image and audio files…`;
        renderAll();
        try {
          const r = await api.ankiCopyMedia({ file: a.source.file, list });
          result.media = r && r.ok ? r.result : { copied: 0, missing: list.length, error: r && r.error };
        } catch (e) {
          result.media = { copied: 0, missing: list.length, error: String((e && e.message) || e) };
        }
      }
    }
    await flush();
    a.result = result;
    a.stage = 'done';
    renderAll();
  }

  function viewAnki() {
    const a = ankiState();
    api.onAnkiProgress((t) => {
      a.progress = t;
      const el = document.getElementById('anki-progress');
      if (el) el.textContent = t;
    });
    const page = h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('h1', null, 'From Anki'), h('span', { class: 'sub' }, 'Move everything to Cardly')));
    const put = (...els) => page.append(...els.flat(Infinity).filter(Boolean));
    const spinner = (text) =>
      h('div', { class: 'panel glass', style: { textAlign: 'center', padding: '40px 20px' } }, h('div', { class: 'spin' }), h('p', { id: 'anki-progress', style: { margin: '14px 0 0' } }, text));

    if (a.stage === 'scanning' || (a.stage === 'start' && !a.scanned)) {
      if (a.stage === 'start') setTimeout(ankiScan, 0);
      put(spinner('Looking for Anki on this computer…'));
      return page;
    }
    if (a.stage === 'reading') {
      put(spinner(a.progress || 'Reading…'));
      put(h('p', { class: 'hint', style: { textAlign: 'center' } }, 'A big collection can take a minute. Your Anki files are only read, never changed.'));
      return page;
    }
    if (a.stage === 'importing') {
      put(spinner(a.progress || 'Importing…'));
      return page;
    }

    if (a.stage === 'done') {
      const r = a.result;
      const tile = (v, k) => h('div', { class: 'tile' }, h('div', { class: 'v' }, num(v)), h('div', { class: 'k' }, k));
      put(
        h('div', { class: 'panel glass' }, h('h2', { style: { marginTop: 0 } }, 'Done. Your Anki is now in Cardly.'), h('p', { class: 'hint' }, 'You can read again later. Cards are matched by their Anki id, so nothing is added twice.')),
        h(
          'div',
          { class: 'tiles', style: { marginTop: '14px' } },
          tile(r.added, 'Cards added'),
          r.updated ? tile(r.updated, 'Cards updated') : null,
          r.linked ? tile(r.linked, 'Matched existing cards') : null,
          tile(r.decks, 'Decks created'),
          tile(r.reviews, 'Reviews in history'),
          tile(r.days, 'Study days'),
          r.suspended ? tile(r.suspended, 'Suspended cards') : null
        )
      );
      if (r.media) put(h('div', { class: r.media.missing ? 'warn-box' : 'hint' }, `${num(r.media.copied)} image and audio files copied` + (r.media.missing ? `, ${num(r.media.missing)} could not be found.` : '.')));
      put((a.warnings || []).map((w) => h('div', { class: 'warn-box' }, w)));
      put(
        h(
          'div',
          { style: { display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' } },
          h('button', { class: 'btn primary', onclick: () => setView('library') }, icon('decks', 17), 'Open Library'),
          h('button', { class: 'btn', onclick: () => setView('stats') }, icon('chart', 17), 'Open Statistics'),
          h('button', { class: 'btn ghost', onclick: () => { a.stage = 'start'; a.scanned = false; a.data = null; renderAll(); } }, 'Read another Anki')
        )
      );
      return page;
    }

    if (a.stage === 'summary' && a.data) {
      const data = a.data;
      const s = data.summary;
      const tree = ankiTree(data.decks);
      const importBtn = h('button', { class: 'btn primary lg' }, icon('download', 18), 'Import');
      const countEl = h('span', { class: 'sub' });
      const refresh = () => {
        let n = 0;
        data.decks.forEach((d, i) => a.selected.has(i) && (n += d.cards.length));
        importBtn.lastChild.textContent = n ? `Import ${num(n)} cards` : 'Choose at least one deck';
        importBtn.disabled = !n;
        countEl.textContent = `${num(n)} of ${num(s.cards)} cards selected`;
      };

      const rows = h('div', { class: 'anki-tree' });
      const addRows = (node, depth) => {
        for (const kid of [...node.kids.values()].sort((x, y) => x.name.localeCompare(y.name))) {
          const idxs = treeIdx(kid);
          const box = h('input', { type: 'checkbox' });
          const sync = () => {
            const on = idxs.filter((i) => a.selected.has(i)).length;
            box.checked = on > 0 && on === idxs.length;
            box.indeterminate = on > 0 && on < idxs.length;
          };
          sync();
          box.addEventListener('change', () => {
            for (const i of idxs) box.checked ? a.selected.add(i) : a.selected.delete(i);
            refresh();
            rows.querySelectorAll('input[type=checkbox]').forEach((b) => b._sync && b._sync());
          });
          box._sync = sync;
          rows.append(h('label', { class: 'anki-row', style: { paddingLeft: 8 + depth * 22 + 'px' } }, box, h('span', { class: 'grow', dir: 'auto' }, kid.name), h('span', { class: 'badge' }, num(kid.total))));
          addRows(kid, depth + 1);
        }
      };
      addRows(tree, 0);

      const opt = (key, label, hint, disabled) => {
        const box = h('input', { type: 'checkbox', checked: a[key] && !disabled ? true : null, disabled: disabled ? true : null });
        box.addEventListener('change', () => (a[key] = box.checked));
        return h('label', { class: 'anki-opt' }, box, h('div', null, h('div', { style: { fontWeight: 600 } }, label), h('div', { class: 'hint', style: { margin: 0 } }, hint)));
      };
      const parentSel = h('select', { class: 'input' }, h('option', { value: '' }, 'None (top level)'), deckOptionEls());
      parentSel.value = a.parentId || '';
      parentSel.addEventListener('change', () => (a.parentId = parentSel.value));
      const existingAk = db.cards.filter((c) => c.ak).length;
      const tile = (v, k) => h('div', { class: 'tile' }, h('div', { class: 'v' }, v), h('div', { class: 'k' }, k));

      put(
        h('div', { class: 'hint', style: { margin: '-6px 0 14px' } }, a.source.kind === 'live' ? `Profile: ${a.source.name}` : 'From an export file'),
        a.error ? h('div', { class: 'err-box', style: { marginBottom: '12px' } }, a.error) : null,
        h(
          'div',
          { class: 'tiles' },
          tile(num(s.decks), 'Decks'),
          tile(num(s.cards), 'Cards'),
          tile(num(s.withProgress), 'With progress'),
          tile(num(s.suspended), 'Suspended'),
          tile(num(s.reviews), 'Reviews'),
          h('div', { class: 'tile' }, h('div', { class: 'v', style: { fontSize: '1.15rem', lineHeight: '2.2rem' } }, s.firstReview ? ankiDate(s.firstReview) : '—'), h('div', { class: 'k' }, 'First review'))
        ),
        (a.warnings || []).map((w) => h('div', { class: 'warn-box' }, w)),
        h(
          'div',
          { class: 'anki-cols' },
          h('div', { class: 'panel glass' }, h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px' } }, h('h2', { style: { margin: 0 } }, 'Decks'), countEl), h('div', { class: 'hint', style: { margin: '2px 0 8px' } }, 'Uncheck what you do not want. Sub-decks stay inside their parents.'), rows),
          h(
            'div',
            { class: 'panel glass' },
            h('h2', { style: { marginTop: 0 } }, 'What to bring'),
            opt('optProgress', 'Card progress', 'Due dates, intervals, ease, repetitions, lapses. Without this every card starts as new.'),
            opt('optHistory', 'Review history', 'Fills the statistics, the activity map and your streak with your real study days.'),
            opt('optMedia', 'Images and audio', a.source.kind === 'live' ? 'Copies the files that your cards use.' : 'Already included in the export file.', a.source.kind !== 'live'),
            h('div', { class: 'field', style: { marginTop: '10px' } }, h('label', null, 'Place the decks inside'), parentSel),
            existingAk ? h('div', { class: 'hint', style: { marginTop: '8px' } }, `${num(existingAk)} cards from an earlier Anki import are already here. They are matched, not duplicated, and updated if Anki's copy is newer.`) : null
          )
        ),
        h('div', { style: { display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap', alignItems: 'center' } }, importBtn, h('button', { class: 'btn ghost', onclick: () => { a.stage = 'start'; a.data = null; renderAll(); } }, 'Back'))
      );
      importBtn.addEventListener('click', ankiRun);
      if (a.source.kind !== 'live') a.optMedia = true;
      refresh();
      return page;
    }

    // start screen
    put(
      h(
        'div',
        { class: 'panel glass' },
        h('h2', { style: { marginTop: 0 } }, 'Bring your whole Anki into Cardly'),
        h('p', { style: { margin: '0 0 10px', lineHeight: 1.6 } }, 'Cards, decks and sub-decks, tags, images and audio. Also your progress (due dates, intervals, ease, suspended cards) and your full review history, so the statistics, activity map and streak look like you always used Cardly.'),
        h('div', { class: 'warn-box' }, 'Close Anki first, so the file is complete. Cardly only reads a copy of the data. Nothing in Anki is changed or deleted.')
      )
    );
    if (a.error) put(h('div', { class: 'err-box', style: { marginTop: '12px' } }, a.error));
    if (a.profiles && a.profiles.length) {
      put(h('h3', { style: { margin: '20px 0 8px' } }, a.profiles.length > 1 ? 'Anki profiles found on this PC' : 'Anki found on this PC'));
      const list = h('div', { class: 'panel glass', style: { padding: '6px 18px' } });
      for (const p of a.profiles) {
        list.append(
          h(
            'div',
            { class: 'anki-profile' },
            h('div', { class: 'deck-tile', style: { background: 'var(--accent-soft)' } }, icon('decks', 20)),
            h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600 }, dir: 'auto' }, p.name), h('div', { class: 'hint', style: { margin: 0 } }, `${ankiSize(p.size)} · last used ${ankiDate(p.mtime)}` + (p.walBytes ? ' · Anki seems to be open' : ''))),
            h('button', { class: 'btn primary', onclick: () => ankiReadProfile(p) }, 'Read this profile')
          )
        );
      }
      put(list);
    } else if (a.scanned) {
      put(h('div', { class: 'panel glass', style: { marginTop: '14px' } }, h('p', { style: { margin: 0 } }, 'Anki was not found in the usual place. If it is installed somewhere else, choose the collection file yourself, or use an export file.'), h('div', { class: 'hint' }, 'The file is usually: C:\\Users\\<you>\\AppData\\Roaming\\Anki2\\<profile>\\collection.anki2')));
    }
    put(
      h(
        'div',
        { style: { display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' } },
        h('button', { class: 'btn', onclick: ankiPickManually }, icon('folder', 17), 'Choose a collection file…'),
        h('button', { class: 'btn', onclick: ankiReadPackage }, icon('download', 17), 'Open an export (.apkg / .colpkg)…'),
        h('button', { class: 'btn ghost', onclick: () => { a.scanned = false; renderAll(); } }, 'Look again')
      )
    );
    return page;
  }

  // ============================================================
  //  Keyboard
  // ============================================================

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modalStack.length) {
        modalStack[modalStack.length - 1].close();
        return;
      }
      if (openMenuEl) return closeMenu();
      if (state.view === 'study') exitStudy();
      return;
    }
    if (modalStack.length) return;
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyN') {
      e.preventDefault();
      setView('add');
      return;
    }
    if (state.view !== 'study' || typing) return;
    const s = state.session;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault();
      undoAnswer();
      return;
    }
    if (!s || !s.current) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (!s.shown) revealAnswer();
      else answerCurrent(3);
      return;
    }
    const m = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
    if (m && s.shown) {
      answerCurrent(Number(m[1]));
      return;
    }
    if (e.code === 'KeyR') speakCard(s.current, s.shown ? 'back' : 'front');
    if (e.code === 'KeyE') openCardEditor(s.current, () => renderAll());
  });

  Speech.onChange(() => {
    if (state.view === 'settings' && !modalStack.length) renderAll();
  });

  setInterval(() => {
    if (state.view === 'library' && !modalStack.length && !openMenuEl) renderAll();
  }, 60000);

  // ============================================================
  //  Start
  // ============================================================

  (async function init() {
    try {
      state.info = await api.appInfo();
      db = normalize(await api.loadData());
    } catch (e) {
      toast('Could not read your data: ' + (e.message || e), 'error');
    }
    reindex();
    applyTheme();
    renderAll();
    try {
      state.packs = (await api.listPacks()) || [];
    } catch (e) {
      state.packs = [];
    }
    if (state.packs.length) renderAll();
    try {
      const info = await api.libraryInfo();
      state.libraryOn = !!(info && info.configured);
    } catch (e) {
      state.libraryOn = false;
    }
    if (state.libraryOn) renderAll();
  })();
})();
