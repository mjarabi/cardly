// Tests the AI client against a tiny fake OpenAI-style server running on this computer.
const assert = require('assert');
const http = require('http');
const { chat, endpoint } = require('../src/aiclient');

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

const seen = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    seen.push({ url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null });
    const send = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (req.headers.authorization === 'Bearer bad') return send(401, { error: { message: 'Authentication Fails' } });
    if (req.headers.authorization === 'Bearer poor') return send(402, { error: { message: 'Insufficient Balance' } });
    if (req.headers.authorization === 'Bearer slow') return setTimeout(() => send(200, {}), 500);
    send(200, { choices: [{ message: { content: '[{"word":"abandon"}]' } }] });
  });
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const ok = { baseUrl: base + '/v1/', model: 'm', messages: [{ role: 'user', content: 'hi' }], fetchFn: fetch };

  console.log('AI client');
  await t('address handling', () => {
    assert.strictEqual(endpoint('https://api.deepseek.com/'), 'https://api.deepseek.com/chat/completions');
    assert.strictEqual(endpoint('https://x.com/v1/chat/completions'), 'https://x.com/v1/chat/completions');
    assert.throws(() => endpoint('api.deepseek.com'));
  });
  await t('successful call sends key, model and messages', async () => {
    const r = await chat({ ...ok, apiKey: ' sk-1 ' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.text, '[{"word":"abandon"}]');
    const last = seen[seen.length - 1];
    assert.strictEqual(last.url, '/v1/chat/completions');
    assert.strictEqual(last.auth, 'Bearer sk-1');
    assert.strictEqual(last.body.model, 'm');
    assert.strictEqual(last.body.messages[0].content, 'hi');
  });
  await t('no key: no Authorization header (local servers)', async () => {
    await chat({ ...ok, apiKey: '' });
    assert.strictEqual(seen[seen.length - 1].auth, undefined);
  });
  await t('wrong key and empty balance give clear messages', async () => {
    const a = await chat({ ...ok, apiKey: 'bad' });
    assert.ok(!a.ok && /API key/.test(a.error) && /Authentication Fails/.test(a.error));
    const b = await chat({ ...ok, apiKey: 'poor' });
    assert.ok(!b.ok && /balance/.test(b.error));
  });
  await t('timeout', async () => {
    const r = await chat({ ...ok, apiKey: 'slow', timeoutMs: 100 });
    assert.ok(!r.ok && /too long/.test(r.error));
  });
  await t('unreachable server', async () => {
    const r = await chat({ ...ok, baseUrl: 'http://127.0.0.1:1', apiKey: 'x' });
    assert.ok(!r.ok && /Could not reach/.test(r.error));
  });
  await t('missing model', async () => {
    const r = await chat({ ...ok, model: ' ' });
    assert.ok(!r.ok && /model/.test(r.error));
  });

  server.close();
  console.log(`\n${passed} AI tests passed`);
})();
