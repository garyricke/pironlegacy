/**
 * Two-tier edge gate.
 *
 * There are two completely independent things being protected, and conflating
 * them is how internal pages leak:
 *
 *   TIER 1 — PREVIEW.  "The public site isn't finished yet." Low stakes. The
 *     password is shareable (committee, the Foundation, anyone reviewing) and
 *     exists mainly to keep the unfinished page out of search results. It is
 *     switched off for good when the campaign goes public.
 *
 *   TIER 2 — ADMIN.  The internal pages (pledge ledger, status log, outreach
 *     drafts). These must stay locked FOREVER — before launch, after launch,
 *     regardless of Tier 1. The password is strong, lives in a Netlify env var,
 *     and is never shared or committed.
 *
 * GOING PUBLIC IS ONE LINE: set PREVIEW_ENABLED to false below.
 * Do NOT remove the [[edge_functions]] block from netlify.toml — that block is
 * what keeps Tier 2 running. Deleting it unlocks every admin page at once,
 * which is exactly the accident this structure exists to prevent.
 *
 * Tier 2 FAILS CLOSED: if ADMIN_GATE_PASSWORD is unset or empty, admin paths
 * are refused outright rather than served. A misconfigured deploy locks Gary
 * out; it never exposes the ledger.
 *
 * Defence in depth: reaching /pledges is not the same as reading donor data.
 * The ledger API (netlify/functions/ledger.js) separately requires
 * LEDGER_ADMIN_KEY on every request, so the page alone yields nothing.
 */

/* ── Tier 1: preview ───────────────────────────────────────────────────── */

// Flip to false to open the public site. Admin stays locked either way.
const PREVIEW_ENABLED = true;

const PASSWORD = "piron"; // shareable; deliberately weak, guards nothing private
const COOKIE_NAME = "piron_gate";
const COOKIE_TOKEN = "granted-2026-07"; // bump to invalidate existing sessions

/* ── Tier 2: admin ─────────────────────────────────────────────────────── */

// Set in Netlify → Site configuration → Environment variables. Never hardcode
// it: the reason the Tier 1 password is inline is that the literal "piron"
// matches "pironlegacy" throughout the build output and trips Netlify's secret
// scanning. A random admin password appears nowhere in the build, so it has no
// such problem and belongs in an env var.
const ADMIN_ENV_VAR = "ADMIN_GATE_PASSWORD";
const ADMIN_COOKIE_NAME = "piron_admin";

// Anything matching these is Tier 2. Anchored at the start of the path so a
// crafted suffix (/x/pledges.html) can't slip past, and prefix-based so
// /pledges, /pledges.html and /pledges/anything are all covered.
const ADMIN_PATHS = [
  /^\/pledges(\.html)?(\/|$)/,
  /^\/status(\.html)?(\/|$)/,
  /^\/outreach-email(\.html)?(\/|$)/,
];

/* ── Always public ─────────────────────────────────────────────────────── */

/**
 * Served without any password, in either tier.
 *
 * /thank-you.html is where PayPal returns donors after a completed donation.
 * It must be public because PayPal VALIDATES the return URL and refuses to
 * activate Auto Return if it can't fetch the page — and because a donor
 * bounced back from PayPal must never hit a password wall moments after
 * giving money. The page carries its own noindex, so opening it does not
 * expose the campaign to search while the site is still private.
 *
 * Keep this list as short as possible — every entry is a hole in the gate.
 */
const PUBLIC_PATHS = new Set(["/thank-you.html", "/thank-you"]);

const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const BADGE =
  "https://res.cloudinary.com/dsbllwpbh/image/upload/f_auto,q_auto,w_220/v1782508679/piron-legacy/piron-legacy-badge.png";

/* ── Helpers ───────────────────────────────────────────────────────────── */

// Reads an env var across the Netlify edge runtime, plain Deno, and Node (the
// last one so the gate can be unit-tested locally before it ships).
function readEnv(name) {
  try {
    if (typeof Netlify !== "undefined" && Netlify.env) return Netlify.env.get(name) || "";
  } catch { /* not on Netlify */ }
  try {
    if (typeof Deno !== "undefined" && Deno.env) return Deno.env.get(name) || "";
  } catch { /* not Deno, or no env permission */ }
  try {
    if (typeof process !== "undefined" && process.env) return process.env[name] || "";
  } catch { /* not Node */ }
  return "";
}

// Length-independent comparison, so a wrong guess can't be narrowed down by
// timing it. (Length itself still leaks; that's inherent and harmless here.)
function safeEqual(a, b) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

// The admin cookie value is derived from the password, so ROTATING
// ADMIN_GATE_PASSWORD automatically invalidates every outstanding admin
// session — no separate token to remember to bump.
async function adminToken(secret) {
  const data = new TextEncoder().encode("piron-admin-v1:" + secret);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

function hasCookie(request, name, value) {
  return (request.headers.get("cookie") || "")
    .split(/;\s*/)
    .some((c) => c === `${name}=${value}`);
}

function htmlHeaders() {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

/* ── Gate page ─────────────────────────────────────────────────────────── */

function gatePage({ admin = false, error = false, locked = false } = {}) {
  const title = locked
    ? "Admin Unavailable"
    : admin
      ? "Admin Access"
      : "Private Preview";
  const sub = locked
    ? "The admin password isn't configured on this deploy, so these pages are sealed. Set ADMIN_GATE_PASSWORD in Netlify to restore access."
    : admin
      ? "This is an internal page. Enter the admin password."
      : "This site isn't public yet. Enter the password to view it.";
  const err = error
    ? `<p id="pw-error">Incorrect password. Try again.</p>`
    : `<p id="pw-error"></p>`;
  const form = locked
    ? ""
    : `<input id="pw-input" type="password" name="password" placeholder="Enter password" autocomplete="current-password" autofocus required>
    <button id="pw-btn" type="submit">Enter</button>
    ${err}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Dennis Piron Legacy Scholarship — ${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@800;900&family=Open+Sans:wght@400;600&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;}
  html,body{height:100%;margin:0;}
  body{background:radial-gradient(125% 125% at 50% 0%, #2a1416 0%, #140d0d 46%, #000 100%);display:flex;align-items:center;justify-content:center;font-family:'Open Sans',sans-serif;padding:24px;}
  body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(250,204,8,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(250,204,8,.05) 1px,transparent 1px);background-size:42px 42px;pointer-events:none;}
  #pw-box{position:relative;background:rgba(255,255,255,.04);border:1px solid color-mix(in srgb, #FACC08 25%, transparent);border-radius:18px;padding:46px 40px;text-align:center;width:min(400px,90vw);box-shadow:0 24px 80px rgba(0,0,0,.55);}
  #pw-box img{height:96px;margin:0 auto 22px;display:block;}
  #pw-box h1{font-family:'Montserrat',sans-serif;font-weight:900;font-size:1.5rem;color:#FACC08;letter-spacing:.02em;margin:0 0 8px;}
  #pw-box .sub{font-size:.88rem;color:rgba(236,236,236,.6);margin:0 0 26px;line-height:1.5;}
  #pw-input{width:100%;padding:12px 16px;background:rgba(0,0,0,.3);border:1px solid color-mix(in srgb, #FACC08 30%, transparent);border-radius:8px;color:#fff;font-size:.95rem;font-family:inherit;outline:none;transition:border-color .2s;}
  #pw-input:focus{border-color:#FACC08;}
  #pw-btn{margin-top:14px;width:100%;padding:12px;background:#FACC08;color:#161310;border:0;border-radius:8px;font-family:'Montserrat',sans-serif;font-weight:800;font-size:.95rem;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;transition:background .2s;}
  #pw-btn:hover{background:#ffd84d;}
  #pw-error{font-size:.8rem;color:#ff7a7a;margin:12px 0 0;min-height:1.2em;}
</style>
</head>
<body>
  <form id="pw-box" method="POST" autocomplete="on">
    <img src="${BADGE}" alt="Dennis Piron Legacy Scholarship" onerror="this.style.display='none'">
    <h1>${title}</h1>
    <p class="sub">${sub}</p>
    ${form}
  </form>
</body>
</html>`;
}

function redirectWithCookies(url, cookies) {
  const headers = new Headers({
    Location: url.pathname + url.search,
    "Cache-Control": "no-store",
  });
  // append() rather than set() — multiple Set-Cookie headers on one response.
  cookies.forEach((c) => headers.append("Set-Cookie", c));
  return new Response(null, { status: 303, headers });
}

async function submittedPassword(request) {
  try {
    const form = await request.formData();
    return String(form.get("password") || "");
  } catch {
    return "";
  }
}

/* ── Handler ───────────────────────────────────────────────────────────── */

export default async (request) => {
  const url = new URL(request.url);
  // Normalize once. Matching is done on the pathname only, so query strings
  // (PayPal appends ?tx=…&amt=…) can never affect which tier a request lands in.
  const path = url.pathname.replace(/\/+$/, "") || "/";

  // Always public.
  if (PUBLIC_PATHS.has(path)) return;

  /* Tier 2 — admin. Checked BEFORE the preview tier and independently of it,
     so turning the preview off never unlocks these. */
  if (ADMIN_PATHS.some((re) => re.test(path))) {
    const adminPassword = readEnv(ADMIN_ENV_VAR);

    // Fail closed. No password configured => nobody gets in, including via a
    // stale cookie (there is no token to match against).
    if (!adminPassword) {
      return new Response(gatePage({ admin: true, locked: true }), {
        status: 503,
        headers: htmlHeaders(),
      });
    }

    const token = await adminToken(adminPassword);
    if (hasCookie(request, ADMIN_COOKIE_NAME, token)) return;

    if (request.method === "POST") {
      if (safeEqual(await submittedPassword(request), adminPassword)) {
        // Grant the preview cookie too: admin is strictly higher trust, so an
        // admin shouldn't be asked for the preview password separately.
        return redirectWithCookies(url, [
          `${ADMIN_COOKIE_NAME}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
          `${COOKIE_NAME}=${COOKIE_TOKEN}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
        ]);
      }
      return new Response(gatePage({ admin: true, error: true }), {
        status: 401,
        headers: htmlHeaders(),
      });
    }

    return new Response(gatePage({ admin: true }), {
      status: 401,
      headers: htmlHeaders(),
    });
  }

  /* Tier 1 — preview. Everything else. */

  // Public launch: serve normally. This must come before the POST handling
  // below, so the pledge form's POST reaches Netlify Forms instead of being
  // mistaken for a password submission.
  if (!PREVIEW_ENABLED) return;

  if (hasCookie(request, COOKIE_NAME, COOKIE_TOKEN)) return;

  // Admin is strictly higher trust than preview, so a valid admin session also
  // satisfies this tier — otherwise an admin whose preview cookie was cleared
  // or expired independently gets re-prompted for a password they've already
  // outranked. Hashing only happens when an admin cookie is actually present,
  // so the ordinary preview visitor costs nothing extra.
  const adminPassword = readEnv(ADMIN_ENV_VAR);
  if (adminPassword && (request.headers.get("cookie") || "").includes(`${ADMIN_COOKIE_NAME}=`)) {
    if (hasCookie(request, ADMIN_COOKIE_NAME, await adminToken(adminPassword))) return;
  }

  if (request.method === "POST") {
    if (safeEqual(await submittedPassword(request), PASSWORD)) {
      return redirectWithCookies(url, [
        `${COOKIE_NAME}=${COOKIE_TOKEN}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
      ]);
    }
    return new Response(gatePage({ error: true }), {
      status: 401,
      headers: htmlHeaders(),
    });
  }

  return new Response(gatePage(), { status: 401, headers: htmlHeaders() });
};
