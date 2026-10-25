const { app, BrowserWindow, ipcMain, dialog, protocol, net, nativeTheme, shell, utilityProcess } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let paths = {};

const THEME_COLORS = {
  light: { color: '#eaf0ff', symbolColor: '#1c1c1e' },
  dark: { color: '#0c0d16', symbolColor: '#f5f5f7' }
};

function initPaths() {
  const base = app.getPath('userData');
  paths = {
    base,
    data: path.join(base, 'data.json'),
    backups: path.join(base, 'backups'),
    media: path.join(base, 'media')
  };
  fs.mkdirSync(paths.backups, { recursive: true });
  fs.mkdirSync(paths.media, { recursive: true });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: THEME_COLORS.light.color,
    title: 'Cardly',
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...THEME_COLORS.light, height: 36 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) e.preventDefault();
  });
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  initPaths();

  protocol.handle('media', (request) => {
    const url = new URL(request.url);
    const name = path.basename(decodeURIComponent(url.pathname));
    const file = path.join(paths.media, name);
    return net.fetch(pathToFileURL(file).toString());
  });

  registerIpc();
  createWindow();
});

let pendingWrite = Promise.resolve();

// wait for the last save to finish before quitting
app.on('window-all-closed', async () => {
  await pendingWrite;
  app.quit();
});

// ---------- storage ----------

async function readJsonSafe(file) {
  try {
    const text = await fsp.readFile(file, 'utf8');
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

async function rotateBackup() {
  try {
    if (!fs.existsSync(paths.data)) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const target = path.join(paths.backups, `data-${stamp}.json`);
    if (!fs.existsSync(target)) {
      await fsp.copyFile(paths.data, target);
      const files = (await fsp.readdir(paths.backups)).filter((f) => f.startsWith('data-')).sort();
      while (files.length > 10) {
        await fsp.unlink(path.join(paths.backups, files.shift()));
      }
    }
  } catch (e) {
    /* the backup is optional */
  }
}

async function loadData() {
  let data = await readJsonSafe(paths.data);
  if (!data) {
    // the main file is damaged; fall back to the latest backup
    try {
      const files = (await fsp.readdir(paths.backups)).filter((f) => f.startsWith('data-')).sort().reverse();
      for (const f of files) {
        data = await readJsonSafe(path.join(paths.backups, f));
        if (data) break;
      }
    } catch (e) {
      /* ignore */
    }
  }
  return data;
}

async function saveData(text) {
  JSON.parse(text); // throws if invalid, so the previous file stays intact
  const tmp = paths.data + '.tmp';
  await rotateBackup();
  await fsp.writeFile(tmp, text, 'utf8');
  await fsp.rename(tmp, paths.data);
}

// ---------- IPC ----------

function registerIpc() {
  ipcMain.handle('data:load', () => loadData());

  ipcMain.handle('data:save', (_e, text) => {
    // saves run one after another so two simultaneous writes cannot damage the file
    const run = pendingWrite.then(() => saveData(text));
    pendingWrite = run.catch(() => {});
    return run.then(() => true);
  });

  ipcMain.handle('media:save', async (_e, bytes, ext) => {
    const safeExt = String(ext || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(safeExt)) {
      throw new Error('Unsupported image type');
    }
    const name = `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.${safeExt}`;
    await fsp.writeFile(path.join(paths.media, name), Buffer.from(bytes));
    return name;
  });

  ipcMain.handle('import:pick', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose a file to import',
      properties: ['openFile'],
      filters: [
        { name: 'Anki and table files', extensions: ['apkg', 'colpkg', 'csv', 'tsv', 'txt'] },
        { name: 'All files', extensions: ['*'] }
      ]
    });
    if (res.canceled || !res.filePaths.length) return { canceled: true };
    const file = res.filePaths[0];
    try {
      const buf = await fsp.readFile(file);
      const { importFile } = require('./src/importers');
      const result = await importFile(buf, path.basename(file), { mediaDir: paths.media });
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: e.userMessage || e.message || String(e) };
    }
  });

  ipcMain.handle('export:text', async (_e, { suggestedName, text, filterName, ext }) => {
    const res = await dialog.showSaveDialog(win, {
      title: 'Save file',
      defaultPath: suggestedName,
      filters: [{ name: filterName || 'File', extensions: [ext || 'csv'] }]
    });
    if (res.canceled || !res.filePath) return { canceled: true };
    await fsp.writeFile(res.filePath, '﻿' + text, 'utf8'); // BOM so that Excel shows Persian text correctly
    return { ok: true, path: res.filePath };
  });

  ipcMain.handle('backup:pick', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose a backup file',
      properties: ['openFile'],
      filters: [{ name: 'Cardly backup', extensions: ['json'] }]
    });
    if (res.canceled || !res.filePaths.length) return { canceled: true };
    const text = await fsp.readFile(res.filePaths[0], 'utf8');
    return { ok: true, text: text.replace(/^﻿/, '') };
  });

  ipcMain.handle('theme:set', (_e, mode, color) => {
    const base = THEME_COLORS[mode === 'dark' ? 'dark' : 'light'];
    const colors = { ...base, color: typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : base.color };
    if (win && process.platform === 'win32') {
      win.setTitleBarOverlay({ ...colors, height: 36 });
    }
    if (win) win.setBackgroundColor(colors.color);
    return true;
  });

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    dataPath: paths.base,
    systemDark: nativeTheme.shouldUseDarkColors
  }));

  ipcMain.handle('app:openDataFolder', () => shell.openPath(paths.base));

  // content packs: every .js file inside src/packs is one pack (files starting with _ are ignored)
  ipcMain.handle('packs:list', () => {
    const dir = path.join(__dirname, 'src', 'packs');
    const out = [];
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !f.startsWith('_'));
    } catch (e) {
      return out;
    }
    for (const f of files.sort()) {
      try {
        out.push(require(path.join(dir, f)));
      } catch (e) {
        console.error('Could not load pack', f, e.message);
      }
    }
    return out;
  });

  // Online library: content files that live in the "library" folder of the project's GitHub repository.
  // The address comes from "repository" in package.json (for tests it can be overridden with CARDLY_LIBRARY_URL).
  function librarySource() {
    if (process.env.CARDLY_LIBRARY_URL) return process.env.CARDLY_LIBRARY_URL.replace(/\/+$/, '');
    const L = require('./src/library');
    const repo = L.repoFromPackage(require('./package.json'));
    return repo ? L.baseUrl(repo, 'main') : null;
  }
  ipcMain.handle('library:info', () => ({ configured: !!librarySource() }));
  ipcMain.handle('library:load', async () => {
    const base = librarySource();
    if (!base) return { ok: true, configured: false, packs: [], errors: [], offline: false };
    const cacheDir = path.join(paths.base, 'library-cache');
    const cacheFile = (key) => path.join(cacheDir, key.replace(/[^A-Za-z0-9._-]+/g, '_'));
    const io = {
      async fetchText(url) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 20000);
        try {
          const res = await net.fetch(url, { signal: ctl.signal, headers: { 'Cache-Control': 'no-cache' } });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const text = await res.text();
          if (text.length > 3 * 1024 * 1024) throw new Error('the file is too large');
          return text;
        } finally {
          clearTimeout(timer);
        }
      },
      readCache(key) {
        try {
          return fs.readFileSync(cacheFile(key), 'utf8');
        } catch (e) {
          return null;
        }
      },
      writeCache(key, text) {
        try {
          fs.mkdirSync(cacheDir, { recursive: true });
          fs.writeFileSync(cacheFile(key), text, 'utf8');
        } catch (e) {
          /* the cache is optional */
        }
      }
    };
    try {
      const r = await require('./src/library').loadLibrary(base, io);
      return { ok: true, configured: true, packs: r.packs, errors: r.errors, offline: r.offline };
    } catch (e) {
      return { ok: false, configured: true, error: String((e && e.message) || e) };
    }
  });

  // AI requests are made here (not in the page) so the page keeps its strict security policy.
  ipcMain.handle('ai:chat', async (_e, req) => {
    const { chat } = require('./src/aiclient');
    const r = req || {};
    return chat({
      baseUrl: r.baseUrl,
      apiKey: r.apiKey,
      model: r.model,
      messages: Array.isArray(r.messages) ? r.messages.slice(0, 6) : [],
      fetchFn: (url, init) => net.fetch(url, init)
    });
  });

  // ---------- Moving from Anki ----------
  // Files are read in a short-lived helper process (a big collection can take a few seconds).
  // The page can only ask for files that were found by the scan or chosen in a dialog here.
  const ankiAllowed = new Set();
  function ankiCall(msg, timeoutMs) {
    return new Promise((resolve) => {
      let w = null;
      let done = false;
      const finish = (r) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          if (w) w.kill();
        } catch (e) {
          /* already gone */
        }
        resolve(r);
      };
      const timer = setTimeout(() => finish({ ok: false, error: 'Reading took too long and was stopped.' }), timeoutMs);
      try {
        w = utilityProcess.fork(path.join(__dirname, 'src', 'anki-worker.js'), [], { serviceName: 'Cardly Anki reader' });
        w.on('message', (m) => {
          if (!m) return;
          if (m.progress) {
            if (win && !win.isDestroyed()) win.webContents.send('anki:progress', String(m.progress));
            return;
          }
          finish(m);
        });
        w.on('exit', () => finish({ ok: false, error: 'The Anki reader stopped unexpectedly (probably not enough memory for a very large collection).' }));
        w.postMessage(Object.assign({ id: 1 }, msg));
      } catch (e) {
        finish({ ok: false, error: 'Could not start the Anki reader: ' + e.message });
      }
    });
  }
  const ankiOpts = (r) => ({
    rolloverHour: Number.isFinite(r.rolloverHour) ? r.rolloverHour : 4,
    learningSteps: Number.isFinite(r.learningSteps) ? r.learningSteps : 2
  });

  ipcMain.handle('anki:scan', async () => {
    const { scanProfiles } = require('./src/ankilive');
    const list = await scanProfiles();
    for (const p of list) ankiAllowed.add(p.file);
    return list;
  });

  ipcMain.handle('anki:pickCollection', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose the Anki collection file',
      properties: ['openFile'],
      filters: [{ name: 'Anki collection', extensions: ['anki2', 'anki21'] }, { name: 'All files', extensions: ['*'] }]
    });
    if (res.canceled || !res.filePaths.length) return { canceled: true };
    ankiAllowed.add(res.filePaths[0]);
    return { ok: true, file: res.filePaths[0], name: path.basename(path.dirname(res.filePaths[0])) };
  });

  ipcMain.handle('anki:read', async (_e, req) => {
    const r = req || {};
    if (!ankiAllowed.has(r.file)) return { ok: false, error: 'Please choose the Anki file from the list first.' };
    return ankiCall(Object.assign({ type: 'read', file: r.file }, ankiOpts(r)), 15 * 60 * 1000);
  });

  ipcMain.handle('anki:readPackage', async (_e, req) => {
    const r = req || {};
    const res = await dialog.showOpenDialog(win, {
      title: 'Choose an Anki export',
      properties: ['openFile'],
      filters: [{ name: 'Anki export', extensions: ['apkg', 'colpkg'] }, { name: 'All files', extensions: ['*'] }]
    });
    if (res.canceled || !res.filePaths.length) return { canceled: true };
    return ankiCall(Object.assign({ type: 'package', file: res.filePaths[0], mediaDir: paths.media }, ankiOpts(r)), 15 * 60 * 1000);
  });

  ipcMain.handle('anki:copyMedia', async (_e, req) => {
    const r = req || {};
    if (!ankiAllowed.has(r.file)) return { ok: false, error: 'Unknown Anki file.' };
    const mediaDir = path.join(path.dirname(r.file), 'collection.media');
    const list = Array.isArray(r.list) ? r.list.filter((m) => m && typeof m.orig === 'string' && typeof m.saved === 'string') : [];
    return ankiCall({ type: 'copyMedia', mediaDir, destDir: paths.media, list }, 30 * 60 * 1000);
  });

  // ---------- Natural offline voice ----------
  // The engine runs in its own process, so a slow model or a crash can never freeze the app.
  let ttsWorker = null;
  let ttsSeq = 0;
  const ttsPending = new Map();
  // The voice model the user downloaded lives in the data folder. A model shipped inside the installer
  // (folder "bundled-voices" at build time) is used when the user has none of their own.
  const userVoicesDir = () => path.join(paths.base, 'voices');
  const bundledVoicesDir = () => (app.isPackaged ? path.join(process.resourcesPath, 'voices') : path.join(__dirname, 'bundled-voices'));
  const voicesDir = () => {
    const { findModelDir } = require('./src/tts-core');
    const own = userVoicesDir();
    if (!findModelDir(own)) {
      const shipped = bundledVoicesDir();
      if (findModelDir(shipped)) return shipped;
    }
    return own;
  };

  function failAllTts(error) {
    for (const [, p] of ttsPending) {
      clearTimeout(p.timer);
      p.resolve({ ok: false, code: 'worker-exit', error });
    }
    ttsPending.clear();
  }
  function ensureTtsWorker() {
    if (ttsWorker) return ttsWorker;
    const w = utilityProcess.fork(path.join(__dirname, 'src', 'tts-worker.js'), [], { serviceName: 'Cardly voice' });
    w.on('message', (m) => {
      const p = m && ttsPending.get(m.id);
      if (!p) return;
      ttsPending.delete(m.id);
      clearTimeout(p.timer);
      p.resolve(m);
    });
    w.on('exit', () => {
      if (ttsWorker === w) ttsWorker = null;
      failAllTts('The voice engine stopped unexpectedly. Try again.');
    });
    ttsWorker = w;
    return w;
  }
  function ttsCall(msg, timeoutMs) {
    return new Promise((resolve) => {
      try {
        const w = ensureTtsWorker();
        const id = ++ttsSeq;
        const timer = setTimeout(() => {
          ttsPending.delete(id);
          resolve({ ok: false, code: 'timeout', error: 'The voice engine took too long. The first sentence needs a few seconds while the model loads.' });
        }, timeoutMs);
        ttsPending.set(id, { resolve, timer });
        w.postMessage(Object.assign({ id }, msg));
      } catch (e) {
        resolve({ ok: false, code: 'worker-failed', error: 'Could not start the voice engine: ' + e.message });
      }
    });
  }
  app.on('before-quit', () => {
    if (ttsWorker) ttsWorker.kill();
  });

  ipcMain.handle('tts:status', async () => {
    try {
      fs.mkdirSync(userVoicesDir(), { recursive: true });
    } catch (e) {
      /* ignore */
    }
    const r = await ttsCall({ type: 'status', voicesDir: voicesDir() }, 20000);
    return Object.assign(r, { voicesDir: userVoicesDir(), bundled: voicesDir() !== userVoicesDir() });
  });
  ipcMain.handle('tts:synth', (_e, req) => {
    const r = req || {};
    return ttsCall({ type: 'synth', voicesDir: voicesDir(), text: String(r.text || ''), sid: r.sid, speed: r.speed }, 120000);
  });
  ipcMain.handle('tts:openFolder', async () => {
    fs.mkdirSync(userVoicesDir(), { recursive: true });
    return shell.openPath(userVoicesDir());
  });
}
