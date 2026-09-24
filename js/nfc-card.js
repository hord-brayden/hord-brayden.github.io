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
  // 24×24 stroke icons (inner SVG markup)
  const ICONS = {
    sms: '<path d="M4 5h16v11H10l-6 4z"/>',
    wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a5 5 0 0 1 6.4 0"/><circle cx="12" cy="19.2" r="1.2" fill="currentColor" stroke="none"/>',
    maps: '<path d="M12 21s-7-6.2-7-11.2a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.5"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.3"/><path d="M5.8 16.2a3.4 3.4 0 0 1 6.4 0M14.5 10h4M14.5 13.5h3"/>',
    btc: '<circle cx="12" cy="12" r="9"/><path d="M9.8 7.8h3.3a2 2 0 0 1 0 4H9.8zm0 4h3.8a2.1 2.1 0 0 1 0 4.2H9.8zM9.8 7.8V16M11.3 6.3v1.5M11.3 16v1.6"/>',
    shortcut: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    more: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.9 2.9M15.5 15.5l2.9 2.9M5.6 18.4l2.9-2.9M15.5 8.5l2.9-2.9"/>'
  };
  const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>`;

  // `wheel` = the spinning "Tap to ___" word; `screen` = what the animated phone shows.
  const TUTORIALS = [
    {
      id: 'sms', color: '#ffc9f0', wheel: 'text a friend', screen: 'Message ready',
      title: 'Text a friend', sub: 'One tap drafts a text. Great by the front door.',
      steps: [
        'In NFC Tools, tap <b>Write</b> → <b>Add a record</b> → <b>SMS</b>.',
        'Type the phone number and the message, like <i>"Home safe ❤️"</i>.',
        'Tap <b>Write</b> and hold your phone to the card.'
      ],
      note: 'Works on iPhone and Android. Messages opens with the text ready, and you just hit Send.'
    },
    {
      id: 'wifi', color: '#c9d2ff', wheel: 'share Wi-Fi', screen: 'Wi-Fi joined',
      title: 'Share your Wi-Fi', sub: 'Guests tap and they’re online. No spelling out passwords.',
      steps: [
        'In NFC Tools, tap <b>Write</b> → <b>Add a record</b> → <b>Wi-Fi network</b>.',
        'Enter your network name, the security type (usually WPA2) and the password.',
        'Write it, and stick the card somewhere guests will find it.'
      ],
      note: 'Android phones join straight from the tag. iPhones ignore Wi-Fi tags, so add a Wi-Fi QR code next to it for iPhone guests. Use a guest network, because anyone who taps can read the password.'
    },
    {
      id: 'maps', color: '#b8f0d2', wheel: 'get directions', screen: 'Route started',
      title: 'Directions to anywhere', sub: 'Party invites, Airbnbs, your shop counter.',
      steps: [
        'Copy this link and swap in your place’s coordinates or address:<br><code>https://www.google.com/maps/dir/?api=1&amp;destination=40.7608,-111.8910</code>',
        'In NFC Tools, tap <b>Write</b> → <b>Add a record</b> → <b>URL / URI</b> and paste it.',
        'Tap <b>Write</b> and hold your phone to the card.'
      ],
      note: 'Use a link like this one, not NFC Tools’ "Location" option. iPhones ignore that one.'
    },
    {
      id: 'card', color: '#ffe98a', wheel: 'swap contacts', screen: 'Contact saved',
      title: 'Make your own tap card', sub: 'Hand people a card that actually does something.',
      steps: [
        'In NFC Tools, tap <b>Write</b> → <b>Add a record</b> → <b>URL / URI</b>.',
        'Paste your LinkedIn, website or link-in-bio page.',
        'Write it to a blank sticker and put it on your own card or phone case.'
      ],
      note: 'There’s also a <b>Contact</b> record, but it fills the chip fast. A link to a page holds much more.'
    },
    {
      id: 'btc', color: '#ffd2a8', wheel: 'leave a tip', screen: 'Tip ready',
      title: 'Take tips (Bitcoin or any tip page)', sub: 'Buskers, bartenders, open-source folks.',
      steps: [
        'Copy a <b>receive</b> address from your wallet app.',
        'In NFC Tools, add a <b>URL / URI</b> record: <code>bitcoin:yourAddress</code>',
        'Or paste a link to any tip page. That works on every phone.'
      ],
      note: 'Only a public <i>receive</i> address ever goes on a tag. <b>Never a seed phrase or private key.</b> iPhones may not open <code>bitcoin:</code> links from a tag, so a tip page is the safer choice.'
    },
    {
      id: 'shortcut', color: '#e2d4ff', wheel: 'dim the lights', screen: 'Lights dimmed',
      title: 'Dim the lights (or anything)', sub: 'Turn the card into a button. No rewriting needed.',
      steps: [
        '<b>iPhone:</b> open Shortcuts → <b>Automation</b> → <b>+</b> → <b>NFC</b> → <b>Scan</b>, then tap this card.',
        'Pick what happens: lights, music, a timer, Do Not Disturb, anything.',
        'Choose <b>Run Immediately</b>. <b>Android:</b> use the free <i>NFC Tasks</i> app.'
      ],
      note: 'This recognizes the chip itself, not what’s written on it. So my card can be your button and still point to me for everyone else.'
    },
    {
      id: 'more', color: '#ebe4d6', title: 'More quick ideas', sub: 'Call, email, reviews, logs.',
      steps: [
        '<b>Call:</b> a <code>tel:+15555550123</code> record for a "call the front desk" tag.',
        '<b>Email:</b> an Email record with the subject filled in, for "report a problem" stickers.',
        '<b>Reviews:</b> your Google review link on the checkout counter.',
        '<b>Logs:</b> a Google Form link that records when you watered the plants.'
      ]
    }
  ];
  const WHEEL = TUTORIALS.filter((t) => t.wheel);

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function tutorialHtml(t) {
    return `
      <details class="nfc-trick" style="--c:${t.color}">
        <summary>
          <span class="nfc-trick__icon">${icon(t.id)}</span>
          <span class="nfc-trick__txt"><b>${t.title}</b><small>${t.sub}</small></span>
        </summary>
        <div class="nfc-trick__body">
          <ol class="nfc-steps">${t.steps.map((s) => `<li><span>${s}</span></li>`).join('')}</ol>
          ${t.note ? `<p class="nfc-note">${t.note}</p>` : ''}
        </div>
      </details>`;
  }

  // The animated hero: my card, its chip, and a phone that taps it.
  function heroHtml() {
    const first = WHEEL[0];
    return `
      <div class="nfc-hero" aria-hidden="true">
        <svg class="nfc-hero__svg" viewBox="0 20 340 170">
          <g class="nfc-card">
            <rect x="12" y="36" width="228" height="140" rx="14" class="nfc-card__shadow"/>
            <rect x="7" y="31" width="228" height="140" rx="14" class="nfc-card__face"/>
            <text x="26" y="76" class="nfc-card__name">Brayden Hord</text>
            <text x="26" y="95" class="nfc-card__role">Engineering &amp; Innovation</text>
            <text x="26" y="152" class="nfc-card__url">hord-brayden.github.io</text>
            <g class="nfc-waves">
              <path class="w1" d="M188 128a16 16 0 0 1 24 0"/>
              <path class="w2" d="M181 120a26 26 0 0 1 38 0"/>
              <path class="w3" d="M174 112a36 36 0 0 1 52 0"/>
            </g>
            <g class="nfc-chip">
              <rect x="186" y="134" width="28" height="22" rx="5"/>
              <path d="M195.3 134v22M204.6 134v22M186 145h28"/>
            </g>
          </g>
          <g class="nfc-phone">
            <rect x="222" y="112" width="104" height="60" rx="13" class="nfc-phone__body"/>
            <circle cx="229.5" cy="142" r="2" class="nfc-phone__cam"/>
            <rect x="236" y="117" width="84" height="50" rx="8" class="nfc-phone__screen"/>
            <g class="nfc-phone__app">
              <rect x="236" y="117" width="84" height="50" rx="8" class="nfc-phone__appbg" style="fill:${first.color}"/>
              <svg x="266" y="122" width="24" height="24" viewBox="0 0 24 24" class="nfc-phone__icon">${ICONS[first.id]}</svg>
              <text x="278" y="159" class="nfc-phone__label">${first.screen}</text>
            </g>
          </g>
        </svg>
      </div>`;
  }

  function wheelHtml() {
    const items = WHEEL.concat(WHEEL[0]); // trailing copy of the first lets the loop wrap seamlessly
    return `
      <h2 class="nfc-h1" id="nfc-title">
        Tap to
        <span class="nfc-wheel" aria-hidden="true"><span class="nfc-wheel__track">${items.map((t) => `<span>${t.wheel}</span>`).join('')}</span></span>
        <span class="nfc-sr">${WHEEL.map((t) => t.wheel).join(', ')}, and more</span>
      </h2>`;
  }

  // Advance the wheel and the phone screen each time the phone animation loops.
  function startHero() {
    const phone = dlg.querySelector('.nfc-phone');
    const wheel = dlg.querySelector('.nfc-wheel');
    const track = dlg.querySelector('.nfc-wheel__track');
    if (!phone || !wheel || !track) return;
    const words = Array.from(track.children);
    const appBg = dlg.querySelector('.nfc-phone__appbg');
    const appIcon = dlg.querySelector('.nfc-phone__icon');
    const appLabel = dlg.querySelector('.nfc-phone__label');
    let i = 0;

    const fit = () => { wheel.style.width = words[i].getBoundingClientRect().width + 'px'; };
    const show = () => {
      track.style.transform = `translateY(${-i * 1.12}em)`;
      fit();
      const t = WHEEL[i % WHEEL.length];
      appBg.style.fill = t.color;
      appIcon.innerHTML = ICONS[t.id];
      appLabel.textContent = t.screen;
    };
    track.addEventListener('transitionend', () => {
      if (i !== WHEEL.length) return;
      track.style.transition = 'none';
      i = 0;
      show();
      void track.offsetHeight; // commit the jump before re-enabling the transition
      track.style.transition = '';
    });
    // Child animations (the phone's screen) bubble their own iteration events; count only the phone's.
    phone.addEventListener('animationiteration', (e) => { if (e.target === phone) { i += 1; show(); } });
    // Fonts change word widths once they load
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    fit();
  }

  // ------------------------------------------------------------
  // Dialog shell
  // ------------------------------------------------------------
  ['fonts/bricolage-grotesque.woff2', 'fonts/instrument-sans.woff2'].forEach((href) => {
    const l = document.createElement('link');
    l.rel = 'preload'; l.as = 'font'; l.type = 'font/woff2'; l.crossOrigin = 'anonymous'; l.href = href;
    document.head.appendChild(l);
  });
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'css/nfc-card.css';
  const cssReady = new Promise((resolve) => {
    css.onload = resolve;
    css.onerror = resolve;
    setTimeout(resolve, 2500); // never hold the popup hostage to a slow stylesheet
  });
  document.head.appendChild(css);

  const dlg = document.createElement('dialog');
  dlg.className = 'nfc-dialog';
  dlg.setAttribute('aria-labelledby', 'nfc-title');
  document.body.appendChild(dlg);

  function open(html) {
    dlg.innerHTML = `
      <div class="nfc-top">
        <span class="nfc-grab" aria-hidden="true"></span>
        <span class="nfc-brand">hord<span>.</span>brayden</span>
        <button type="button" class="nfc-close" aria-label="Close">${'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'}</button>
      </div>
      ${html}`;
    dlg.querySelector('.nfc-close').addEventListener('click', close);
    dlg.scrollTop = 0;
    if (!dlg.open) {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
      document.documentElement.classList.add('nfc-lock');
    }
    // Land focus on the title: screen readers announce it, and the close
    // button doesn't wear a focus ring before anyone has touched anything.
    const title = dlg.querySelector('#nfc-title');
    if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); }
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
        <span class="nfc-label">you just tapped my card</span>
        <h2 class="nfc-h1" id="nfc-title">Hey, it’s <em>Brayden.</em></h2>
        <p class="nfc-lede">Leave a way to reach you and I’ll follow up personally. Takes 10 seconds.</p>
        ${ENDPOINT ? '' : '<p class="nfc-testmode">TEST MODE · no endpoint set · nothing is sent</p>'}
        <form class="nfc-form" novalidate>
          <label><span>Your name</span>
            <input name="name" type="text" autocomplete="name" maxlength="100" required>
          </label>
          <label><span>Email or phone</span>
            <input name="contact" type="text" autocomplete="email" inputmode="email" maxlength="200" required>
          </label>
          <label><span>Company <i>optional</i></span>
            <input name="company" type="text" autocomplete="organization" maxlength="120">
          </label>
          <label><span>Where’d we meet? <i>optional</i></span>
            <textarea name="note" rows="2" maxlength="1000"></textarea>
          </label>
          <!-- honeypot: humans never see or fill this -->
          <label class="nfc-hp" aria-hidden="true">Website
            <input name="website" type="text" tabindex="-1" autocomplete="off">
          </label>
          <p class="nfc-error" role="alert" hidden></p>
          <div class="nfc-actions">
            <button type="submit" class="nfc-btn nfc-btn--primary">Send to Brayden <span aria-hidden="true">→</span></button>
            <button type="button" class="nfc-btn nfc-btn--ghost" data-skip>Skip for now</button>
          </div>
          <p class="nfc-fine">Only I see this. Never shared, sold or added to a list. <a href="privacy.html">Privacy</a></p>
        </form>
        <button type="button" class="nfc-promo" data-promo>
          <span class="nfc-promo__icon">${'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path class="w1" d="M8.5 9.5a3.5 3.5 0 0 1 0 5"/><path class="w2" d="M12 7a7 7 0 0 1 0 10"/><path class="w3" d="M15.5 4.5a10.5 10.5 0 0 1 0 15"/></svg>'}</span>
          <span class="nfc-promo__text">
            <b>Psst: this card does tricks.</b>
            <span>Tap it to text a friend, share Wi-Fi and more. See how <span aria-hidden="true">→</span></span>
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
        btn.innerHTML = 'Send to Brayden <span aria-hidden="true">→</span>';
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
        <span class="nfc-check" aria-hidden="true">${'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'}</span>
        <h2 class="nfc-h1" id="nfc-title">Thanks, ${first}.</h2>
        <p class="nfc-lede">You’ll hear from me soon. Now the fun part: the card in your hand can do a lot more than hold my name.</p>
        <div class="nfc-actions">
          <button type="button" class="nfc-btn nfc-btn--primary" data-guide>Show me what it can do <span aria-hidden="true">→</span></button>
          <button type="button" class="nfc-btn nfc-btn--ghost" data-done>Look around the site</button>
        </div>
        <p class="nfc-fine">Or just tap my card again later. It’ll show you then.</p>
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
      <div class="nfc-pane nfc-pane--guide">
        ${heroHtml()}
        ${wheelHtml()}
        <p class="nfc-lede">This card is secretly a shortcut. Program it once and a single tap makes your phone text a friend, join the Wi-Fi or start directions home. It takes about a minute with a free app, and no tech skills.</p>

        <section class="nfc-how" aria-labelledby="nfc-how-h">
          <h3 id="nfc-how-h">How to set it up</h3>
          <ol>
            <li><div><b>Get the free NFC Tools app.</b>
              <span class="nfc-apps">
                <a class="nfc-btn nfc-btn--small nfc-btn--primary" href="${NFC_TOOLS_IOS}" target="_blank" rel="noopener">iPhone ↗</a>
                <a class="nfc-btn nfc-btn--small nfc-btn--dark" href="${NFC_TOOLS_ANDROID}" target="_blank" rel="noopener">Android ↗</a>
              </span>
            </div></li>
            <li><div><b>Pick a trick below</b> and follow its three steps.</div></li>
            <li><div><b>Hold your phone to the chip</b> in the corner. On iPhone use the top edge, on Android the middle of the back.</div></li>
          </ol>
        </section>

        <div class="nfc-sech">
          <h3>Pick a trick</h3>
          <span class="nfc-label">tap one to see how</span>
        </div>
        <div class="nfc-tricks">${TUTORIALS.map(tutorialHtml).join('')}</div>

        <div class="nfc-finding nfc-finding--good">
          <b>Your card, your call.</b>
          <span>Rewrite this card, or grab blank <b>NTAG215</b> stickers (about 30¢ each) and keep this one pointing at me. Either is a win.</span>
        </div>
        <div class="nfc-finding nfc-finding--bad">
          <b>Three rules before you write</b>
          <span><b>1.</b> Never tap <i>"Lock tag"</i>. It’s permanent. <b>2.</b> Keep it short, since the chip holds about a paragraph. <b>3.</b> Anyone can read a tag, so nothing secret goes on it.</span>
        </div>

        <details class="nfc-more">
          <summary>How does it actually work?</summary>
          <p>There’s no battery. When your phone gets within a couple of centimeters, its NFC antenna powers the chip for a split second (13.56&nbsp;MHz, if you’re curious), and the chip hands over one tiny message. Mine is a link, so your phone opened it. It can’t track you and doesn’t know who tapped it.</p>
        </details>
        <details class="nfc-more">
          <summary>Changed your mind? Point it back at me</summary>
          <p>Write a <b>URL</b> record with:</p>
          <p class="nfc-copyrow"><code>${CARD_URL}</code><button type="button" class="nfc-btn nfc-btn--small nfc-btn--ghost" data-copy>Copy</button></p>
        </details>

        <div class="nfc-actions nfc-foot">
          <button type="button" class="nfc-btn nfc-btn--primary" data-done>Explore the site</button>
          ${state.stage !== 'contacted' ? '<button type="button" class="nfc-btn nfc-btn--ghost" data-form>Actually, let’s stay in touch</button>' : ''}
        </div>
      </div>`);

    startHero();
    dlg.querySelector('[data-done]').addEventListener('click', close);
    const formBtn = dlg.querySelector('[data-form]');
    if (formBtn) formBtn.addEventListener('click', () => { state.stage = 'new'; save(state); showForm(); });
    const copyBtn = dlg.querySelector('[data-copy]');
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(CARD_URL); copyBtn.textContent = 'Copied'; }
      catch (e) { copyBtn.textContent = 'Long-press to copy'; }
    });
    dlg.querySelectorAll('.nfc-trick').forEach((d) => {
      d.addEventListener('toggle', () => { if (d.open) track('nfc_tutorial_open'); });
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

  const domReady = new Promise((r) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', r);
    else r();
  });
  Promise.all([domReady, cssReady]).then(() => start(initialView));
})();
