(function () {
  function init() {
    const burger = document.querySelector('.site-header .hamburger-menu');
    const menu = document.querySelector('.site-header nav ul');
    if (!burger || !menu) return;

    function toggle() {
      menu.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', menu.classList.contains('is-open'));
    }
    burger.addEventListener('click', toggle);
    burger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
