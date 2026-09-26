/* ============================================================
   site.js - header & footer components, grouped nav menus,
   theme toggle, mobile nav, canvas resize, Game-of-Life background.
   Consolidates: page-components, dark_mode_toggle,
                 hamburgesa, canvi-resize, gameOfLife.
   ============================================================ */

(function () {
  'use strict';

  // ------------------------------------------------------------
  // Theme (dark mode)
  // ------------------------------------------------------------
  const Theme = {
    root: document.documentElement,
    apply(enabled) {
      this.root.classList.toggle('dark-mode', enabled);
      try { localStorage.setItem('darkMode', enabled ? 'enabled' : 'disabled'); } catch (e) {}
      // Update meta theme-color so mobile chrome matches
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', enabled ? '#0a0907' : '#f7f4ee');
    },
    initial() {
      let stored = null;
      try { stored = localStorage.getItem('darkMode'); } catch (e) {}
      if (stored) return stored === 'enabled';
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    },
    /**
     * Put the theme switch in the nav rather than floating it over the page.
     *
     * As a fixed element bottom-right it sat on top of whatever the page had
     * there — on the arena page that is the launch button and the match
     * controls. In the nav list it rides inside the hamburger on a phone and
     * sits inline on a desktop, which is where a site-wide setting belongs.
     */
    place(wrap) {
      const list = document.querySelector('header-component nav ul, header nav ul, nav ul');
      if (!list || wrap.closest('nav')) return !!wrap.closest('nav');
      const li = document.createElement('li');
      li.className = 'nav-theme';
      li.appendChild(wrap);
      list.appendChild(li);
      return true;
    },
    mount() {
      if (document.querySelector('.dark-mode-toggle')) return;
      const wrap = document.createElement('div');
      wrap.className = 'dark-mode-toggle';
      wrap.setAttribute('aria-label', 'Toggle dark mode');
      wrap.innerHTML = `
        <span class="dark-mode-label">Dark mode</span>
        <label class="switch">
          <input type="checkbox" id="dark-mode-toggle-btn" aria-label="Dark mode" />
          <span class="slider round"></span>
        </label>`;
      // The header is a custom element that may not have upgraded yet, so
      // park it on the body and move it in the moment the nav appears.
      document.body.appendChild(wrap);
      if (!this.place(wrap)) {
        const obs = new MutationObserver(() => { if (this.place(wrap)) obs.disconnect(); });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => obs.disconnect(), 8000);
      }

      const btn = wrap.querySelector('#dark-mode-toggle-btn');
      const enabled = this.initial();
      this.apply(enabled);
      btn.checked = enabled;
      btn.addEventListener('change', () => this.apply(btn.checked));
    }
  };
  // Apply theme synchronously before paint to prevent flash
  Theme.apply(Theme.initial());

  // ------------------------------------------------------------
  // Header / Footer custom elements
  // ------------------------------------------------------------
  class HeaderComponent extends HTMLElement {
    connectedCallback() {
      const current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
      // Top-level items, with two grouped menus so every page on the site is
      // one click from the header without the row wrapping.
      const links = [
        { href: 'index.html',  label: 'Work' },
        { href: 'resume.html', label: 'Resume' },
        { group: 'Tools', items: [
          { href: 'pixel-lab.html',     label: 'Pixel Lab',     note: 'ad pixel testing, Chrome' },
          { href: 'bid-inspector.html', label: 'Bid Inspector', note: 'header bidding, Chrome' },
          { href: 'https://github.com/hord-brayden/lidless', label: 'Lidless', note: 'macOS, open source', external: true }
        ]},
        { group: 'Play', items: [
          { href: 'elemental-arena.html', label: 'Elemental Arena', note: 'the orb battle game' },
          { href: 'playground.html',      label: 'Playground',      note: 'RNG and crypto toys' },
          { href: 'testing-kit.html',     label: 'RNG testing kit', note: 'NIST-style tests' },
          { href: 'f1-timer.html',        label: 'Reaction timer',  note: 'F1 lights' }
        ]},
        { href: 'https://arenawins.com/', label: 'ArenaWins', tag: 'day job', external: true, title: 'Arena, where I run engineering, IT and AI' },
        { href: 'https://github.com/hord-brayden/', label: 'GitHub', external: true }
      ];
      const item = (l) => {
        const isActive = !l.external && l.href.toLowerCase() === current;
        const target = l.external ? ' target="_blank" rel="noopener"' : '';
        const title = l.title ? ` title="${l.title}"` : '';
        const tag = l.tag ? `<span class="nav-tag">${l.tag}</span>` : '';
        const ext = l.external ? '<span class="nav-ext" aria-hidden="true">&#8599;</span>' : '';
        const note = l.note ? `<small>${l.note}</small>` : '';
        return `<a href="${l.href}"${target}${title} class="${isActive ? 'active' : ''}">${l.label}${tag}${ext}${note}</a>`;
      };
      const items = links.map((l) => {
        if (!l.group) return `<li>${item(l)}</li>`;
        const open = l.items.some((i) => !i.external && i.href.toLowerCase() === current);
        return `<li class="nav-group${open ? ' is-current' : ''}" data-label="${l.group}">
          <button type="button" class="nav-group-btn${open ? ' active' : ''}" aria-expanded="false" aria-haspopup="true">${l.group}<span class="nav-caret" aria-hidden="true"></span></button>
          <ul class="nav-sub">${l.items.map((i) => `<li>${item(i)}</li>`).join('')}</ul>
        </li>`;
      }).join('');

      this.innerHTML = `
        <header class="site-header" data-site-header>
          <nav aria-label="Site">
            <a class="brand" href="index.html">hord<span class="brand-dot">.</span>brayden</a>
            <button class="hamburger-menu" aria-label="Toggle menu" aria-expanded="false" type="button">
              <span class="bar"></span><span class="bar"></span><span class="bar"></span>
            </button>
            <ul class="nav-list">${items}</ul>
          </nav>
        </header>`;
    }
  }

  class FooterComponent extends HTMLElement {
    connectedCallback() {
      const year = new Date().getFullYear();
      this.innerHTML = `
        <footer class="site-footer">
          <div class="footer-content">
            <div class="privacy-block">
              <a href="resume.html">Resume</a>
              <a href="pixel-lab.html">Pixel Lab</a>
              <a href="bid-inspector.html">Bid Inspector</a>
              <a href="https://github.com/hord-brayden/lidless" target="_blank" rel="noopener">Lidless</a>
              <a href="elemental-arena.html">Elemental Arena</a>
              <a href="privacy.html">Privacy</a>
              <a href="https://www.linkedin.com/in/brayden-hord" target="_blank" rel="noopener">LinkedIn</a>
              <a href="https://github.com/hord-brayden/" target="_blank" rel="noopener">GitHub</a>
              <a href="https://arenawins.com/" target="_blank" rel="noopener">ArenaWins</a>
              <button id="reSeed" type="button">Reseed background</button>
            </div>
            <p>&copy; ${year} Brayden Hord &middot; built and broken in the open</p>
          </div>
        </footer>`;
      const reseed = this.querySelector('#reSeed');
      if (reseed) reseed.addEventListener('click', () => { if (window.reSeed) window.reSeed(); });
    }
  }

  if (!customElements.get('header-component')) customElements.define('header-component', HeaderComponent);
  if (!customElements.get('footer-component')) customElements.define('footer-component', FooterComponent);

  // ------------------------------------------------------------
  // Hamburger menu (mobile)
  // ------------------------------------------------------------
  function initHamburger() {
    const burger = document.querySelector('.site-header .hamburger-menu');
    const menu = document.querySelector('.site-header nav ul.nav-list');
    if (!burger || !menu) return;
    const toggle = () => {
      const open = menu.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
    };
    burger.addEventListener('click', toggle);
    burger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
    // Close menu on link click (mobile nav)
    menu.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => {
        if (menu.classList.contains('is-open')) {
          menu.classList.remove('is-open');
          burger.setAttribute('aria-expanded', 'false');
        }
      });
    });
  }

  // ------------------------------------------------------------
  // Grouped menus (Tools, Play). Hover opens them on a desktop pointer;
  // click or keyboard toggles them everywhere; Escape and outside clicks
  // close them. On narrow screens the groups are laid out inline instead.
  // ------------------------------------------------------------
  function initNavGroups() {
    const groups = Array.from(document.querySelectorAll('.site-header .nav-group'));
    if (!groups.length) return;
    const setOpen = (g, open) => {
      g.classList.toggle('is-open', open);
      g.querySelector('.nav-group-btn').setAttribute('aria-expanded', String(open));
    };
    const closeAll = (except) => groups.forEach((g) => { if (g !== except) setOpen(g, false); });
    groups.forEach((g) => {
      const btn = g.querySelector('.nav-group-btn');
      btn.addEventListener('click', () => {
        const open = !g.classList.contains('is-open');
        closeAll(g);
        setOpen(g, open);
      });
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { setOpen(g, false); btn.focus(); }
      });
      g.addEventListener('focusout', (e) => {
        if (!g.contains(e.relatedTarget)) setOpen(g, false);
      });
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.site-header .nav-group')) closeAll();
    });
  }

  // ------------------------------------------------------------
  // Header scroll state
  // ------------------------------------------------------------
  function initHeaderScroll() {
    const header = document.querySelector('[data-site-header]');
    if (!header) return;
    let ticking = false;
    const update = () => {
      header.classList.toggle('is-scrolled', window.scrollY > 4);
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  // ------------------------------------------------------------
  // Game of Life background
  // ------------------------------------------------------------
  const RESOLUTION = 18;
  let golCanvas, golCtx, golCols = 0, golRows = 0, golGrid = [], golRaf = 0, golRunning = false;

  function golGetCss(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function golSize() {
    if (!golCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    golCanvas.width = Math.floor(window.innerWidth * dpr);
    golCanvas.height = Math.floor(window.innerHeight * dpr);
    golCanvas.style.width = window.innerWidth + 'px';
    golCanvas.style.height = window.innerHeight + 'px';
    golCols = Math.max(1, Math.floor(golCanvas.width / RESOLUTION));
    golRows = Math.max(1, Math.floor(golCanvas.height / RESOLUTION));
  }
  function golFresh() {
    const arr = new Array(golCols);
    for (let i = 0; i < golCols; i++) {
      arr[i] = new Uint8Array(golRows);
      for (let j = 0; j < golRows; j++) arr[i][j] = Math.random() < 0.18 ? 1 : 0;
    }
    return arr;
  }
  function golNext(g) {
    const out = new Array(golCols);
    for (let c = 0; c < golCols; c++) out[c] = new Uint8Array(golRows);
    for (let c = 0; c < golCols; c++) {
      for (let r = 0; r < golRows; r++) {
        let n = 0;
        for (let dc = -1; dc <= 1; dc++) {
          for (let dr = -1; dr <= 1; dr++) {
            if (!dc && !dr) continue;
            const cc = (c + dc + golCols) % golCols;
            const rr = (r + dr + golRows) % golRows;
            n += g[cc][rr];
          }
        }
        const cell = g[c][r];
        out[c][r] = (cell && (n === 2 || n === 3)) || (!cell && n === 3) ? 1 : 0;
      }
    }
    return out;
  }
  function golDraw() {
    if (!golCtx) return;
    const on = golGetCss('--ink') || '#181513';
    golCtx.clearRect(0, 0, golCanvas.width, golCanvas.height);
    golCtx.fillStyle = on;
    for (let c = 0; c < golCols; c++) {
      for (let r = 0; r < golRows; r++) {
        if (golGrid[c][r]) {
          golCtx.fillRect(c * RESOLUTION, r * RESOLUTION, RESOLUTION - 1, RESOLUTION - 1);
        }
      }
    }
  }
  function golLoop() {
    golGrid = golNext(golGrid);
    golDraw();
    golRaf = requestAnimationFrame(golLoop);
  }
  function golStart() { if (golRunning) return; golRunning = true; golLoop(); }
  function golStop() { golRunning = false; cancelAnimationFrame(golRaf); }

  function initGol() {
    golCanvas = document.getElementById('gameOfLifeCanvas');
    if (!golCanvas) return;
    golCtx = golCanvas.getContext('2d');
    golSize();
    golGrid = golFresh();
    golDraw();

    const startBtn = document.getElementById('startStopButton');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        if (golRunning) { golStop(); startBtn.textContent = 'Start Game of Life'; }
        else { golStart(); startBtn.textContent = 'Stop Game of Life'; }
      });
    }
    window.reSeed = function () {
      golSize();
      golGrid = golFresh();
      golDraw();
    };
  }

  // Resize handler (debounced)
  let resizeRaf;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      if (typeof window.reSeed === 'function') window.reSeed();
    });
  });

  // ------------------------------------------------------------
  // GoL stage mode (hide everything for fullscreen GoL)
  // ------------------------------------------------------------
  function initGolMode() {
    const toggle = document.getElementById('toggleButton');
    const exitBtn = document.getElementById('golExit');
    if (!toggle && !exitBtn) return;
    function enter() {
      document.body.classList.add('gol-only');
      const startBtn = document.getElementById('startStopButton');
      if (startBtn && startBtn.textContent === 'Start Game of Life') startBtn.click();
    }
    function exit() { document.body.classList.remove('gol-only'); }
    if (toggle) toggle.addEventListener('click', enter);
    if (exitBtn) exitBtn.addEventListener('click', exit);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.classList.contains('gol-only')) exit();
    });
  }

  // ------------------------------------------------------------
  // Reveal animation gating - respects reduced-motion
  // ------------------------------------------------------------
  function initReveal() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.reveal').forEach((el) => el.classList.remove('reveal'));
    }
  }

  // ------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------
  function boot() {
    Theme.mount();
    initHamburger();
    initNavGroups();
    initHeaderScroll();
    initGol();
    initGolMode();
    initReveal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
