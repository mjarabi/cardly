/* Opens an Anki database held in memory and gives back a function  query(sql) -> rows.
 * The app uses sql.js (SQLite compiled to WebAssembly). Tests can swap in another opener with setOpener(). */
const path = require('path');
const A = require('./anki');

let opener = null;
function setOpener(fn) {
  opener = fn;
}

async function openWithSqlJs(bytes) {
  let initSqlJs;
  try {
    initSqlJs = require('sql.js');
  } catch (e) {
    throw A.userError('sql.js is not installed. Run "npm install" in the project folder.');
  }
  const dist = path.dirname(require.resolve('sql.js'));
  const SQL = await initSqlJs({ locateFile: (f) => path.join(dist, f) });
  const db = new SQL.Database(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length));
  return {
    query: (sql) => {
      const r = db.exec(sql);
      return r.length ? r[0].values : [];
    },
    close: () => db.close()
  };
}

/** bytes of a collection file (a copy; the original file is never touched) -> { query, close } */
async function openDb(bytes) {
  const buf = A.rollbackMode(A.patchCollation(Buffer.from(bytes)));
  return (opener || openWithSqlJs)(buf);
}

module.exports = { openDb, setOpener };
