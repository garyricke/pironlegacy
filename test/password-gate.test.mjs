/**
 * Unit test for the two-tier edge gate.
 * Runs the real handler against both PREVIEW_ENABLED states by rewriting the
 * one constant, so the post-launch behaviour is proven, not assumed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const SRC = new URL('../netlify/edge-functions/password-gate.js', import.meta.url).pathname;
const TMP = tmpdir();

const ADMIN_PW = 'test-admin-pw-9f3a';
process.env.ADMIN_GATE_PASSWORD = ADMIN_PW;

const source = readFileSync(SRC, 'utf8');

async function load(previewEnabled, tag) {
  const patched = source.replace(
    /const PREVIEW_ENABLED = (true|false);/,
    `const PREVIEW_ENABLED = ${previewEnabled};`
  );
  if (!/const PREVIEW_ENABLED = (true|false);/.test(source)) throw new Error('PREVIEW_ENABLED constant not found');
  const f = `${TMP}/gate-${tag}.mjs`;
  writeFileSync(f, patched);
  return (await import(f + '?v=' + tag)).default;
}

// Recompute the admin cookie the same way the gate does.
async function adminCookie(secret) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('piron-admin-v1:' + secret));
  const t = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  return `piron_admin=${t}`;
}

const PREVIEW_COOKIE = 'piron_gate=granted-2026-07';
const req = (url, cookie, method = 'GET') =>
  new Request(url, { method, headers: cookie ? { cookie } : {} });

const B = 'https://pironlegacy.org';
let fails = 0;

async function check(gate, label, request, expect) {
  const res = await gate(request);
  const got = res === undefined ? 'SERVE' : `HTTP ${res.status}`;
  const ok = got === expect;
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : '*** FAIL'}  ${label.padEnd(52)} ${got.padEnd(9)} (want ${expect})`);
}

/* ══ Phase 1: pre-launch, PREVIEW_ENABLED = true ══════════════════════ */
console.log('\n── PREVIEW_ENABLED = true  (now, pre-launch) ──────────────────────');
{
  const gate = await load(true, 'on');
  const AC = await adminCookie(ADMIN_PW);

  console.log(' public:');
  await check(gate, 'thank-you.html anonymous', req(`${B}/thank-you.html`), 'SERVE');
  await check(gate, 'thank-you.html + PayPal params', req(`${B}/thank-you.html?tx=9AB&amt=250.00`), 'SERVE');

  console.log(' preview tier (password "piron" / shared with Ashley):');
  await check(gate, 'homepage anonymous', req(`${B}/`), 'HTTP 401');
  await check(gate, 'homepage w/ preview cookie', req(`${B}/`, PREVIEW_COOKIE), 'SERVE');
  await check(gate, 'one-sheet PDF anonymous', req(`${B}/print/one-sheet.pdf`), 'HTTP 401');
  await check(gate, 'assets anonymous', req(`${B}/assets/dennis-piron.jpg`), 'HTTP 401');

  console.log(' admin tier — PREVIEW COOKIE MUST NOT BE ENOUGH:');
  await check(gate, 'pledges.html w/ preview cookie', req(`${B}/pledges.html`, PREVIEW_COOKIE), 'HTTP 401');
  await check(gate, 'status.html w/ preview cookie', req(`${B}/status.html`, PREVIEW_COOKIE), 'HTTP 401');
  await check(gate, 'outreach-email.html w/ preview cookie', req(`${B}/outreach-email.html`, PREVIEW_COOKIE), 'HTTP 401');
  await check(gate, 'pledges.html w/ admin cookie', req(`${B}/pledges.html`, AC), 'SERVE');
  await check(gate, 'admin cookie also grants preview', req(`${B}/`, AC), 'SERVE');
}

/* ══ Phase 2: post-launch, PREVIEW_ENABLED = false ════════════════════ */
console.log('\n── PREVIEW_ENABLED = false  (Aug 1, site public) ──────────────────');
{
  const gate = await load(false, 'off');
  const AC = await adminCookie(ADMIN_PW);

  console.log(' public site — open to everyone:');
  await check(gate, 'homepage anonymous', req(`${B}/`), 'SERVE');
  await check(gate, 'one-sheet PDF anonymous', req(`${B}/print/one-sheet.pdf`), 'SERVE');
  await check(gate, 'assets anonymous', req(`${B}/assets/dennis-piron.jpg`), 'SERVE');
  await check(gate, 'api/committed anonymous (barometer)', req(`${B}/api/committed`), 'SERVE');
  await check(gate, 'pledge form POST passes to Netlify Forms', req(`${B}/`, null, 'POST'), 'SERVE');

  console.log(' *** THE CASE THAT MATTERS: admin STILL locked after launch ***');
  await check(gate, 'pledges.html anonymous', req(`${B}/pledges.html`), 'HTTP 401');
  await check(gate, 'pledges (extensionless)', req(`${B}/pledges`), 'HTTP 401');
  await check(gate, 'status.html anonymous', req(`${B}/status.html`), 'HTTP 401');
  await check(gate, 'outreach-email.html anonymous', req(`${B}/outreach-email.html`), 'HTTP 401');
  await check(gate, 'pledges.html w/ stale preview cookie', req(`${B}/pledges.html`, PREVIEW_COOKIE), 'HTTP 401');
  await check(gate, 'pledges.html w/ admin cookie', req(`${B}/pledges.html`, AC), 'SERVE');

  console.log(' path-matching probes against the admin tier:');
  await check(gate, '/pledges.html?x=1 (query cannot dodge)', req(`${B}/pledges.html?x=1`), 'HTTP 401');
  await check(gate, '/pledges/export.csv', req(`${B}/pledges/export.csv`), 'HTTP 401');
  await check(gate, '/status/ (trailing slash)', req(`${B}/status/`), 'HTTP 401');
  await check(gate, '/x/pledges.html (not admin, public now)', req(`${B}/x/pledges.html`), 'SERVE');
}

/* ══ Phase 3: fail-closed when the env var is missing ═════════════════ */
console.log('\n── ADMIN_GATE_PASSWORD unset  (misconfigured deploy) ──────────────');
{
  const STALE = await adminCookie(ADMIN_PW);
  delete process.env.ADMIN_GATE_PASSWORD;
  const gate = await load(false, 'noenv');
  await check(gate, 'pledges.html anonymous -> sealed, not served', req(`${B}/pledges.html`), 'HTTP 503');
  await check(gate, 'pledges.html w/ previously-valid cookie', req(`${B}/pledges.html`, STALE), 'HTTP 503');
  await check(gate, 'public site unaffected', req(`${B}/`), 'SERVE');
  process.env.ADMIN_GATE_PASSWORD = ADMIN_PW;
}

/* ══ Phase 4: password rotation invalidates old sessions ══════════════ */
console.log('\n── Rotating ADMIN_GATE_PASSWORD ───────────────────────────────────');
{
  const OLD = await adminCookie(ADMIN_PW);
  process.env.ADMIN_GATE_PASSWORD = 'a-different-password';
  const gate = await load(false, 'rotated');
  await check(gate, 'old admin cookie rejected after rotation', req(`${B}/pledges.html`, OLD), 'HTTP 401');
  await check(gate, 'new admin cookie accepted', req(`${B}/pledges.html`, await adminCookie('a-different-password')), 'SERVE');
}

console.log(fails ? `\n${fails} FAILURE(S)\n` : '\nAll gate cases behave correctly.\n');
process.exit(fails ? 1 : 0);
