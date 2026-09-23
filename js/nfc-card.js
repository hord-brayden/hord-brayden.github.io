/* ============================================================
   nfc-card.js — business-card NFC experience.

   The chip on the card points at  /?via=nfc
     1st scan on a device  → short, skippable "get in touch" form
     later scans           → "how this card works" guide + tutorials

   Does nothing unless ?via=nfc is present, so normal visits are
   untouched. Test helpers (append to the URL):
     &reset=1          clear this device's scan state
     &view=form|guide  force a specific view
   ============================================================ */

(function () {
  'use strict';

  // Google Apps Script web-app URL (see apps-script/README.md).
  // Empty = TEST MODE: submissions are logged to the console, not sent.
  const ENDPOINT = 'https://script.google.com/macros/s/AKfycbzsagBCzYSY2MR4gmudgp2YidT61FUi05U_eGHykfmWq_JFtV8PwWBBf0D6SaEJiUCzXQ/exec';

  const STORE_KEY = 'nfcCard.v1';
  const CARD_URL = 'https://hord-brayden.github.io/?via=nfc';
  const NFC_TOOLS_IOS = 'https://apps.apple.com/app/nfc-tools/id1252962749';
  const NFC_TOOLS_ANDROID = 'https://play.google.com/store/apps/details?id=com.wakdev.wdnfc';

  const params = new URLSearchParams(location.search);
  if (params.get('via') !== 'nfc') return;

  // ------------------------------------------------------------
  // State (per device, best-effort — storage can be unavailable)
  // ------------------------------------------------------------
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch (e) { return null; }
  }
  function save(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  const initialView = params.get('view');

  if (params.get('reset') === '1') {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  const state = load() || { scans: 0, stage: 'new', first: new Date().toISOString() };
  state.scans += 1;
  save(state);

  // Strip our params so a refresh or a shared link doesn't re-trigger.
  ['via', 'reset', 'view'].forEach((k) => params.delete(k));
  const qs = params.toString();
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);

  function track(name, extra) {
    // Event names/stages only — never form contents.
    if (typeof window.gtag === 'function') window.gtag('event', name, extra || {});
  }

  // ------------------------------------------------------------
  // Content
  // ------------------------------------------------------------
  const TUTORIALS = [
    {
      id: 'sms',
      title: 'Tap to text someone',
      blurb: 'A tag by the front door that drafts "Home safe ❤️" to your partner. Or a card that texts you.',
      record: 'SMS',
      steps: [
        'NFC Tools → <b>Write</b> → <b>Add a record</b> → <b>SMS</b>.',
        'Enter the phone number and the message body.',
        'Tap <b>Write</b>, then hold the top of your phone to the card.'
      ],
      note: 'Both platforms open Messages with the text ready. The person scanning still taps Send, since phones never text on their own.'
    },
    {
      id: 'maps',
      title: 'Directions to a place',
      blurb: 'Put it on a party invite, an Airbnb welcome book, or your shop counter: one tap starts turn-by-turn navigation.',
      record: 'URL',
      steps: [
        'Find the place in Google Maps and copy its coordinates or address.',
        'Build a link: <code>https://www.google.com/maps/dir/?api=1&amp;destination=40.7608,-111.8910</code>',
        'NFC Tools → <b>Write</b> → <b>Add a record</b> → <b>URL / URI</b> → paste it → <b>Write</b>.'
      ],
      note: 'Use this https link rather than NFC Tools’ "Location" record. That record writes a <code>geo:</code> link, which Android understands but iPhones ignore.'
    },
    {
      id: 'wifi',
      title: 'Share your Wi-Fi without spelling the password',
      blurb: 'Stick it under the coffee table. Guests tap, they’re online.',
      record: 'Wi-Fi network',
      steps: [
        'NFC Tools → <b>Write</b> → <b>Add a record</b> → <b>Wi-Fi network</b>.',
        'Enter the network name (SSID), security type (usually WPA2/WPA3), and password.',
        'Write it, then test with a friend’s Android phone.'
      ],
      note: 'Android joins the network straight from the tag. iPhones don’t act on Wi-Fi tags, so put a Wi-Fi QR code next to it (the iPhone Camera app joins from those). Only do this for a guest network, because anyone who taps the tag can read the password.'
    },
    {
      id: 'btc',
      title: 'Bitcoin (or Lightning) tip jar',
      blurb: 'Busker, bartender, open-source maintainer: tap to tip.',
      record: 'URL / URI',
      steps: [
        'Copy a <b>receive</b> address from your wallet.',
        'Write a URI record: <code>bitcoin:bc1q…yourAddress?label=Tips</code>',
        'Or, for Lightning, a URL to your Lightning-address or tip page.'
      ],
      note: 'Android hands <code>bitcoin:</code> links to your wallet app. iPhones may not open custom links like that from a tag, so a https tip page works on both. Only ever put a public receive address on a tag. <b>Never a seed phrase or private key.</b>'
    },
    {
      id: 'shortcut',
      title: 'Make the tag a physical button (no rewrite needed)',
      blurb: 'Tap your nightstand to start a sleep playlist, dim the lights and set an alarm. Tap your car mount to open Maps.',
      record: 'none, reads the chip’s ID',
      steps: [
        '<b>iPhone:</b> Shortcuts → <b>Automation</b> → <b>+</b> → <b>NFC</b> → <b>Scan</b>, then tap this card.',
        'Add any actions you like: Focus modes, HomeKit scenes, music, a timer, logging a glass of water.',
        'Set it to <b>Run Immediately</b>. <b>Android:</b> use NFC Tools’ companion app <i>NFC Tasks</i>, or Tasker.'
      ],
      note: 'Shortcuts identifies the chip by its serial number, not by what’s written on it. So you can turn <i>this exact card</i> into a trigger and it will still point to me for everyone else.'
    },
    {
      id: 'card',
      title: 'Your own tap-to-connect business card',
      blurb: 'Point a sticker at your LinkedIn, portfolio, or a link page, and hand people a card that does something.',
      record: 'URL',
      steps: [
        'NFC Tools → <b>Write</b> → <b>Add a record</b> → <b>URL / URI</b>.',
        'Paste your link and write it to a blank NTAG215 sticker.',
        'Stick it to the back of your card or phone case.'
      ],
      note: 'You can also write a <b>Contact</b> (vCard) record, but it fills the chip quickly. A link to a page with a “Save contact” button fits better.'
    },
    {
      id: 'more',
      title: 'Quick hits',
      blurb: 'Other things one tap can do:',
      record: 'various',
      steps: [
        '<b>Call</b>: a <code>tel:+15555550123</code> record for a "call the front desk" tag.',
        '<b>Email draft</b>: an Email record with the to, subject and body filled in (great for "report a problem" stickers).',
        '<b>Review link</b>: your Google Business review URL on the checkout counter.',
        '<b>Plant or gear log</b>: a URL to a Google Form that records the date you watered it, filtered it or serviced it.'
      ]
    }
  ];

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function tutorialHtml(t, i) {
    return `
      <details class="nfc-tut">
        <summary>
          <span class="nfc-tut__num">${String(i + 1).padStart(2, '0')}</span>
          <span class="nfc-tut__title">${t.title}</span>
          <span class="nfc-tut__rec">${t.record}</span>
        </summary>
        <div class="nfc-tut__body">
          <p>${t.blurb}</p>
          <ol>${t.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
          ${t.note ? `<p class="nfc-tut__note">${t.note}</p>` : ''}
        </div>
      </details>`;
  }

  // ------------------------------------------------------------
  // Dialog shell
  // ------------------------------------------------------------
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'css/nfc-card.css';
  document.head.appendChild(css);

  const dlg = document.createElement('dialog');
  dlg.className = 'nfc-dialog';
  dlg.setAttribute('aria-labelledby', 'nfc-title');
  document.body.appendChild(dlg);

  function open(html) {
    dlg.innerHTML = `<button type="button" class="nfc-close" aria-label="Close">&times;</button>${html}`;
    dlg.querySelector('.nfc-close').addEventListener('click', close);
    dlg.scrollTop = 0;
    if (!dlg.open) {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
      document.documentElement.classList.add('nfc-lock');
    }
  }
  function markSkipped() {
    if (state.stage === 'new') { state.stage = 'skipped'; save(state); track('nfc_contact_skip'); }
  }
  function close() {
    markSkipped();
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }
  // Also fires for Escape, which bypasses close()
  dlg.addEventListener('close', () => {
    document.documentElement.classList.remove('nfc-lock');
    markSkipped();
  });
  // Click on the backdrop closes
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });

  // ------------------------------------------------------------
  // View: first-scan contact form
  // ------------------------------------------------------------
  function showForm() {
    const openedAt = Date.now();
    open(`
      <div class="nfc-pane">
        <span class="kicker kicker--accent">you just tapped my card</span>
        <h2 id="nfc-title">Hey, it’s Brayden.</h2>
        <p class="nfc-lede">Leave a way to reach you and I’ll follow up personally. It takes 10 seconds, or skip it and look around.</p>
        ${ENDPOINT ? '' : '<p class="nfc-testmode">TEST MODE · no endpoint set · nothing is sent</p>'}
        <form class="nfc-form" novalidate>
          <label>Your name
            <input name="name" type="text" autocomplete="name" maxlength="100" required>
          </label>
          <label>Email or phone
            <input name="contact" type="text" autocomplete="email" inputmode="email" maxlength="200" required>
          </label>
          <label><span>Company <span class="nfc-opt">optional</span></span>
            <input name="company" type="text" autocomplete="organization" maxlength="120">
          </label>
          <label><span>Where’d we meet? What’s on your mind? <span class="nfc-opt">optional</span></span>
            <textarea name="note" rows="3" maxlength="1000"></textarea>
          </label>
          <!-- honeypot: humans never see or fill this -->
          <label class="nfc-hp" aria-hidden="true">Website
            <input name="website" type="text" tabindex="-1" autocomplete="off">
          </label>
          <p class="nfc-error" role="alert" hidden></p>
          <div class="nfc-actions">
            <button type="submit" class="btn">Send to Brayden</button>
            <button type="button" class="btn btn--ghost" data-skip>Skip for now</button>
          </div>
          <p class="nfc-fine">This goes only to me. It’s not shared, sold or added to a mailing list. <a href="privacy.html">Privacy</a>.</p>
        </form>
        <button type="button" class="nfc-promo" data-promo>
          <svg class="nfc-promo__icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path class="w1" d="M8.5 9.5a3.5 3.5 0 0 1 0 5"/><path class="w2" d="M12 7a7 7 0 0 1 0 10"/><path class="w3" d="M15.5 4.5a10.5 10.5 0 0 1 0 15"/>
          </svg>
          <span class="nfc-promo__text">
            <strong>Psst: this card is programmable.</strong>
            <span>Make it text someone, share your Wi-Fi, give directions, take Bitcoin tips and more. See what it can do →</span>
          </span>
        </button>
      </div>`);

    const form = dlg.querySelector('form');
    const err = dlg.querySelector('.nfc-error');
    dlg.querySelector('[data-skip]').addEventListener('click', close);
    dlg.querySelector('[data-promo]').addEventListener('click', () => { track('nfc_promo_click'); showGuide(); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      const data = Object.fromEntries(new FormData(form).entries());
      Object.keys(data).forEach((k) => { data[k] = String(data[k]).trim(); });

      if (!data.name || !data.contact) {
        err.textContent = 'I just need a name and an email or phone number.';
        err.hidden = false;
        return;
      }
      data.elapsed = String(Date.now() - openedAt);
      data.src = 'nfc';

      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Sending…';
      try {
        await submit(data);
        state.stage = 'contacted';
        save(state);
        track('nfc_contact_submit');
        showThanks(data.name);
      } catch (ex) {
        btn.disabled = false;
        btn.textContent = 'Send to Brayden';
        err.innerHTML = 'That didn’t go through. Try again, or reach me on <a href="https://www.linkedin.com/in/brayden-hord" target="_blank" rel="noopener">LinkedIn</a>.';
        err.hidden = false;
      }
    });
  }

  async function submit(data) {
    if (!ENDPOINT) {
      console.info('[nfc-card] TEST MODE, would POST:', data);
      await new Promise((r) => setTimeout(r, 600));
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      // URL-encoded body keeps this a CORS "simple request" (no preflight),
      // which is what Apps Script web apps accept.
      const res = await fetch(ENDPOINT, { method: 'POST', body: new URLSearchParams(data), signal: ctrl.signal });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'rejected');
    } finally {
      clearTimeout(timer);
    }
  }

  function showThanks(name) {
    const first = esc(name.split(/\s+/)[0]);
    open(`
      <div class="nfc-pane nfc-pane--center">
        <span class="kicker kicker--accent">got it</span>
        <h2 id="nfc-title">Thanks, ${first}.</h2>
        <p class="nfc-lede">You’ll hear from me soon. One more thing: the chip in that card is a lot more fun than it looks.</p>
        <p class="nfc-lede"><b>Tap my card again any time</b> to see how it works and how to reprogram it yourself.</p>
        <div class="nfc-actions nfc-actions--center">
          <button type="button" class="btn" data-guide>Show me now</button>
          <button type="button" class="btn btn--ghost" data-done>Look around the site</button>
        </div>
      </div>`);
    dlg.querySelector('[data-guide]').addEventListener('click', showGuide);
    dlg.querySelector('[data-done]').addEventListener('click', close);
  }

  // ------------------------------------------------------------
  // View: returning-scan guide
  // ------------------------------------------------------------
  function showGuide() {
    track('nfc_guide_view', { scans: state.scans });
    open(`
      <div class="nfc-pane">
        <span class="kicker kicker--accent">scan #${state.scans} on this device</span>
        <h2 id="nfc-title">So what’s actually in this card?</h2>

        <div class="nfc-explain">
          <p>There’s a tiny NFC chip under the sticker, about the thickness of a receipt, with <b>no battery</b>. When your phone gets within a few centimeters, its antenna puts out a 13.56&nbsp;MHz radio field. That field powers the chip just long enough for it to hand over one short message, called an <b>NDEF record</b>. Mine is simply a web address, so your phone opened it.</p>
          <p>The chip can’t track you and doesn’t know who scanned it. It only holds a few hundred bytes, which is less than this paragraph. And with a free app, <b>anyone can rewrite it.</b> Including you.</p>
        </div>

        <div class="nfc-choice">
          <strong>Your card, your call.</strong>
          <span>Rewrite this card for one of the ideas below, or grab a pack of blank <b>NTAG215</b> stickers (about 30¢ each) and keep this one pointing at me. Either is a win.</span>
        </div>

        <div class="nfc-apps">
          <span class="kicker">step 0 · get the app</span>
          <div class="nfc-actions">
            <a class="btn btn--small" href="${NFC_TOOLS_IOS}" target="_blank" rel="noopener">NFC Tools for iPhone ↗</a>
            <a class="btn btn--small btn--ghost" href="${NFC_TOOLS_ANDROID}" target="_blank" rel="noopener">NFC Tools for Android ↗</a>
          </div>
          <p class="nfc-fine">iPhone: hold the <b>top edge</b> of the phone to the chip. Android: the <b>middle of the back</b>. Turn NFC on in Settings if it’s off.</p>
        </div>

        <span class="kicker">things you can make it do</span>
        <div class="nfc-tuts">${TUTORIALS.map(tutorialHtml).join('')}</div>

        <details class="nfc-tut nfc-tut--rules" open>
          <summary><span class="nfc-tut__title">Three rules before you write</span></summary>
          <div class="nfc-tut__body">
            <ol>
              <li><b>Never tap "Lock tag" / "Make read-only".</b> It’s permanent. You can’t undo it, ever.</li>
              <li><b>Mind the size.</b> NTAG213 holds 144 bytes, 215 holds 504, 216 holds 888. NFC Tools shows how many bytes your records need before you write.</li>
              <li><b>Tags are public.</b> Anyone nearby can read one, so don’t put anything on it you wouldn’t print on a flyer.</li>
            </ol>
          </div>
        </details>

        <details class="nfc-tut">
          <summary><span class="nfc-tut__title">Changed your mind? Point it back at me</span></summary>
          <div class="nfc-tut__body">
            <p>Write a <b>URL</b> record with:</p>
            <p><code class="nfc-copy">${CARD_URL}</code> <button type="button" class="btn btn--small btn--ghost" data-copy>Copy</button></p>
          </div>
        </details>

        <div class="nfc-actions nfc-foot">
          ${state.stage !== 'contacted' ? '<button type="button" class="btn btn--ghost" data-form>Actually, let’s stay in touch</button>' : ''}
          <button type="button" class="btn" data-done>Explore the site</button>
        </div>
      </div>`);

    dlg.querySelector('[data-done]').addEventListener('click', close);
    const formBtn = dlg.querySelector('[data-form]');
    if (formBtn) formBtn.addEventListener('click', () => { state.stage = 'new'; save(state); showForm(); });
    const copyBtn = dlg.querySelector('[data-copy]');
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(CARD_URL); copyBtn.textContent = 'Copied'; }
      catch (e) { copyBtn.textContent = 'Long-press to copy'; }
    });
    dlg.querySelectorAll('.nfc-tut').forEach((d) => {
      d.addEventListener('toggle', () => { if (d.open && d.querySelector('.nfc-tut__num')) track('nfc_tutorial_open'); });
    });
  }

  // ------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------
  function start(view) {
    track('nfc_scan', { stage: state.stage, scans: state.scans });
    if (view === 'form' || (view !== 'guide' && state.stage === 'new')) showForm();
    else showGuide();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => start(initialView));
  } else {
    start(initialView);
  }
})();
