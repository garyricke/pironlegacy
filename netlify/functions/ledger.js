// Admin endpoint: full pledge ledger (includes donor PII) + settings updates.
// Protected by a shared secret in the LEDGER_ADMIN_KEY env var — the visual
// password gate on the page is NOT sufficient for a data API, so this checks a
// real key on every request.
//
//   GET   -> { settings, submissions, totals }
//   POST  -> apply a settings patch, then return the recomputed ledger
//            body: { committee?, baseline?, baselineEnabled?, autoLive?, fallbackTotal?, overrides? }

const { getSettings, saveSettings, fetchSubmissions, compute } = require('./lib/core');

const ALLOWED = ['committee', 'baseline', 'baselineEnabled', 'autoLive', 'fallbackTotal', 'overrides'];

function json(statusCode, body) {
  return { statusCode: statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) };
}

exports.handler = async function (event) {
  const expected = process.env.LEDGER_ADMIN_KEY;
  const h = event.headers || {};
  const given = h['x-admin-key'] || h['X-Admin-Key'];
  if (!expected) return json(503, { error: 'admin_key_not_configured' });
  if (given !== expected) return json(401, { error: 'unauthorized' });

  try {
    let settings;
    if (event.httpMethod === 'POST') {
      let patch = {};
      try { patch = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'bad_json' }); }
      const clean = {};
      ALLOWED.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(patch, k)) clean[k] = patch[k]; });
      settings = await saveSettings(clean);
    } else {
      settings = await getSettings();
    }

    const subs = await fetchSubmissions();
    const out = compute(subs, settings);
    return json(200, { settings: settings, submissions: out.rows, totals: out.totals });
  } catch (e) {
    const code = (e && e.code) || 'error';
    const status = code === 'missing_credentials' ? 503 : 500;
    return json(status, { error: String(code), detail: String((e && e.message) || e) });
  }
};
