/**
 * Site-wide password gate — temporary, until we go public again.
 *
 * Runs at the edge on every request (see [[edge_functions]] in netlify.toml),
 * so nothing is served without the password: HTML, the one-sheet PDF, images,
 * and the /api/* functions are all withheld until the visitor is authorized.
 * Like real server-side auth (and unlike the old in-page JS gate), this is what
 * keeps the site out of search results — a crawler only ever gets the gate page
 * (which is noindex and carries no real content), never the actual pages.
 *
 * UX: instead of the browser's native Basic-Auth dialog (which forces an
 * unbranded Username + Password prompt), this serves a BRANDED page with a
 * SINGLE password field. A correct password sets a cookie; every later request
 * carries the cookie and passes straight through.
 *
 * The password is not a secret worth hiding (it is already plain text on the
 * site), so it stays hardcoded rather than a Netlify env var — a "piron" env
 * value would trip secret scanning by matching the substring across the build.
 *
 * To go public: delete the [[edge_functions]] block in netlify.toml (this file
 * can stay, dormant, for next time). Bump COOKIE_TOKEN to force everyone to
 * re-enter the password.
 */

const PASSWORD = "piron";
const COOKIE_NAME = "piron_gate";
const COOKIE_TOKEN = "granted-2026-07"; // bump to invalidate existing sessions
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/**
 * Paths served WITHOUT the password, even while the rest of the site is private.
 *
 * /thank-you.html is where PayPal returns donors after a completed donation.
 * It has to be public for two reasons:
 *   1. PayPal VALIDATES the Auto Return URL when the setting is saved and
 *      refuses to activate Auto Return if the URL doesn't resolve — a 401
 *      would silently block the whole feature.
 *   2. A donor bounced back from PayPal must never hit a password wall
 *      moments after giving money.
 *
 * Keep this list as short as possible — every entry is a hole in the gate.
 * The thank-you page is deliberately self-contained (fonts + badge load from
 * Google/Cloudinary, nothing from /assets), so this one path is all it needs.
 * The page carries its own noindex, so opening it does not expose the campaign
 * to search while the main site is still private.
 */
const PUBLIC_PATHS = new Set(["/thank-you.html", "/thank-you"]);

const BADGE =
  "https://res.cloudinary.com/dsbllwpbh/image/upload/f_auto,q_auto,w_220/v1782508679/piron-legacy/piron-legacy-badge.png";

function htmlHeaders() {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

function gatePage(showError) {
  const err = showError
    ? `<p id="pw-error">Incorrect password. Try again.</p>`
    : `<p id="pw-error"></p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Dennis Piron Legacy Scholarship — Private Preview</title>
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
    <h1>Private Preview</h1>
    <p class="sub">This site isn't public yet. Enter the password to view it.</p>
    <input id="pw-input" type="password" name="password" placeholder="Enter password" autocomplete="current-password" autofocus required>
    <button id="pw-btn" type="submit">Enter</button>
    ${err}
  </form>
</body>
</html>`;
}

export default async (request) => {
  const cookieHeader = request.headers.get("cookie") || "";
  const authorized = cookieHeader
    .split(/;\s*/)
    .some((c) => c === `${COOKIE_NAME}=${COOKIE_TOKEN}`);

  // Already authorized — serve the real asset / function.
  if (authorized) return;

  const url = new URL(request.url);

  // Explicitly public paths bypass the gate (see PUBLIC_PATHS above). Compared
  // against the pathname only, so query strings PayPal appends (?tx=…&amt=…)
  // don't defeat the match. Trailing slash normalized; matching is exact, so
  // this can't be widened by a crafted path.
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (PUBLIC_PATHS.has(path)) return;

  // A password submission (only unauthorized visitors reach here; an authorized
  // visitor's form posts — e.g. the pledge form — pass through above via cookie).
  if (request.method === "POST") {
    let password = "";
    try {
      const form = await request.formData();
      password = String(form.get("password") || "");
    } catch {
      password = "";
    }
    if (password === PASSWORD) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: url.pathname + url.search,
          "Set-Cookie": `${COOKIE_NAME}=${COOKIE_TOKEN}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
          "Cache-Control": "no-store",
        },
      });
    }
    return new Response(gatePage(true), { status: 401, headers: htmlHeaders() });
  }

  // Unauthorized GET (or anything else) — show the branded gate.
  return new Response(gatePage(false), { status: 401, headers: htmlHeaders() });
};
