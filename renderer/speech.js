/* Audio for flashcards. Two engines behind one simple interface (speak / stop):
 *  1) Windows voices (Web Speech API): works everywhere, but the classic voices sound robotic.
 *  2) Natural offline voice (Kokoro through sherpa-onnx, runs in a separate process, see main.js):
 *     much smoother. If it is not set up or fails, we quietly fall back to the Windows voice. */
(function () {
  const synth = window.speechSynthesis || null;
  let voices = [];
  const listeners = [];
  const messageHandlers = [];
  const neural = { on: false, sid: 1 };

  function load() {
    voices = synth ? synth.getVoices() : [];
    listeners.forEach((f) => f());
  }
  if (synth) {
    load();
    synth.addEventListener('voiceschanged', load);
  }

  function score(v) {
    let s = 0;
    if (/natural|neural|online/i.test(v.name)) s += 10;
    if (/google/i.test(v.name)) s += 3;
    if (/en[-_]US/i.test(v.lang)) s += 2;
    if (/en[-_]GB/i.test(v.lang)) s += 1;
    return s;
  }

  function englishVoices() {
    return voices
      .filter((v) => /^en[-_]/i.test(v.lang))
      .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
  }

  const say = (kind, text) => messageHandlers.forEach((f) => f(kind, text));

  // Cards in another language (for example German from the online library) carry a language code.
  const isEnglish = (lang) => !lang || /^en/i.test(lang);
  const LANG_NAMES = { de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', pt: 'Portuguese', ru: 'Russian', tr: 'Turkish', ar: 'Arabic', nl: 'Dutch', sv: 'Swedish', pl: 'Polish', ja: 'Japanese', zh: 'Chinese', ko: 'Korean' };
  let lastMissingAt = 0;
  function voiceFor(lang) {
    const code = String(lang).slice(0, 2).toLowerCase();
    return voices
      .filter((v) => v.lang && v.lang.toLowerCase().startsWith(code))
      .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))[0];
  }

  // ---------- Windows voices ----------
  let timer = null;
  function speakSystem(text, o) {
    if (!synth || !text) return;
    clearTimeout(timer);
    synth.cancel();
    // a short pause after cancel(); speaking immediately can drop the sound in some versions
    timer = setTimeout(() => {
      const u = new SpeechSynthesisUtterance(text);
      const other = !isEnglish(o.lang);
      const v = other ? voiceFor(o.lang) : voices.find((x) => x.voiceURI === o.voiceURI) || englishVoices()[0];
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      } else {
        u.lang = other ? o.lang : 'en-US';
        const now = Date.now();
        if (other && now - lastMissingAt > 20000) {
          lastMissingAt = now;
          const nm = LANG_NAMES[String(o.lang).slice(0, 2).toLowerCase()] || o.lang;
          say('error', `No ${nm} voice was found on this computer. Add one in Windows Settings › Time & language › Speech › Manage voices.`);
        }
      }
      u.rate = o.rate || 0.9;
      u.pitch = 1;
      synth.speak(u);
    }, 40);
  }

  // ---------- Natural voice ----------
  let ctx = null;
  let source = null;
  let playId = 0;
  let warmedUp = false;
  let lastErrorAt = 0;
  const cache = new Map(); // "sid|speed|text" -> AudioBuffer

  function stopSource() {
    if (source) {
      try {
        source.onended = null;
        source.stop();
      } catch (e) {
        /* already stopped */
      }
      source = null;
    }
  }

  async function speakNeural(text, rate) {
    const id = ++playId;
    stopSource();
    const speed = Math.min(1.4, Math.max(0.6, rate || 0.9));
    const key = neural.sid + '|' + speed + '|' + text;
    let buf = cache.get(key);
    if (!buf) {
      if (!warmedUp) say('info', 'Preparing the natural voice. The first sentence takes a few seconds.');
      let r;
      try {
        r = await window.api.ttsSynth({ text, sid: neural.sid, speed });
      } catch (e) {
        r = { ok: false, error: String((e && e.message) || e) };
      }
      if (id !== playId) return true; // a newer request replaced this one
      if (!r || !r.ok) return r || { ok: false, error: 'No answer from the voice engine.' };
      warmedUp = true;
      ctx = ctx || new AudioContext();
      const data = Float32Array.from(r.samples);
      buf = ctx.createBuffer(1, data.length, r.sampleRate);
      buf.copyToChannel(data, 0);
      cache.set(key, buf);
      if (cache.size > 80) cache.delete(cache.keys().next().value);
    }
    if (id !== playId) return true;
    ctx = ctx || new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    if (id !== playId) return true;
    source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(ctx.destination);
    const mine = source;
    source.onended = () => {
      if (source === mine) source = null;
    };
    source.start();
    return true;
  }

  // ---------- Audio files that came with cards (for example from Anki) ----------
  const fileCache = new Map(); // url -> AudioBuffer
  async function playFile(url) {
    const id = ++playId;
    stopSource();
    clearTimeout(timer);
    if (synth) synth.cancel();
    try {
      ctx = ctx || new AudioContext();
      let buf = fileCache.get(url);
      if (!buf) {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('missing');
        buf = await ctx.decodeAudioData(await resp.arrayBuffer());
        fileCache.set(url, buf);
        if (fileCache.size > 30) fileCache.delete(fileCache.keys().next().value);
      }
      if (id !== playId) return;
      if (ctx.state === 'suspended') await ctx.resume();
      if (id !== playId) return;
      source = ctx.createBufferSource();
      source.buffer = buf;
      source.connect(ctx.destination);
      const mine = source;
      source.onended = () => {
        if (source === mine) source = null;
      };
      source.start();
    } catch (e) {
      say('error', 'This audio file could not be played. It may be missing or in a format Cardly cannot read.');
    }
  }

  function speak(text, opts) {
    if (!text) return;
    const o = opts || {};
    if (!neural.on || !isEnglish(o.lang)) return speakSystem(text, o); // the natural voice is English only
    speakNeural(text, o.rate).then((res) => {
      if (res === true) return;
      // could not use the natural voice: tell the user (not too often) and use the Windows voice instead
      const now = Date.now();
      if (now - lastErrorAt > 20000) {
        lastErrorAt = now;
        say('error', (res && res.error ? res.error : 'The natural voice is not available.') + ' Using the Windows voice for now.');
      }
      speakSystem(text, o);
    });
  }

  function stop() {
    clearTimeout(timer);
    playId++;
    stopSource();
    if (synth) synth.cancel();
  }

  /** from a card's text, keep only the English lines (formulas, images and Persian lines are skipped) */
  function speakable(text, lang) {
    const cleaned = String(text || '')
      .replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[sound:[^\]]*\]/g, '')
      .replace(/[*`_]/g, '');
    return cleaned
      .split('\n')
      .map((l) => l.replace(/^\s*[-•]\s+/, ''))
      .filter((line) => {
        const latin = (line.match(/\p{Script=Latin}/gu) || []).length;
        const persian = (line.match(/[؀-ۿ]/g) || []).length;
        return latin > 0 && latin >= persian;
      })
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => (/[.!?…]$/.test(l) ? l : l + '.'))
      .join(' ');
  }

  window.Speech = {
    get available() {
      return !!synth || neural.on;
    },
    englishVoices,
    speak,
    playFile,
    stop,
    speakable,
    configure(o) {
      const next = { on: !!(o && o.neural), sid: Number(o && o.sid) || 0 };
      if (next.sid !== neural.sid) cache.clear();
      neural.on = next.on;
      neural.sid = next.sid;
    },
    onChange: (f) => listeners.push(f),
    onMessage: (f) => messageHandlers.push(f)
  };
})();
