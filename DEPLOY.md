# Deploy — pironlegacy.org

Static site. Two files do the work: `index.html` (landing page) and `one-sheet.html` (print leave-behind). Both are self-contained; the only external dependencies are Google Fonts, the Cloudinary-hosted portrait, and the Vimeo videos.

## Recommended host: Cloudflare Pages (you already own the domain at Cloudflare)

1. Push this folder to a GitHub repo (or use Cloudflare's "Direct Upload").
   - **Do NOT commit `.env`** — it's already git-ignored. It holds live API keys.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages**.
3. Connect the repo (or drag-and-drop the folder for Direct Upload).
4. Build settings: **Framework preset = None**, Build command = *(empty)*, Output directory = `/` (root).
5. Deploy. You'll get a `*.pages.dev` URL.
6. **Custom domain:** Pages project → Custom domains → add `pironlegacy.org` and `www.pironlegacy.org`. Since the domain is already in your Cloudflare account, DNS records are added automatically. HTTPS is automatic.

Alternative hosts (all free, same result): Netlify drag-and-drop, or GitHub Pages.

## Email: pledges@pironlegacy.org

The page and one-sheet reference `pledges@pironlegacy.org`. Set it up free with **Cloudflare Email Routing**:
- Cloudflare → your domain → **Email → Email Routing → Enable**.
- Add a custom address `pledges@pironlegacy.org` → forward to a real inbox (e.g. gary.ricke@orbisdesign.com or a committee Gmail).
- Until this is configured, the pledge form's email-fallback link still opens, but the address won't receive mail. Set this up before launch.

## Pledge capture

Out of the box the pledge form uses an **email fallback** — on submit it opens the donor's email client pre-filled to `pledges@pironlegacy.org`. That works on day one with zero backend.

To capture pledges silently into a **Google Sheet** instead (recommended for a week-long push so nothing gets lost), follow `pledge-setup.md` and paste the resulting Apps Script URL into `PLEDGE_API_URL` near the bottom of `index.html`.

## After you go live

- Test the QR on the one-sheet with a phone — it points to `https://pironlegacy.org`.
- Confirm the Vimeo hero + tribute videos play (they're reused from the INCubator project and already public).
- Update the OG image if you want link previews to show a custom card (currently uses the default).
