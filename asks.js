// Committee ask list (/asks). Everything private comes from /api/asks, which
// sits behind the committee password; this file holds no names.
(function () {
  'use strict';
  var STATUSES = [['claimed', 'Claimed'], ['reached', 'Reached out'], ['yes', 'Said yes'], ['no', 'Not this time']];
  var NAME_KEY = 'piron_asks_name';
  var data = null, claims = {}, filter = 'A', q = '', shown = 40, pendingClaim = null, busy = false;

  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var money = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
  var same = function (a, b) { return String(a || '').trim().toLowerCase().replace(/\.$/, '') === String(b || '').trim().toLowerCase().replace(/\.$/, ''); };

  function myName() { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return window.__name || ''; } }
  function setMyName(n) { try { localStorage.setItem(NAME_KEY, n); } catch (e) { window.__name = n; } renderMe(); }

  function toast(t) { var el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 2600); }

  function renderMe() {
    var n = myName();
    $('#me').innerHTML = n
      ? 'You’re <b>' + esc(n) + '</b>. <button type="button" id="me-change">Not you? Change name</button>'
      : '';
  }

  function api(method, body) {
    return fetch('/api/asks', {
      method: method, credentials: 'same-origin', cache: 'no-store',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.json().then(function (j) { j.__status = r.status; return j; }); });
  }

  function renderStand() {
    var bal = data.balance, goal = data.goal || 50000, gap = Math.max(0, goal - bal);
    $('#n-bal').textContent = money(bal);
    $('#n-asof').textContent = 'BFEE balance, ' + data.asOfLabel;
    $('#n-gap').textContent = money(gap);
    $('#n-goal').textContent = money(goal);
    $('#barfill').style.width = Math.min(100, bal / goal * 100).toFixed(1) + '%';
    $('#bar').setAttribute('aria-label', money(bal) + ' of ' + money(goal) + ' raised');
    var approx = '$' + (Math.round(gap / 100) * 100).toLocaleString('en-US');
    $('#gap-sub').textContent = 'About ' + approx + ' from unlocking ' + money(goal) + '. Two or three sizable gifts from the list below close it. Confirm with Ashley that the whole balance counts toward the community half before we say the number outside the committee.';
    var gl = $('#gapline'); if (gl) gl.textContent = '“We’re about ' + approx + ' from unlocking the full ' + money(goal) + ' match.”';
  }

  function renderVendors() {
    var V = data.vendors || [], known = V.filter(function (v) { return v.h && v.h.length; }).length;
    var football = V.filter(function (v) { return !v.camp; }).length;
    $('#vendors-sub').innerHTML = 'Bob asked for the vendors who’ve worked with the coach. Dennis already listed them: his May 2020 thank-you to sponsors names ' + football + ' football sponsors and ' + (V.length - football) + ' summer-camp sponsors. <b>We know someone at ' + known + ' of the ' + V.length + '.</b> Brian or Dennis can fill in the rest and add newer sponsors.';
    $('#vendors-sum').textContent = 'See all ' + V.length + ' sponsors and who we know at each';
    $('#vendors-body').innerHTML = V.map(function (v) {
      return '<tr><td>' + esc(v.b) + (v.camp ? ' <small>camp</small>' : '') + '</td><td>' + (v.h && v.h.length ? esc(v.h.join(', ')) : '<span class="muted">No one yet. Ask Brian or Dennis.</span>') + '</td></tr>';
    }).join('');
  }

  var ICON_PHONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>';
  var ICON_MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/></svg>';
  // Tier A only: the data from /api/asks carries ph/em for those cards and nothing for the rest.
  function contact(p) {
    var bits = [];
    if (p.ph) bits.push('<a href="tel:' + esc(p.ph.replace(/\D/g, '')) + '">' + ICON_PHONE + esc(p.ph) + '</a>');
    (p.em || []).forEach(function (e) { bits.push('<a href="mailto:' + esc(e) + '">' + ICON_MAIL + esc(e) + '</a>'); });
    return bits.length ? '<div class="contact">' + bits.join('') + '</div>' : '';
  }

  function rows() {
    var me = myName();
    return data.prospects.filter(function (p) {
      var c = claims[p.id];
      if (filter === 'A' && p.t !== 'A') return false;
      if (filter === 'B' && p.t !== 'B') return false;
      if (filter === 'open' && (c || p.a)) return false;
      if (filter === 'claimed' && !c) return false;
      if (filter === 'mine' && !(c && me && same(c.who, me))) return false;
      if (q && (p.n + ' ' + p.co + ' ' + p.ti).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function render() {
    if (!data) return;
    var vals = Object.keys(claims).map(function (k) { return claims[k]; });
    $('#st-a').textContent = data.prospects.filter(function (p) { return p.t === 'A'; }).length;
    $('#st-b').textContent = data.prospects.filter(function (p) { return p.t === 'B'; }).length;
    $('#st-claimed').textContent = vals.length;
    $('#st-yes').textContent = vals.filter(function (c) { return c.status === 'yes'; }).length;
    var r = rows(), list = $('#list'), me = myName();
    if (!r.length) {
      var msg = filter === 'mine' ? (me ? 'You haven’t claimed anyone yet. Pick someone from Tier A or B and press Claim.' : 'Claim someone first, and your list shows up here.')
        : filter === 'claimed' ? 'No one is claimed yet. Be the first.' : 'No one matches. Try another search.';
      list.innerHTML = '<div class="empty">' + msg + '</div>'; $('#more').hidden = true; return;
    }
    list.innerHTML = r.slice(0, shown).map(function (p) {
      var c = claims[p.id], mine = c && me && same(c.who, me);
      var chips = p.w.map(function (w) { return '<span class="chip">' + esc(w) + '</span>'; }).join('') + (p.a ? '<span class="chip asg">Assigned in June: ' + esc(p.a) + '</span>' : '');
      var act;
      if (c) {
        var st = STATUSES.filter(function (s) { return s[0] === c.status; })[0] || STATUSES[0];
        var when = c.updated ? new Date(c.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        act = '<span class="status st-' + st[0] + '">' + st[1] + '</span><span class="owner">' + (mine ? 'You' : esc(c.who)) + (when ? ' · ' + when : '') + '</span>';
        if (mine) act += '<select data-st="' + p.id + '" aria-label="How it went with ' + esc(p.n) + '">' + STATUSES.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === c.status ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select><button class="link" data-rel="' + p.id + '" type="button">Release</button>';
      } else {
        act = '<button class="claim" data-claim="' + p.id + '" type="button">Claim</button>';
      }
      var note = mine ? '<div class="note"><input data-note="' + p.id + '" value="' + esc(c.note || '') + '" maxlength="280" placeholder="Note for the committee: date, amount, next step" aria-label="Note about ' + esc(p.n) + '"></div>'
        : (c && c.note ? '<div class="note co">' + esc(c.note) + '</div>' : '');
      return '<article class="p' + (mine ? ' mine' : '') + '"><div class="tier ' + p.t + '" aria-label="Tier ' + p.t + '">' + p.t + '</div><div><h3>' + esc(p.n) + '</h3><div class="co">' + esc([p.co, p.ti].filter(Boolean).join(' · ')) + '</div>' + contact(p) + '<div class="chips">' + chips + '</div></div><div class="act">' + act + '</div>' + note + '</article>';
    }).join('');
    $('#more').hidden = r.length <= shown;
  }

  function send(body, okMsg) {
    if (busy) return; busy = true;
    api('POST', body).then(function (j) {
      busy = false;
      if (j.claims) claims = j.claims;
      if (j.__status === 409) toast(esc(j.claim && j.claim.who) + ' just claimed this one.');
      else if (j.__status === 403) toast('Only ' + (claims[body.id] ? claims[body.id].who : 'the person who claimed it') + ' can change this one.');
      else if (j.__status === 401) { toast('Your password expired. Reloading…'); setTimeout(function () { location.reload(); }, 1200); }
      else if (j.__status >= 400) toast('That didn’t save. Try again.');
      else if (okMsg) toast(okMsg);
      render();
    }, function () { busy = false; toast('No connection. Try again.'); });
  }

  function claim(id) {
    var n = myName();
    if (!n) { pendingClaim = id; $('#nb-in').value = ''; $('#namebox').showModal(); return; }
    var p = data.prospects.filter(function (x) { return x.id === id; })[0];
    send({ action: 'claim', id: id, who: n }, p.n + ' is yours. Find them under Mine.');
  }

  function load() {
    return api('GET').then(function (j) {
      if (j.__status === 401) { location.reload(); return; }
      if (!j.data) { $('#list').innerHTML = '<div class="empty">The list isn’t available right now. Tell Gary.</div>'; return; }
      var first = !data;
      data = j.data; claims = j.claims || {};
      if (first) {
        renderStand(); renderVendors();
        if (data.callout) { $('#callout').innerHTML = data.callout; $('#callout').hidden = false; }
      }
      render();
    }, function () { if (!data) $('#list').innerHTML = '<div class="empty">Couldn’t load the list. Check your connection and reload.</div>'; });
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.f) { filter = b.dataset.f; shown = 40; document.querySelectorAll('.seg button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); render(); }
    else if (b.dataset.claim) claim(b.dataset.claim);
    else if (b.dataset.rel) send({ action: 'release', id: b.dataset.rel, who: myName() }, 'Released. Someone else can take it now.');
    else if (b.id === 'more') { shown += 40; render(); }
    else if (b.id === 'me-change') { pendingClaim = null; $('#nb-in').value = myName(); $('#namebox').showModal(); }
    else if (b.id === 'nb-cancel') { pendingClaim = null; $('#namebox').close(); }
  });
  $('#nb-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var n = $('#nb-in').value.trim().slice(0, 40);
    if (!n) { $('#nb-in').focus(); return; }
    setMyName(n); $('#namebox').close(); render();
    if (pendingClaim) { var id = pendingClaim; pendingClaim = null; claim(id); }
  });
  document.addEventListener('change', function (e) {
    var s = e.target.closest('select[data-st]');
    if (s) send({ action: 'update', id: s.dataset.st, who: myName(), status: s.value }, 'Saved.');
    var n = e.target.closest('input[data-note]');
    if (n) send({ action: 'update', id: n.dataset.note, who: myName(), note: n.value }, 'Note saved.');
  });
  $('#q').addEventListener('input', function (e) { q = e.target.value.trim().toLowerCase(); shown = 40; render(); });
  var copy = $('#copy-email');
  if (copy) copy.addEventListener('click', function () {
    var t = Array.prototype.map.call(document.querySelectorAll('.em .in p, .em .match, .em table.tiers tr'), function (el) { return el.innerText.replace(/\t/g, '  '); }).join('\n\n');
    var txt = 'Subject: Coach Piron’s last season, and a match that doubles your gift\n\n' + t;
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast('Email text copied.'); }, function () {
      var r = document.createRange(); r.selectNodeContents(document.querySelector('.em .in')); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('Selected. Press Cmd+C to copy.');
    });
  });

  renderMe(); load();
  // Keep everyone's view current without anyone pressing reload.
  setInterval(function () { if (!document.hidden && !busy && !document.activeElement.matches('input[data-note]')) load(); }, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
})();
