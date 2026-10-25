/* Natural offline voice: the logic that does not depend on Electron.
 * It runs inside a separate process (src/tts-worker.js) so a slow or crashing voice engine can never freeze the app.
 * The engine is sherpa-onnx (npm package "sherpa-onnx-node") with the Kokoro English model.
 * The package is passed in (requireSherpa), so the tests can use a fake one. */
const fs = require('fs');
const path = require('path');
const os = require('os');

const MODEL_FILES = ['model.onnx', 'voices.bin', 'tokens.txt'];
const DATA_DIR = 'espeak-ng-data';

// the 11 speakers of kokoro-en-v0_19, in model order (id = position)
const VOICES = [
  ['af', 'Default · American female'],
  ['af_bella', 'Bella · American female'],
  ['af_nicole', 'Nicole · American female'],
  ['af_sarah', 'Sarah · American female'],
  ['af_sky', 'Sky · American female'],
  ['am_adam', 'Adam · American male'],
  ['am_michael', 'Michael · American male'],
  ['bf_emma', 'Emma · British female'],
  ['bf_isabella', 'Isabella · British female'],
  ['bm_george', 'George · British male'],
  ['bm_lewis', 'Lewis · British male']
];

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch (e) {
    return false;
  }
};
const isDir = (p) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch (e) {
    return false;
  }
};

function isModelDir(dir) {
  return MODEL_FILES.every((f) => isFile(path.join(dir, f))) && isDir(path.join(dir, DATA_DIR));
}

/** look in the voices folder itself and up to two levels below it (archives often add an extra folder) */
function findModelDir(root, depth = 2) {
  if (!root || !isDir(root)) return null;
  if (isModelDir(root)) return root;
  if (depth <= 0) return null;
  let names = [];
  try {
    names = fs.readdirSync(root);
  } catch (e) {
    return null;
  }
  for (const n of names.sort()) {
    const sub = path.join(root, n);
    if (!isDir(sub)) continue;
    const hit = findModelDir(sub, depth - 1);
    if (hit) return hit;
  }
  return null;
}

// The engine versions that still support this model (it uses espeak-ng for pronunciation).
// From engine version 2 on, espeak-ng data is ignored and the engine asks for a lexicon file instead.
const ENGINE_VERSION = '1.12.23';
const INSTALL_CMD = 'npm.cmd install --save-exact sherpa-onnx-node@' + ENGINE_VERSION + ' sherpa-onnx-win-x64@' + ENGINE_VERSION;

function hasLexicon(dir) {
  try {
    return fs.readdirSync(dir).some((n) => /^lexicon.*\.txt$/i.test(n));
  } catch (e) {
    return false;
  }
}

/** null if fine, otherwise a readable message: the engine package is too new for a model without a lexicon */
function versionProblem(sherpa, dir) {
  const v = sherpa && typeof sherpa.version === 'string' ? sherpa.version : '';
  const m = /(\d+)/.exec(v);
  const major = m ? Number(m[1]) : 0;
  if (major >= 2 && dir && !hasLexicon(dir)) {
    return 'The voice engine package (version ' + v + ') is too new for this voice model. Install the matching version: ' + INSTALL_CMD;
  }
  return null;
}

function buildConfig(dir, threads) {
  return {
    model: {
      kokoro: {
        model: path.join(dir, 'model.onnx'),
        voices: path.join(dir, 'voices.bin'),
        tokens: path.join(dir, 'tokens.txt'),
        dataDir: path.join(dir, DATA_DIR)
      },
      debug: false,
      numThreads: threads,
      provider: 'cpu'
    },
    maxNumSentences: 1
  };
}

function createService({ requireSherpa }) {
  let sherpa = null;
  let tts = null;
  let loadedDir = null;

  function loadPackage() {
    if (sherpa) return null;
    try {
      sherpa = requireSherpa();
      return null;
    } catch (e) {
      return { ok: false, code: 'no-package', error: 'The voice engine is not installed yet. Run "npm.cmd install sherpa-onnx-node" in the project folder.' };
    }
  }

  function ensureEngine(voicesDir) {
    const bad = loadPackage();
    if (bad) return bad;
    const dir = findModelDir(voicesDir);
    if (!dir) return { ok: false, code: 'no-model', error: 'The voice model was not found. Put the kokoro-en-v0_19 folder inside the voices folder.' };
    const tooNew = versionProblem(sherpa, dir);
    if (tooNew) return { ok: false, code: 'engine-too-new', error: tooNew };
    if (tts && loadedDir === dir) return null;
    tts = null;
    loadedDir = null;
    try {
      const threads = Math.max(1, Math.min(4, (os.cpus() || []).length - 1));
      tts = new sherpa.OfflineTts(buildConfig(dir, threads));
      loadedDir = dir;
      return null;
    } catch (e) {
      return { ok: false, code: 'engine-failed', error: 'The voice engine could not load the model: ' + String((e && e.message) || e).slice(0, 200) };
    }
  }

  function synth({ text, sid, speed }) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 800);
    if (!clean) return { ok: false, code: 'empty', error: 'Nothing to read.' };
    const n = Number(tts.numSpeakers) || VOICES.length;
    const id = Math.min(n - 1, Math.max(0, Math.round(Number(sid) || 0)));
    const sp = Math.min(1.5, Math.max(0.5, Number(speed) || 1));
    let audio;
    try {
      // enableExternalBuffer:false = copy the samples into normal memory. Electron does not allow the engine's
      // default "external" buffers (they come back empty), so this must be off.
      if (typeof sherpa.GenerationConfig === 'function') {
        audio = tts.generate({
          text: clean,
          enableExternalBuffer: false,
          generationConfig: new sherpa.GenerationConfig({ sid: id, speed: sp, silenceScale: 0.2 })
        });
      } else {
        audio = tts.generate({ text: clean, sid: id, speed: sp, enableExternalBuffer: false });
      }
    } catch (e) {
      return { ok: false, code: 'synth-failed', error: 'The voice engine failed: ' + String((e && e.message) || e).slice(0, 200) };
    }
    if (!audio || !audio.samples || !audio.samples.length) {
      const info = audio ? ' (sampleRate ' + audio.sampleRate + ', samples ' + (audio.samples ? audio.samples.length : 'none') + ')' : '';
      return { ok: false, code: 'synth-failed', error: 'The voice engine returned no sound' + info + '. If you installed engine version 2, run: ' + INSTALL_CMD };
    }
    return { ok: true, sampleRate: audio.sampleRate, samples: new Float32Array(audio.samples) };
  }

  async function handle(msg) {
    if (!msg) return { ok: false, error: 'Empty request.' };
    if (msg.type === 'status') {
      const bad = loadPackage();
      const dir = findModelDir(msg.voicesDir);
      const problem = !bad && dir ? versionProblem(sherpa, dir) : null;
      return { ok: true, packageOk: !bad, modelDir: dir, voicesDir: msg.voicesDir, problem, ready: !bad && !!dir && !problem };
    }
    if (msg.type === 'synth') {
      const bad = ensureEngine(msg.voicesDir);
      if (bad) return bad;
      return synth(msg);
    }
    return { ok: false, error: 'Unknown request.' };
  }

  return { handle };
}

module.exports = { ENGINE_VERSION, INSTALL_CMD, versionProblem, createService, findModelDir, isModelDir, buildConfig, VOICES, MODEL_FILES, DATA_DIR };
