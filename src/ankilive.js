/* Reads the Anki that is installed on this computer. Nothing is written to Anki's folder: the collection
 * file is read into memory and everything happens on that copy. */
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const A = require('./anki');
const { openDb } = require('./ankidb');

function defaultRoots() {
  const home = os.homedir();
  const roots = [];
  if (process.env.APPDATA) roots.push(path.join(process.env.APPDATA, 'Anki2'));
  roots.push(path.join(home, 'AppData', 'Roaming', 'Anki2'));
  roots.push(path.join(home, 'Library', 'Application Support', 'Anki2'));
  roots.push(path.join(home, '.local', 'share', 'Anki2'));
  return [...new Set(roots)];
}

/** finds Anki profiles: folders that contain collection.anki2 */
async function scanProfiles(roots) {
  const out = [];
  for (const root of roots || defaultRoots()) {
    let names = [];
    try {
      names = await fsp.readdir(root);
    } catch (e) {
      continue;
    }
    for (const name of names) {
      if (name === 'addons21') continue;
      const dir = path.join(root, name);
      const file = path.join(dir, 'collection.anki2');
      try {
        const st = await fsp.stat(file);
        if (!st.isFile()) continue;
        let wal = 0;
        try {
          wal = (await fsp.stat(file + '-wal')).size;
        } catch (e) {
          /* no wal file: Anki is closed (or has nothing waiting) */
        }
        out.push({ name, file, dir, mediaDir: path.join(dir, 'collection.media'), size: st.size, mtime: st.mtimeMs, walBytes: wal });
      } catch (e) {
        /* not a profile folder */
      }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

/** reads one collection file and converts it. progress(text) is called between the slow steps. */
async function readProfile(req, progress) {
  const say = typeof progress === 'function' ? progress : () => {};
  const file = req.file;
  const st = await fsp.stat(file).catch(() => null);
  if (!st || !st.isFile()) throw A.userError('The Anki file was not found: ' + file);
  const mediaDir = req.mediaDir || path.join(path.dirname(file), 'collection.media');

  say('Reading the Anki file…');
  const bytes = await fsp.readFile(file);
  const db = await openDb(bytes);
  let norm;
  try {
    norm = A.readCollection(db.query);
  } finally {
    db.close();
  }
  if (!norm.cards.length) throw A.userError('This Anki collection has no cards.');

  let mediaNames = new Set();
  try {
    for (const n of await fsp.readdir(mediaDir)) mediaNames.add(n.normalize('NFC'));
  } catch (e) {
    mediaNames = null; // no media folder: images and audio cannot be brought over
  }

  say('Converting ' + norm.cards.length.toLocaleString('en-US') + ' cards and ' + norm.revlog.length.toLocaleString('en-US') + ' reviews…');
  const built = A.buildImport(norm, {
    now: req.now,
    rolloverHour: req.rolloverHour,
    learningSteps: req.learningSteps,
    hasMedia: (name) => (mediaNames ? mediaNames.has(name.normalize('NFC')) : false)
  });

  const warnings = [];
  let wal = 0;
  try {
    wal = (await fsp.stat(file + '-wal')).size;
  } catch (e) {
    /* none */
  }
  if (wal > 0) warnings.push('Anki looks like it is open. The newest changes may not be in the file yet; close Anki and read again for a complete copy.');
  if (!mediaNames && built.stats && (built.stats.images || built.stats.sounds)) warnings.push('The media folder was not found, so images and audio were skipped.');
  else {
    if (built.stats.images) warnings.push(`${built.stats.images} image(s) are used by cards but missing from the media folder.`);
    if (built.stats.sounds) warnings.push(`${built.stats.sounds} audio file(s) are used by cards but missing from the media folder.`);
  }
  return { anki: built, source: { file, mediaDir, mediaFolder: !!mediaNames }, warnings };
}

/** copies the used media files into Cardly's folder. list: [{orig, saved}] */
async function copyMedia(req) {
  const { mediaDir, destDir, list } = req;
  fs.mkdirSync(destDir, { recursive: true });
  let copied = 0;
  let missing = 0;
  let bytes = 0;
  for (const m of list || []) {
    const saved = String(m.saved || '');
    if (!/^[\w.\-]+$/.test(saved) || saved.startsWith('.')) continue; // never write outside the media folder
    const from = path.join(mediaDir, path.basename(String(m.orig)));
    const to = path.join(destDir, saved);
    try {
      const st = await fsp.stat(from);
      let same = false;
      try {
        same = (await fsp.stat(to)).size === st.size;
      } catch (e) {
        same = false;
      }
      if (!same) await fsp.copyFile(from, to);
      copied++;
      bytes += st.size;
    } catch (e) {
      missing++;
    }
  }
  return { copied, missing, bytes };
}

module.exports = { scanProfiles, readProfile, copyMedia, defaultRoots };
