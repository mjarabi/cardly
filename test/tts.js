// Tests the natural-voice logic with a fake engine and fake model folders (no real model needed).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createService, findModelDir, VOICES } = require('../src/tts-core');

let passed = 0;
async function t(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    console.error('FAIL  ' + name + '\n      ' + e.message);
    process.exitCode = 1;
  }
}

function makeModel(dir) {
  fs.mkdirSync(path.join(dir, 'espeak-ng-data'), { recursive: true });
  for (const f of ['model.onnx', 'voices.bin', 'tokens.txt']) fs.writeFileSync(path.join(dir, f), 'x');
}

function fakeSherpa(withGenCfg) {
  const log = { configs: [], calls: [] };
  class OfflineTts {
    constructor(cfg) {
      log.configs.push(cfg);
      this.numSpeakers = 11;
    }
    generate(req) {
      log.calls.push(req);
      return { samples: new Float32Array([0, 0.5, -0.5, 0.25]), sampleRate: 24000 };
    }
  }
  const mod = { OfflineTts };
  if (withGenCfg) mod.GenerationConfig = class { constructor(o) { Object.assign(this, o); } };
  return { mod, log };
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cardly-tts-'));
  console.log('Natural voice');

  await t('model folder is found directly, one level down and two levels down', () => {
    const a = path.join(root, 'a');
    makeModel(a);
    assert.strictEqual(findModelDir(a), a);
    const b = path.join(root, 'b');
    makeModel(path.join(b, 'kokoro-en-v0_19'));
    assert.strictEqual(findModelDir(b), path.join(b, 'kokoro-en-v0_19'));
    const c = path.join(root, 'c');
    makeModel(path.join(c, 'x', 'kokoro-en-v0_19'));
    assert.strictEqual(findModelDir(c), path.join(c, 'x', 'kokoro-en-v0_19'));
  });
  await t('incomplete or missing folders are not accepted', () => {
    const d = path.join(root, 'd');
    fs.mkdirSync(path.join(d, 'espeak-ng-data'), { recursive: true });
    fs.writeFileSync(path.join(d, 'model.onnx'), 'x');
    assert.strictEqual(findModelDir(d), null);
    assert.strictEqual(findModelDir(path.join(root, 'nope')), null);
  });
  await t('status: package missing, model missing, ready', async () => {
    const voices = path.join(root, 'v1');
    fs.mkdirSync(voices);
    let s = await createService({ requireSherpa: () => { throw new Error('Cannot find module'); } }).handle({ type: 'status', voicesDir: voices });
    assert.deepStrictEqual([s.packageOk, s.modelDir, s.ready], [false, null, false]);
    s = await createService({ requireSherpa: () => fakeSherpa().mod }).handle({ type: 'status', voicesDir: voices });
    assert.deepStrictEqual([s.packageOk, s.modelDir, s.ready], [true, null, false]);
    makeModel(path.join(voices, 'kokoro-en-v0_19'));
    s = await createService({ requireSherpa: () => fakeSherpa().mod }).handle({ type: 'status', voicesDir: voices });
    assert.strictEqual(s.ready, true);
  });
  await t('synth explains what is missing', async () => {
    const empty = path.join(root, 'v2');
    fs.mkdirSync(empty);
    let r = await createService({ requireSherpa: () => { throw new Error('x'); } }).handle({ type: 'synth', voicesDir: empty, text: 'hi' });
    assert.strictEqual(r.code, 'no-package');
    r = await createService({ requireSherpa: () => fakeSherpa().mod }).handle({ type: 'synth', voicesDir: empty, text: 'hi' });
    assert.strictEqual(r.code, 'no-model');
  });
  await t('synth returns samples, builds the right config, loads the model once', async () => {
    const voices = path.join(root, 'v3');
    makeModel(path.join(voices, 'kokoro-en-v0_19'));
    const { mod, log } = fakeSherpa(true);
    const svc = createService({ requireSherpa: () => mod });
    const r1 = await svc.handle({ type: 'synth', voicesDir: voices, text: '  Hello   world ', sid: 7, speed: 0.9 });
    assert.ok(r1.ok && r1.sampleRate === 24000 && r1.samples.length === 4);
    await svc.handle({ type: 'synth', voicesDir: voices, text: 'again', sid: 1, speed: 1 });
    assert.strictEqual(log.configs.length, 1, 'model loaded once');
    const k = log.configs[0].model.kokoro;
    assert.ok(k.model.endsWith('model.onnx') && k.voices.endsWith('voices.bin') && k.tokens.endsWith('tokens.txt') && k.dataDir.endsWith('espeak-ng-data'));
    assert.strictEqual(log.calls[0].text, 'Hello world');
    assert.strictEqual(log.calls[0].generationConfig.sid, 7);
    assert.strictEqual(log.calls[0].generationConfig.speed, 0.9);
  });
  await t('copy mode is requested (Electron cannot use the engine external buffers)', async () => {
    for (const withCfg of [true, false]) {
      const f = fakeSherpa(withCfg);
      const svc = createService({ requireSherpa: () => f.mod });
      const v = path.join(root, 'ext' + withCfg);
      makeModel(v);
      const r = await svc.handle({ type: 'synth', voicesDir: v, text: 'Hello', sid: 1, speed: 1 });
      assert.strictEqual(r.ok, true);
      assert.strictEqual(f.log.calls[0].enableExternalBuffer, false);
    }
  });
  await t('engine version 2 with a model that has no lexicon is refused with the fix command', async () => {
    const f = fakeSherpa(true);
    f.mod.version = '2.0.0';
    const svc = createService({ requireSherpa: () => f.mod });
    const v = path.join(root, 'v2');
    makeModel(v);
    const st = await svc.handle({ type: 'status', voicesDir: v });
    assert.strictEqual(st.ready, false);
    assert.ok(/too new/.test(st.problem));
    const r = await svc.handle({ type: 'synth', voicesDir: v, text: 'Hello', sid: 1, speed: 1 });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'engine-too-new');
    assert.ok(/sherpa-onnx-node@1\.12\.23/.test(r.error));
    // a model folder that has a lexicon is fine with version 2
    fs.writeFileSync(path.join(v, 'lexicon-us-en.txt'), 'x');
    assert.strictEqual((await svc.handle({ type: 'status', voicesDir: v })).ready, true);
    // version 1.12.x is fine
    const g = fakeSherpa(true);
    g.mod.version = '1.12.23';
    const svc2 = createService({ requireSherpa: () => g.mod });
    const w = path.join(root, 'v1');
    makeModel(w);
    assert.strictEqual((await svc2.handle({ type: 'status', voicesDir: w })).ready, true);
  });
  await t('older engine versions without GenerationConfig still work', async () => {
    const voices = path.join(root, 'v4');
    makeModel(voices);
    const { mod, log } = fakeSherpa(false);
    const r = await createService({ requireSherpa: () => mod }).handle({ type: 'synth', voicesDir: voices, text: 'x', sid: 99, speed: 5 });
    assert.ok(r.ok);
    assert.strictEqual(log.calls[0].sid, 10, 'speaker id is clamped');
    assert.strictEqual(log.calls[0].speed, 1.5, 'speed is clamped');
  });
  await t('engine errors become readable messages', async () => {
    const voices = path.join(root, 'v5');
    makeModel(voices);
    const broken = { OfflineTts: class { constructor() { throw new Error('bad model file'); } } };
    let r = await createService({ requireSherpa: () => broken }).handle({ type: 'synth', voicesDir: voices, text: 'x' });
    assert.ok(r.code === 'engine-failed' && /bad model file/.test(r.error));
    const throwing = { OfflineTts: class { constructor() { this.numSpeakers = 11; } generate() { throw new Error('boom'); } } };
    r = await createService({ requireSherpa: () => throwing }).handle({ type: 'synth', voicesDir: voices, text: 'x' });
    assert.ok(r.code === 'synth-failed' && /boom/.test(r.error));
    r = await createService({ requireSherpa: () => fakeSherpa().mod }).handle({ type: 'synth', voicesDir: voices, text: '   ' });
    assert.strictEqual(r.code, 'empty');
  });
  await t('11 voices listed', () => assert.strictEqual(VOICES.length, 11));

  try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* cleaned up by the system later */ }
  console.log(`\n${passed} natural-voice tests passed`);
})();
