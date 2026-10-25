/* Reads an Anki export (.apkg / .colpkg). All three generations of the format are handled:
 *   collection.anki2   – oldest (may be just a "please update" stub in newer exports)
 *   collection.anki21  – 2.1 schema
 *   collection.anki21b – newest: everything is compressed with zstd, the media list is a protobuf */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const A = require('./anki');
const { openDb } = require('./ankidb');

const isZstd = (b) => b.length > 4 && b[0] === 0x28 && b[1] === 0xb5 && b[2] === 0x2f && b[3] === 0xfd;
function unzstd(b) {
  if (typeof zlib.zstdDecompressSync !== 'function') {
    throw A.userError('This export uses the newest Anki format, which needs a newer Electron. Export again with "Support older Anki versions" turned on.');
  }
  return zlib.zstdDecompressSync(b);
}

async function openPackage(buf) {
  const JSZip = require('jszip');
  let zip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch (e) {
    throw A.userError('This is not a valid Anki package (the zip could not be opened).');
  }
  const dbName = ['collection.anki21b', 'collection.anki21', 'collection.anki2'].find((n) => zip.files[n]);
  if (!dbName) throw A.userError('No Anki database was found in the file.');

  let dbBytes = Buffer.from(await zip.files[dbName].async('uint8array'));
  if (isZstd(dbBytes)) dbBytes = unzstd(dbBytes);

  // media: zip entry name ("0", "1", ...) -> real file name
  const byName = new Map();
  if (zip.files['media']) {
    let raw = Buffer.from(await zip.files['media'].async('uint8array'));
    if (isZstd(raw)) raw = unzstd(raw);
    let json = null;
    try {
      json = JSON.parse(raw.toString('utf8'));
    } catch (e) {
      json = null;
    }
    if (json && typeof json === 'object') {
      for (const [zipName, realName] of Object.entries(json)) byName.set(String(realName), zipName);
    } else {
      // protobuf list: entry number i is stored as zip file "i"
      const entries = A.pbParse(raw).get(1) || [];
      entries.forEach((e, i) => {
        const name = Buffer.from(A.pbParse(e).get(1) ? A.pbParse(e).get(1)[0] : []).toString('utf8');
        if (name) byName.set(name, String(i));
      });
    }
  }

  const db = await openDb(dbBytes);
  let norm;
  try {
    norm = A.readCollection(db.query);
  } finally {
    db.close();
  }
  if (!norm.cards.length) throw A.userError('The Anki file contains no cards.');
  const firstNote = norm.notes.values().next().value;
  if (dbName === 'collection.anki2' && norm.notes.size <= 2 && firstNote && /update to the latest Anki/i.test(firstNote.fields.join(' '))) {
    throw A.userError('This export only contains the "please update Anki" placeholder. In Anki, export again with "Support older Anki versions" turned on.');
  }

  return {
    norm,
    hasMedia: (name) => byName.has(name) || byName.has(name.normalize('NFC')),
    /** saves the files in `list` ([{orig, saved}]) into dir; returns how many were written */
    async writeMedia(list, dir) {
      fs.mkdirSync(dir, { recursive: true });
      let n = 0;
      for (const m of list) {
        const zipName = byName.get(m.orig) || byName.get(m.orig.normalize('NFC'));
        const entry = zipName && zip.files[zipName];
        if (!entry) continue;
        let bytes = Buffer.from(await entry.async('uint8array'));
        if (isZstd(bytes)) bytes = unzstd(bytes);
        fs.writeFileSync(path.join(dir, m.saved), bytes);
        n++;
      }
      return n;
    }
  };
}

module.exports = { openPackage, isZstd };
