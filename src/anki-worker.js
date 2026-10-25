/* Reads Anki files in its own process (started by main.js with utilityProcess), so a big collection never freezes the window. */
const live = require('./ankilive');

process.parentPort.on('message', async (event) => {
  const msg = event.data || {};
  const reply = (extra) => process.parentPort.postMessage(Object.assign({ id: msg.id }, extra));
  try {
    if (msg.type === 'read') {
      const r = await live.readProfile(msg, (text) => reply({ progress: text }));
      reply({ ok: true, result: r });
    } else if (msg.type === 'package') {
      const fs = require('fs');
      const { importFile } = require('./importers');
      const buf = fs.readFileSync(msg.file);
      reply({ progress: 'Reading the package…' });
      const r = await importFile(buf, require('path').basename(msg.file), { rich: true, mediaDir: msg.mediaDir, rolloverHour: msg.rolloverHour, learningSteps: msg.learningSteps });
      reply({ ok: true, result: r });
    } else if (msg.type === 'copyMedia') {
      reply({ ok: true, result: await live.copyMedia(msg) });
    } else {
      reply({ ok: false, error: 'Unknown request' });
    }
  } catch (e) {
    reply({ ok: false, error: e.userMessage || String((e && e.message) || e) });
  }
});
