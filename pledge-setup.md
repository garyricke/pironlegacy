# Pledge capture → Netlify Forms

The pledge form on the landing page is wired to **Netlify Forms**. No backend, no third-party service — Netlify captures every submission automatically because the site is hosted there.

## How it's wired (already done in `index.html`)
- The `<form>` has `name="pledge" method="POST" data-netlify="true" netlify-honeypot="website"`.
- Hidden `<input name="form-name" value="pledge">` tells Netlify which form it is.
- A hidden `amount_display` field is filled by JS with a clean value (e.g. `$2,500`) so the dashboard record is readable even when "Other" is chosen.
- On submit, JS POSTs the form to Netlify via AJAX (no page reload) and shows an inline "thank you." If that POST ever fails, it falls back to opening a pre-filled email to `pledges@pironlegacy.org`, so a pledge is never lost.
- The off-screen `website` field is a honeypot; Netlify silently drops submissions that fill it.

## What you need to do once (in the Netlify dashboard)
1. **Deploy** (already happens on every `git push`). Netlify detects the form by parsing the deployed HTML — after the first deploy with these attributes, a form named **`pledge`** appears under **Site → Forms**.
2. **Submit one test pledge** on the live site to confirm it lands in **Forms → pledge**.
3. **Turn on notifications:** Site configuration → **Forms → Form notifications → Add notification → Email notification** → send to your inbox (e.g. gary.ricke@orbisdesign.com). Optionally add a Slack notification.
4. (Optional) **Spam filtering:** Netlify runs Akismet automatically; the honeypot adds a second layer.

## Fields captured per pledge
`amount` (radio value) · `amount_display` (clean $ string) · `otherAmount` · `name` · `email` · `phone` · `recognition` · `message` · `ack` (checkbox) — plus Netlify's timestamp.

## Notes / gotchas
- Netlify only registers the form if it's present in the **static HTML** at deploy time — it is, so detection is automatic. (The pre-launch password gate is just a visual overlay; the form markup is still in the HTML, so detection still works.)
- Exports: Forms → pledge → **Download CSV** any time.
- Free tier covers 100 submissions/month — plenty for a lead-donor campaign.
