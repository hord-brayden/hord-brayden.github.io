(function () {
  const root = document.documentElement;

  function apply(enabled) {
    root.classList.toggle('dark-mode', enabled);
    try {
      localStorage.setItem('darkMode', enabled ? 'enabled' : 'disabled');
    } catch (e) { /* storage may be blocked */ }
  }

  function ensureToggle() {
    if (document.querySelector('.dark-mode-toggle')) return;
    const wrap = document.createElement('div');
    wrap.className = 'dark-mode-toggle';
    wrap.setAttribute('aria-label', 'Toggle dark mode');
    wrap.innerHTML = `
      <label class="switch">
        <input type="checkbox" id="dark-mode-toggle-btn" />
        <span class="slider round"></span>
      </label>
    `;
    document.body.appendChild(wrap);
  }

  function init() {
    ensureToggle();
    const btn = document.getElementById('dark-mode-toggle-btn');
    if (!btn) return;

    let stored = null;
    try { stored = localStorage.getItem('darkMode'); } catch (e) {}
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const enabled = stored ? stored === 'enabled' : prefersDark;

    apply(enabled);
    btn.checked = enabled;
    btn.addEventListener('change', () => apply(btn.checked));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
