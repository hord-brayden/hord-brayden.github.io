/* ============================================================
   playground.js — RNG toys: password generator, array shuffle,
   Math.random() + 32-bit xorshift plots, clipboard helper.
   Consolidates: password_generator, arraymama, xorshift_rng,
                 plot_random_numbers.
   ============================================================ */

(function () {
  'use strict';

  // ------------------------------------------------------------
  // Unbiased crypto-grade integer in [0, max)
  // ------------------------------------------------------------
  function secureInt(max) {
    if (window.crypto && window.crypto.getRandomValues) {
      const limit = Math.floor(0x100000000 / max) * max;
      const buf = new Uint32Array(1);
      do { window.crypto.getRandomValues(buf); } while (buf[0] >= limit);
      return buf[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  // ------------------------------------------------------------
  // Password generator
  // ------------------------------------------------------------
  const SETS = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    digits: '0123456789',
    symbols: '!@#$%^&*()_-+=<>?{}[]|~'
  };

  function generatePassword() {
    const lenEl = document.getElementById('passwordLength');
    if (!lenEl) return;
    const length = Math.max(4, Math.min(128, parseInt(lenEl.value, 10) || 12));
    const useUpper   = document.getElementById('includeUppercase').checked;
    const useLower   = document.getElementById('includeLowercase').checked;
    const useDigits  = document.getElementById('includeNumbers').checked;
    const useSymbols = document.getElementById('includeSymbols').checked;

    const pool = [
      useUpper ? SETS.upper : '',
      useLower ? SETS.lower : '',
      useDigits ? SETS.digits : '',
      useSymbols ? SETS.symbols : ''
    ].join('');

    const out = document.getElementById('passwordOutput');
    if (!pool) { out.value = 'Select at least one character set.'; return; }

    let pwd = '';
    for (let i = 0; i < length; i++) pwd += pool[secureInt(pool.length)];
    out.value = pwd;
  }

  // ------------------------------------------------------------
  // Array shuffle (Fisher-Yates with secure index)
  // ------------------------------------------------------------
  window.randomizeInputArray = function (inputId, outputId) {
    const inputEl = document.getElementById(inputId);
    const outputEl = document.getElementById(outputId);
    if (!inputEl || !outputEl) return;
    const tokens = inputEl.value.split(/[\s,]+/).filter(Boolean);
    if (tokens.length === 0) { outputEl.value = ''; return; }
    const items = tokens.slice();
    for (let i = items.length - 1; i > 0; i--) {
      const j = secureInt(i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    outputEl.value = items.join(', ');
  };

  // ------------------------------------------------------------
  // Clipboard helper (used by readonly outputs)
  // ------------------------------------------------------------
  window.copyToClipboard = function (id, evt) {
    const el = document.getElementById(id);
    if (!el || !el.value) return;
    el.select();
    el.setSelectionRange(0, 99999);
    let copied = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(el.value);
      copied = true;
    } else {
      try { copied = document.execCommand('copy'); } catch (e) {}
    }
    const popup = document.createElement('div');
    popup.textContent = copied ? 'Copied' : 'Copy failed';
    Object.assign(popup.style, {
      position: 'fixed',
      padding: '6px 12px',
      background: 'var(--bg-elev)',
      color: 'var(--ink)',
      border: '1px solid var(--border-strong)',
      borderRadius: '999px',
      fontSize: '12px',
      fontFamily: 'var(--font-mono)',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      zIndex: '2000',
      boxShadow: 'var(--shadow-md)',
      pointerEvents: 'none',
      transition: 'opacity .25s ease',
    });
    const e = evt || window.event;
    const x = (e && e.clientX) ? e.clientX + 18 : 60;
    const y = (e && e.clientY) ? e.clientY : 60;
    popup.style.left = x + 'px';
    popup.style.top = y + 'px';
    document.body.appendChild(popup);
    setTimeout(() => { popup.style.opacity = '0'; }, 1100);
    setTimeout(() => popup.remove(), 1500);
  };

  // ------------------------------------------------------------
  // 32-bit XORShift (Marsaglia 2003)
  // ------------------------------------------------------------
  let xorshiftState;
  function seedXorshift() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    xorshiftState = buf[0] || 0x9e3779b9;
  }
  function xorshiftNext() {
    let x = xorshiftState | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    xorshiftState = x | 0;
    return x >>> 0;
  }
  function getBetterRandom() { return xorshiftNext() / 0x100000000; }
  seedXorshift();
  window.getBetterRandom = getBetterRandom;
  window.reseedXorshift = seedXorshift;

  // ------------------------------------------------------------
  // Cartesian plotter
  // ------------------------------------------------------------
  function getCss(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function plotColors() {
    return {
      axis: getCss('--muted') || '#888',
      point: getCss('--accent') || '#b8470d',
    };
  }
  function drawAxes(ctx, canvas) {
    const w = canvas.width, h = canvas.height;
    const tickSize = 6;
    const values = [0, 0.25, 0.5, 0.75, 1];
    const { axis } = plotColors();

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = axis;
    ctx.fillStyle = axis;
    ctx.font = '11px ui-monospace, monospace';

    // X
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    // Y
    ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();

    ctx.textBaseline = 'middle';
    values.forEach((v) => {
      const x = w * v, y = h / 2;
      ctx.beginPath(); ctx.moveTo(x, y - tickSize / 2); ctx.lineTo(x, y + tickSize / 2); ctx.stroke();
      ctx.textAlign = v === 0 ? 'left' : v === 1 ? 'right' : 'center';
      ctx.fillText(v, x, y + tickSize * 2);
    });

    ctx.textAlign = 'center';
    values.forEach((v) => {
      const x = w / 2, y = h * (1 - v);
      ctx.beginPath(); ctx.moveTo(x - tickSize / 2, y); ctx.lineTo(x + tickSize / 2, y); ctx.stroke();
      ctx.textBaseline = v === 0 ? 'bottom' : v === 1 ? 'top' : 'middle';
      ctx.fillText(v, x - tickSize * 2, y);
    });
    ctx.restore();
  }
  function countSectors(values) {
    const c = { sector1: 0, sector2: 0, sector3: 0, sector4: 0 };
    values.forEach(([x, y]) => {
      if (x >= 0.5 && y >= 0.5) c.sector1++;
      else if (x < 0.5 && y >= 0.5) c.sector2++;
      else if (x < 0.5 && y < 0.5) c.sector3++;
      else c.sector4++;
    });
    return c;
  }
  function displaySectorCounts(c, id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `
      <div>
        <span class="pill">Q1: ${c.sector1}</span>
        <span class="pill">Q2: ${c.sector2}</span>
        <span class="pill">Q3: ${c.sector3}</span>
        <span class="pill">Q4: ${c.sector4}</span>
      </div>`;
  }
  function displayRandomValues(values, id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = values.map(([x, y]) => `(${x}, ${y})`).join('  ');
  }
  function plot(canvas, ctx, generator) {
    const count = 250;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawAxes(ctx, canvas);
    const values = [];
    ctx.fillStyle = plotColors().point;
    for (let i = 0; i < count; i++) {
      const x = generator(), y = generator();
      ctx.beginPath();
      ctx.arc(x * canvas.width, y * canvas.height, 2.4, 0, Math.PI * 2, true);
      ctx.fill();
      values.push([x.toFixed(2), y.toFixed(2)]);
    }
    return values;
  }

  // ------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------
  function boot() {
    // Password generator
    const pwBtn = document.getElementById('generatePassword');
    if (pwBtn) { pwBtn.addEventListener('click', generatePassword); generatePassword(); }

    // Plots
    const c1 = document.getElementById('randomNumberPlot');
    const c2 = document.getElementById('randomNumberPlot2');
    if (c1) {
      const ctx1 = c1.getContext('2d');
      drawAxes(ctx1, c1);
      const btn = document.getElementById('plotButton');
      if (btn) btn.addEventListener('click', () => {
        const values = plot(c1, ctx1, () => Math.random());
        displaySectorCounts(countSectors(values), 'sectorCounts');
        displayRandomValues(values, 'randomValues');
      });
    }
    if (c2) {
      const ctx2 = c2.getContext('2d');
      drawAxes(ctx2, c2);
      const btn = document.getElementById('plotButton2');
      if (btn) btn.addEventListener('click', () => {
        seedXorshift();
        const values = plot(c2, ctx2, () => getBetterRandom());
        displaySectorCounts(countSectors(values), 'sectorCounts2');
        displayRandomValues(values, 'randomValues2');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
