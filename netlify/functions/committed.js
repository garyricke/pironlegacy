// Public endpoint: returns ONLY the committed dollar total (no donor data).
// The landing page fetches this to drive the barometer, and falls back to its
// hardcoded number if anything here is unavailable.

const { getSettings, fetchSubmissions, compute, GOAL, DEFAULT_FALLBACK } = require('./lib/core');

exports.handler = async function () {
  const headers = {
    'content-type': 'application/json',
    'cache-control': 'public, max-age=60',
    'access-control-allow-origin': '*'
  };

  try {
    const settings = await getSettings();

    // Until the ledger is flipped "live", keep showing the stable manual number.
    if (!settings.autoLive) {
      return { statusCode: 200, headers: headers, body: JSON.stringify({
        committed: settings.fallbackTotal || DEFAULT_FALLBACK, goal: GOAL, live: false
      }) };
    }

    const subs = await fetchSubmissions();
    const out = compute(subs, settings);
    return { statusCode: 200, headers: headers, body: JSON.stringify({
      committed: out.totals.committed, goal: GOAL, appliedCount: out.totals.appliedCount,
      lastPledgeAt: out.totals.lastAppliedDate, live: true
    }) };
  } catch (e) {
    // Never break the page — signal null so the client keeps its fallback.
    return { statusCode: 200, headers: headers, body: JSON.stringify({
      committed: null, goal: GOAL, error: String((e && e.code) || (e && e.message) || e)
    }) };
  }
};
