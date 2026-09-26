(function () {
  const root = document.documentElement;

  function apply(enabled) {
    root.classList.toggle('dark-mode', enabled);
    try {
      localStorage.setItem('darkMode', enabled ? 'enabled' : 'disabled');
    } catch (e) { /* storage may be blocked */ }
  }

  function build() {
    const wrap = document.createElement('div');
    wrap.className = 'dark-mode-toggle';
    wrap.setAttribute('aria-label', 'Toggle dark mode');
    wrap.innerHTML = `
      <span class="dark-mode-label">Dark mode</span>
      <label class="switch">
        <input type="checkbox" id="dark-mode-toggle-btn" />
        <span class="slider round"></span>
      </label>
    `;
    return wrap;
  }

  /**
   * Put the toggle in the nav rather than floating it over the page.
   *
   * As a fixed element bottom-right it sat on top of whatever was there —
   * on the arena page that is the launch button and the match controls. In
   * the nav list it rides inside the hamburger on a phone and sits inline on
   * a desktop, which is where a site-wide setting belongs anyway.
   *
   * The header is a custom element and may not have rendered yet, so this
   * watches for the list and moves in when it appears, falling back to the
   * old floating position only if the nav never arrives.
   */
  function place() {
    if (document.querySelector('nav .dark-mode-toggle')) return true;
    const list = document.querySelector('header-component nav ul, header nav ul, nav ul');
    if (!list) return false;
    const existing = document.querySelector('.dark-mode-toggle');
    const wrap = existing || build();
    const li = document.createElement('li');
    li.className = 'nav-theme';
    li.appendChild(wrap);
    list.appendChild(li);
    return true;
  }

  function ensureToggle() {
    if (place()) return;
    if (!document.querySelector('.dark-mode-toggle')) {
      document.body.appendChild(build());
    }
    // The header renders asynchronously; move in as soon as it exists.
    const obs = new MutationObserver(() => {
      if (place()) obs.disconnect();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 8000);
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
