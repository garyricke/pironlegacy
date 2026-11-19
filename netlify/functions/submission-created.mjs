/* ===========================================================================
   Netlify Function: submission-created
   Emails scholarship applications through Resend (same setup as Unified Wire).

   The filename is what connects it: Netlify runs a function with this exact
   name each time a form submission passes its spam filter. Netlify Forms still
   stores every submission; this only sends the notification email, so the
   Foundation's inbox doesn't have to be a Netlify team member.

   Env vars (Netlify -> Site configuration -> Environment variables):
     RESEND_API_KEY - sending-only key for websiteformrequests.com; mark secret
     OWNER_EMAIL    - site owner's address, for ORBIS-TEST submissions and the
                      fallback (kept out of the repo on purpose)
   Without RESEND_API_KEY this logs an error and sends nothing (submissions are
   still stored in Netlify Forms).

   SCHOLARSHIP APPLICATIONS go ONLY to the Batavia Foundation (Ashley Murtaugh,
   Nov 19 2026: "They should come to info@bataviafoundation.org."). Committee
   members, including the selection committee, should not receive them; Ashley
   checks each one is complete and compiles them for the selection committee.
   Do NOT add anyone from the committee to that list.
   =========================================================================== */

const FROM = 'Piron Legacy Scholarship Website <forms@websiteformrequests.com>';
const SITE = 'pironlegacy.org';

const OWNER = process.env.OWNER_EMAIL || '';
const FOUNDATION = 'info@bataviafoundation.org';

const RECIPIENTS = {
  'scholarship-application': [FOUNDATION],
};

// A form missing from the list above still gets delivered, never dropped
const FALLBACK = OWNER ? [OWNER] : [FOUNDATION];

// Internal forms that keep their own Netlify email notification
const SKIP = new Set(['pledge', 'card-approval']);

const SUBJECT_LABEL = {
  'scholarship-application': 'New scholarship application',
};

// A submission whose first name starts with this goes only to OWNER_EMAIL, so the
// whole path can be tested on the live site without emailing the Foundation.
const TEST_MARKER = 'ORBIS-TEST';

// Netlify adds these to every submission; they're noise for staff
const HIDDEN = new Set(['ip', 'user_agent', 'referrer', 'bot-field', 'form-name']);

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const isFile = (v) => v && typeof v === 'object' && typeof v.url === 'string';
const isEmail = (v) => typeof v === 'string' && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(v.trim());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function titleCase(name) {
  return String(name).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// The submission as ordered rows, in the form's own field order
function rowsFrom(payload) {
  const data = payload.data || {};
  const ordered = (payload.ordered_human_fields || []).map((f) => f.name);
  const names = [...new Set([...ordered, ...Object.keys(data)])].filter((n) => !HIDDEN.has(n));
  const titles = Object.fromEntries((payload.ordered_human_fields || []).map((f) => [f.name, f.title]));

  return names
    .map((name) => {
      const value = data[name];
      const label = String(titles[name] || titleCase(name)).replace(/\s+/g, ' ').trim();
      if (isFile(value)) return { label, file: value };
      if (value == null || value === '') return null;
      return { label, value: Array.isArray(value) ? value.join(', ') : String(value) };
    })
    .filter(Boolean);
}

function buildEmail(payload, rows) {
  const form = payload.form_name || 'form';
  const data = payload.data || {};
  const full = [data['first-name'], data['last-name']].filter(Boolean).join(' ');
  const who = String(data.name || full || data.email || 'Website visitor').replace(/\s+/g, ' ').trim();
  const subject = `${SUBJECT_LABEL[form] || `New ${titleCase(form)} submission`}: ${who}`.slice(0, 200);

  const files = rows.filter((r) => r.file);
  const replyNote = isEmail(data.email)
    ? 'Reply to this email to answer the student directly.'
    : 'No email address was given.';
  const fileNote = (r) => `${r.file.filename || 'File'} (attached, and in Netlify Forms)`;

  const htmlRows = rows.map((r) => `
    <tr>
      <td valign="top" style="padding:10px 16px 10px 0;border-top:1px solid #dce3ed;color:#4a5568;font-size:14px;width:150px">${esc(r.label)}</td>
      <td valign="top" style="padding:10px 0;border-top:1px solid #dce3ed;color:#1a2535;font-size:15px;white-space:pre-wrap">${esc(r.file ? fileNote(r) : r.value)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#ffffff;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
    <tr><td style="font-size:20px;font-weight:bold;color:#0A1628;padding-bottom:16px">${esc(subject)}</td></tr>
    <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${htmlRows}</table></td></tr>
    <tr><td style="padding-top:20px;border-top:1px solid #dce3ed;color:#4a5568;font-size:13px">
      Sent from the ${esc(titleCase(form))} form on ${SITE}. ${replyNote}
    </td></tr>
  </table>
</body></html>`;

  const text = [
    subject,
    '',
    ...rows.map((r) => `${r.label}: ${r.file ? fileNote(r) : r.value}`),
    '',
    `Sent from the ${titleCase(form)} form on ${SITE}. ${replyNote}`,
  ].join('\n');

  const attachments = files.map((r) => ({ path: r.file.url, filename: r.file.filename || 'attachment' }));
  const replyTo = isEmail(data.email) ? data.email.trim() : undefined;

  return { subject, html, text, attachments, replyTo };
}

async function post(body, idempotencyKey, apiKey) {
  // Resend limits requests per second, so wait and retry when told to slow down
  for (let attempt = 1; ; attempt++) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    const detail = await res.text();
    if (res.status === 429 && attempt < 4) { await sleep(1000 * attempt); continue; }
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 300)}`);
  }
}

// One email per recipient, so Resend logs each address's delivery separately
// and a bad address can't take the others down with it.
async function sendTo(to, email, payload, apiKey) {
  const body = {
    from: FROM,
    to: [to],
    subject: email.subject,
    html: email.html,
    text: email.text,
    ...(email.replyTo ? { reply_to: email.replyTo } : {}),
    tags: [{ name: 'form', value: String(payload.form_name || 'unknown').replace(/[^\w-]/g, '_') }],
  };
  const key = `${payload.id}-${to}`;

  if (!email.attachments.length) return post(body, key, apiKey);

  try {
    return await post({ ...body, attachments: email.attachments }, `${key}-a`, apiKey);
  } catch (err) {
    // Never lose the notification over a bad attachment: the file is still in Netlify
    console.error(`Attachment send failed for ${to}, retrying without it: ${err.message}`);
    return post(body, key, apiKey);
  }
}

export const handler = async (event) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set: form notification NOT sent');
    return { statusCode: 500, body: 'Not configured' };
  }

  const { payload } = JSON.parse(event.body);
  if (SKIP.has(payload.form_name)) return { statusCode: 200, body: 'Skipped' };
  const rows = rowsFrom(payload);
  const email = buildEmail(payload, rows);

  const name = String(payload.data?.name || payload.data?.['first-name'] || '');
  const isTest = name.startsWith(TEST_MARKER);
  if (isTest && !OWNER) {
    console.log(`${payload.form_name} #${payload.number}: test submission, OWNER_EMAIL not set, nothing sent`);
    return { statusCode: 200, body: 'Test, not sent' };
  }
  const recipients = isTest ? [OWNER] : RECIPIENTS[payload.form_name] || FALLBACK;

  let failures = 0;
  for (const to of recipients) {
    try {
      const { id } = await sendTo(to, email, payload, apiKey);
      console.log(`${payload.form_name} #${payload.number}: accepted for ${to} (${id})`);
    } catch (err) {
      failures++;
      console.error(`${payload.form_name} #${payload.number}: FAILED for ${to}: ${err.message}`);
    }
    await sleep(600);
  }

  return { statusCode: failures ? 500 : 200, body: failures ? 'Some sends failed' : 'OK' };
};
