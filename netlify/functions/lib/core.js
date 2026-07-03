// Shared logic for the pledge ledger.
//
// Source of truth for submissions = Netlify Forms (the "pledge" form). We never
// duplicate that data — we read it live from the Netlify API and layer a small
// settings blob on top (committee list, baseline, per-submission overrides).
//
// The public committed total = baseline (if enabled) + every "applied" pledge.
// A pledge is applied automatically UNLESS the donor's name exactly matches a
// committee member (already inside the baseline) — and any row can be forced
// on/off with a manual override.

const { getStore } = require('@netlify/blobs');

const GOAL = 40000;
const DEFAULT_BASELINE = 18000;
const DEFAULT_FALLBACK = 23000; // shown publicly until the counter is flipped "live"

const DEFAULT_SETTINGS = {
  committee: [],            // committee member names — exact (normalized) match => excluded from the counter
  baseline: DEFAULT_BASELINE,
  baselineEnabled: true,
  autoLive: false,          // false => public counter returns fallbackTotal; true => returns the live computed total
  fallbackTotal: DEFAULT_FALLBACK,
  overrides: {}             // { [submissionId]: 'include' | 'exclude' }
};

function store() {
  // Configure Blobs explicitly via the Netlify API using the creds we already
  // have. This avoids relying on the auto-injected Blobs context, which isn't
  // always present in the function runtime (that made setJSON throw -> 500).
  var opts = { name: 'pledge-ledger', consistency: 'strong' };
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_API_TOKEN) {
    opts.siteID = process.env.NETLIFY_SITE_ID;
    opts.token = process.env.NETLIFY_API_TOKEN;
  }
  return getStore(opts);
}

async function getSettings() {
  let saved = null;
  try { saved = await store().get('settings', { type: 'json' }); } catch (e) { saved = null; }
  return Object.assign({}, DEFAULT_SETTINGS, saved || {}, {
    overrides: Object.assign({}, (saved && saved.overrides) || {})
  });
}

async function saveSettings(patch) {
  const current = await getSettings();
  const next = Object.assign({}, current, patch);
  await store().setJSON('settings', next);
  return next;
}

function normName(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseAmount(v) {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

// Pull every "pledge" submission from the Netlify Forms API.
async function fetchSubmissions() {
  const token = process.env.NETLIFY_API_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;
  if (!token || !siteId) { const e = new Error('missing_credentials'); e.code = 'missing_credentials'; throw e; }

  const url = 'https://api.netlify.com/api/v1/sites/' + siteId + '/submissions?per_page=300';
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) { const e = new Error('forms_api_' + r.status); e.code = 'forms_api'; throw e; }
  const all = await r.json();

  return (Array.isArray(all) ? all : [])
    .filter(function (s) { return (s.form_name || s.form) === 'pledge'; })
    .map(function (s) {
      const d = s.data || {};
      return {
        id: String(s.id),
        date: s.created_at || d.created_at || '',
        name: String(d.name || s.name || '').trim(),
        email: String(d.email || s.email || '').trim(),
        recognition: String(d.recognition || '').trim(),
        message: String(d.message || '').trim(),
        amount: parseAmount(d.pledge_amount) || parseAmount(d.amount)
      };
    });
}

// Decide each row's status given settings.
//   excluded  — manual override off (not counted)
//   included  — manual override on  (counted, overriding a committee-name match)
//   baseline  — name matches a committee member (already in the baseline; not counted)
//   counted   — new non-committee pledge (counted on top of the baseline)
function classify(sub, settings, committeeSet) {
  const ov = settings.overrides && settings.overrides[sub.id];
  if (ov === 'exclude') return 'excluded';
  if (ov === 'include') return 'included';
  if (committeeSet.has(normName(sub.name))) return 'baseline';
  return 'counted';
}

function isApplied(status) { return status === 'counted' || status === 'included'; }

function compute(subs, settings) {
  const committeeSet = new Set((settings.committee || []).map(normName));
  let counted = 0, baseSum = 0, all = 0, appliedCount = 0;

  const rows = subs.map(function (sub) {
    const status = classify(sub, settings, committeeSet);
    all += sub.amount;
    if (isApplied(status)) { counted += sub.amount; appliedCount++; }
    else if (status === 'baseline') baseSum += sub.amount;
    return Object.assign({}, sub, { status: status });
  });

  const baseline = settings.baselineEnabled ? (settings.baseline || 0) : 0;
  const committed = baseline + counted;

  return {
    rows: rows,
    totals: {
      baseline: baseline,
      counted: counted,
      baselinePledges: baseSum,
      all: all,
      committed: committed,
      publicShown: settings.autoLive ? committed : (settings.fallbackTotal || 0),
      goal: GOAL,
      appliedCount: appliedCount,
      submissionCount: rows.length
    }
  };
}

module.exports = {
  GOAL: GOAL,
  DEFAULT_FALLBACK: DEFAULT_FALLBACK,
  getSettings: getSettings,
  saveSettings: saveSettings,
  fetchSubmissions: fetchSubmissions,
  compute: compute,
  normName: normName,
  parseAmount: parseAmount
};
