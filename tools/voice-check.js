/* Voice check: tries the natural voice engine outside the app and tells exactly what happens.
 * Run from the project folder:   node tools/voice-check.js
 * (or inside Electron:           npx.cmd electron tools/voice-check.js)
 * It writes voice-check.wav next to this file; double-click it to listen. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findModelDir } = require('../src/tts-core');

const log = (...a) => console.log(...a);
const appData = process.env.APPDATA || path.join(os.homedir(), '.config');
const voicesDir = path.join(appData, 'Cardly', 'voices');

function wav(samples, rate) {
  const n = samples.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return b;
}

function describe(name, audio) {
  if (!audio) return log('  ' + name + ': NOTHING returned');
  const s = audio.samples;
  let peak = 0;
  if (s && s.length) for (let i = 0; i < s.length; i++) peak = Math.max(peak, Math.abs(s[i]));
  log('  ' + name + ': keys=' + Object.keys(audio).join(',') + ' sampleRate=' + audio.sampleRate + ' samples=' + (s ? s.length : 'none') + ' peak=' + peak.toFixed(3));
}

(function main() {
  log('Node ' + process.version + (process.versions.electron ? ' / Electron ' + process.versions.electron : ''));
  log('Voices folder: ' + voicesDir);
  const dir = findModelDir(voicesDir);
  log('Model folder:  ' + (dir || 'NOT FOUND'));
  if (!dir) return;

  let sherpa;
  try {
    sherpa = require('sherpa-onnx-node');
    log('Engine package: loaded, version ' + sherpa.version + '. GenerationConfig: ' + typeof sherpa.GenerationConfig);
  } catch (e) {
    return log('Engine package: FAILED to load -> ' + e.message);
  }

  let tts;
  const t0 = Date.now();
  try {
    tts = new sherpa.OfflineTts({
      model: {
        kokoro: {
          model: path.join(dir, 'model.onnx'),
          voices: path.join(dir, 'voices.bin'),
          tokens: path.join(dir, 'tokens.txt'),
          dataDir: path.join(dir, 'espeak-ng-data')
        },
        debug: true,
        numThreads: 2,
        provider: 'cpu'
      },
      maxNumSentences: 1
    });
    log('Model loaded in ' + (Date.now() - t0) + ' ms. speakers=' + tts.numSpeakers + ' sampleRate=' + tts.sampleRate);
  } catch (e) {
    return log('Model load FAILED -> ' + e.message);
  }

  const text = 'Hello. This is a test of the natural voice.';
  const tries = [
    ['A: legacy, copy mode', () => tts.generate({ text, sid: 1, speed: 1.0, enableExternalBuffer: false })],
    ['B: legacy, default buffer', () => tts.generate({ text, sid: 1, speed: 1.0 })],
    [
      'C: generationConfig, copy mode',
      () => tts.generate({ text, enableExternalBuffer: false, generationConfig: new sherpa.GenerationConfig({ sid: 1, speed: 1.0, silenceScale: 0.2 }) })
    ]
  ];
  let best = null;
  log('Results:');
  for (const [name, fn] of tries) {
    try {
      const a = fn();
      describe(name, a);
      if (a && a.samples && a.samples.length && !best) best = a;
    } catch (e) {
      log('  ' + name + ': ERROR -> ' + e.message);
    }
  }
  if (best) {
    const out = path.join(__dirname, 'voice-check.wav');
    fs.writeFileSync(out, wav(best.samples, best.sampleRate));
    log('Wrote ' + out + ' - double-click it to listen.');
  } else {
    log('No variant produced sound.');
  }
})();
