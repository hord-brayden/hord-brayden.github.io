(function () {
  const SETS = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    digits: '0123456789',
    symbols: '!@#$%^&*()_-+=<>?{}[]|~'
  };

  function pickIndex(max) {
    if (window.crypto && window.crypto.getRandomValues) {
      const limit = Math.floor(0x100000000 / max) * max;
      const buf = new Uint32Array(1);
      do { window.crypto.getRandomValues(buf); } while (buf[0] >= limit);
      return buf[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  function generatePassword() {
    const length = Math.max(4, Math.min(128, parseInt(document.getElementById('passwordLength').value, 10) || 12));
    const useUpper = document.getElementById('includeUppercase').checked;
    const useLower = document.getElementById('includeLowercase').checked;
    const useDigits = document.getElementById('includeNumbers').checked;
    const useSymbols = document.getElementById('includeSymbols').checked;

    const pool = [
      useUpper ? SETS.upper : '',
      useLower ? SETS.lower : '',
      useDigits ? SETS.digits : '',
      useSymbols ? SETS.symbols : ''
    ].join('');

    const out = document.getElementById('passwordOutput');
    if (!pool) {
      out.value = 'Select at least one character set.';
      return;
    }

    let pwd = '';
    for (let i = 0; i < length; i++) pwd += pool[pickIndex(pool.length)];
    out.value = pwd;
  }

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
    popup.textContent = copied ? 'Copied to clipboard' : 'Copy failed';
    Object.assign(popup.style, {
      position: 'fixed',
      padding: '6px 12px',
      background: 'var(--surface)',
      color: 'var(--text)',
      border: '1px solid var(--border-strong)',
      borderRadius: '8px',
      fontSize: '13px',
      zIndex: '2000',
      boxShadow: 'var(--shadow-md)'
    });
    const e = evt || window.event;
    const x = (e && e.clientX) ? e.clientX + 18 : 60;
    const y = (e && e.clientY) ? e.clientY : 60;
    popup.style.left = x + 'px';
    popup.style.top = y + 'px';
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 1600);
  };

  function init() {
    const btn = document.getElementById('generatePassword');
    if (!btn) return;
    btn.addEventListener('click', generatePassword);
    generatePassword();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
