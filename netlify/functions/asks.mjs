// Committee ask list: serves the prospect list and records who is asking whom.
//
// Nothing private lives in this repo (it's public). The prospect list, the
// BFEE balance and the sponsor contacts are seeded straight into Netlify Blobs
// (store "committee-asks", key "data"); claims are one blob each under
// "claim/<prospect id>". The page at /asks only ever sees them through here.
//
// The edge gate already requires the committee password for /api/asks. This
// function checks the same cookie again, so the data stays sealed even if a
// request reaches /.netlify/functions/asks directly.

import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';

const STATUSES = ['claimed', 'reached', 'yes', 'no'];
const headers = { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };

// Functions v2 get the deploy's own Blobs context automatically, including
// the uncached edge URL that strong consistency needs (a v1 handler does not,
// and a stale personal API token fails with a 401 from Blobs).
function store() {
  return getStore({ name: 'committee-asks', consistency: 'strong' });
}

// Same derivation as adminToken() in the edge gate.
function token(secret, prefix) {
  return crypto.createHash('sha256').update(prefix + secret).digest('hex').slice(0, 32);
}

function authorized(req) {
  const cookies = (req.headers.get('cookie') || '').split(/;\s*/);
  const has = (name, value) => cookies.includes(name + '=' + value);
  const committee = Netlify.env.get('COMMITTEE_GATE_PASSWORD');
  const admin = Netlify.env.get('ADMIN_GATE_PASSWORD');
  if (committee && has('piron_committee', token(committee, 'piron-committee-v1:'))) return true;
  if (admin && has('piron_admin', token(admin, 'piron-admin-v1:'))) return true;
  return false;
}

// "dave b." and "Dave B" are the same person.
const same = (a, b) => String(a || '').trim().toLowerCase().replace(/\.$/, '') === String(b || '').trim().toLowerCase().replace(/\.$/, '');
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

async function allClaims(s) {
  const { blobs } = await s.list({ prefix: 'claim/' });
  const out = {};
  await Promise.all(blobs.map(async (b) => {
    const v = await s.get(b.key, { type: 'json' });
    if (v && v.who) out[b.key.slice(6)] = v;
  }));
  return out;
}

const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });

export default async function (req) {
  if (!authorized(req)) return reply(401, { error: 'password_required' });
  const s = store();

  try {
    if (req.method === 'GET') {
      const data = await s.get('data', { type: 'json' });
      if (!data) return reply(503, { error: 'not_seeded' });
      return reply(200, { data, claims: await allClaims(s) });
    }

    if (req.method !== 'POST') return reply(405, { error: 'method' });

    let body;
    try { body = await req.json(); } catch { return reply(400, { error: 'bad_json' }); }
    const id = clean(body.id, 80);
    const who = clean(body.who, 40);
    if (!id || !who) return reply(400, { error: 'missing' });

    const data = await s.get('data', { type: 'json' });
    if (!data || !(data.prospects || []).some((p) => p.id === id)) return reply(404, { error: 'unknown_prospect' });

    const key = 'claim/' + id;
    const current = await s.get(key, { type: 'json' });

    if (body.action === 'claim') {
      if (current && current.who && !same(current.who, who)) {
        return reply(409, { error: 'taken', claim: current, claims: await allClaims(s) });
      }
      await s.setJSON(key, { who, status: 'claimed', note: '', claimedAt: Date.now(), updated: Date.now() });
    } else if (body.action === 'update' || body.action === 'release') {
      if (!current) return reply(404, { error: 'not_claimed', claims: await allClaims(s) });
      if (!same(current.who, who)) return reply(403, { error: 'not_yours', claims: await allClaims(s) });
      if (body.action === 'release') {
        await s.delete(key);
      } else {
        const status = STATUSES.includes(body.status) ? body.status : current.status;
        const note = body.note === undefined ? current.note : clean(body.note, 280);
        await s.setJSON(key, { ...current, status, note, updated: Date.now() });
      }
    } else {
      return reply(400, { error: 'bad_action' });
    }

    return reply(200, { claims: await allClaims(s) });
  } catch (e) {
    return reply(500, { error: String((e && e.code) || (e && e.message) || e) });
  }
};
