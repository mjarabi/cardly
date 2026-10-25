/* Minimal client for any "OpenAI-compatible" chat endpoint (DeepSeek, OpenRouter, Groq, OpenAI, Ollama, ...).
 * The fetch function is passed in, so main.js can use Electron's net.fetch (which follows the system proxy / VPN)
 * and the tests can use a local fake server. */

function endpoint(baseUrl) {
  let u = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) throw new Error('The server address must start with http:// or https://');
  if (!/\/chat\/completions$/i.test(u)) u += '/chat/completions';
  return u;
}

function friendly(status, apiMsg) {
  const m = apiMsg ? ' (' + apiMsg + ')' : '';
  if (status === 401 || status === 403) return 'The server rejected the API key' + m + '. Check the key in Settings.';
  if (status === 402) return 'Your account has no balance left' + m + '. Top it up on the provider site.';
  if (status === 404) return 'Not found' + m + '. Check the server address and the model name.';
  if (status === 400 || status === 422) return 'The server did not accept the request' + m + '. The model name may be wrong.';
  if (status === 429) return 'Too many requests or the free quota is used up' + m + '. Wait a little and try again.';
  if (status >= 500) return 'The AI server had a problem (' + status + ')' + m + '. Try again in a moment.';
  return 'Request failed (' + status + ')' + m;
}

async function chat({ baseUrl, apiKey, model, messages, fetchFn, timeoutMs = 120000, temperature = 0.3 }) {
  let url;
  try {
    url = endpoint(baseUrl);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (!String(model || '').trim()) return { ok: false, error: 'Enter a model name in Settings first.' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey && String(apiKey).trim()) headers.Authorization = 'Bearer ' + String(apiKey).trim();
    const res = await fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: String(model).trim(), messages, temperature, stream: false }),
      signal: ctrl.signal
    });
    const raw = await res.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      /* not JSON */
    }
    if (!res.ok) {
      const apiMsg = data && data.error ? (typeof data.error === 'string' ? data.error : data.error.message) : '';
      return { ok: false, status: res.status, error: friendly(res.status, apiMsg ? String(apiMsg).slice(0, 200) : '') };
    }
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'The server answered, but the reply was empty.' };
    return { ok: true, text };
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, error: 'The server took too long to answer. Try again, or use fewer words per batch.' };
    return { ok: false, error: 'Could not reach the server. Check your internet. If you use a VPN or proxy, make sure it is on. (' + (e && (e.cause && e.cause.code || e.message) || 'network error') + ')' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { chat, endpoint };
