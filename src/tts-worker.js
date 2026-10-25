/* Runs the natural voice engine in its own process (started by main.js with utilityProcess). */
const { createService } = require('./tts-core');

const service = createService({ requireSherpa: () => require('sherpa-onnx-node') });

process.parentPort.on('message', async (event) => {
  const msg = event.data || {};
  let reply;
  try {
    reply = await service.handle(msg);
  } catch (e) {
    reply = { ok: false, error: String((e && e.message) || e) };
  }
  process.parentPort.postMessage(Object.assign({ id: msg.id }, reply));
});
