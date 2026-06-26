# Pledge capture → Google Sheet (optional but recommended)

This wires the pledge form on `index.html` to a Google Sheet via a free Google Apps Script Web App — the same pattern the INCubator comments page already uses. ~10 minutes.

## 1. Create the sheet
1. New Google Sheet, name it **Piron Legacy — Pledges**.
2. Row 1 headers (exact order): `timestamp | amount | name | email | phone | recognition | message | contingent_ack`

## 2. Add the Apps Script
1. In the sheet: **Extensions → Apps Script**.
2. Replace the default code with:

```javascript
const SHEET_NAME = 'Sheet1'; // tab name

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    sheet.appendRow([
      new Date(),
      data.amount || '',
      data.name || '',
      data.email || '',
      data.phone || '',
      data.recognition || '',
      data.message || '',
      data.contingent_ack ? 'yes' : 'no'
    ]);
    return json({ status: 'ok' });
  } catch (err) {
    return json({ status: 'error', error: String(err) });
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. **Deploy → New deployment → type: Web app.**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy, authorize, and copy the **Web App URL** (ends in `/exec`).

## 3. Connect the page
In `index.html`, find near the bottom:

```js
const PLEDGE_API_URL = '';
```

Paste your URL:

```js
const PLEDGE_API_URL = 'https://script.google.com/macros/s/AKfyc...../exec';
```

Re-deploy the site. Pledges now land in the sheet, and the donor sees a "thank you" inline instead of an email popup.

## 4. (Recommended) Get notified on each pledge
In Apps Script, add inside `doPost`, right after `appendRow`:

```javascript
MailApp.sendEmail('gary.ricke@orbisdesign.com',
  'New Piron pledge: ' + (data.amount || ''),
  data.name + ' (' + data.email + ') — ' + (data.phone || 'no phone') + '\n' + (data.message || ''));
```

## Notes
- The form posts JSON with **no Content-Type header** on purpose — that keeps it a "simple" CORS request so Apps Script doesn't need a preflight.
- A honeypot field (`website`) blocks basic bots. The form also requires the contingency checkbox.
- If `PLEDGE_API_URL` is ever blank or unreachable, the form automatically falls back to the email-to-committee flow, so you never lose a pledge.
