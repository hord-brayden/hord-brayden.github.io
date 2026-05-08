class HeaderComponent extends HTMLElement {
  connectedCallback() {
    const current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const links = [
      { href: 'index.html',     label: 'Home' },
      { href: 'resume.html',    label: 'Resume' },
      { href: 'testing-kit.html', label: 'NIST Kit' },
      { href: 'f1-timer.html',  label: 'Reaction Timer' },
      { href: 'https://github.com/hord-brayden/', label: 'GitHub', external: true }
    ];
    const items = links.map(l => {
      const isActive = !l.external && l.href.toLowerCase() === current;
      const target = l.external ? ' target="_blank" rel="noopener"' : '';
      return `<li><a href="${l.href}"${target} class="${isActive ? 'active' : ''}">${l.label}</a></li>`;
    }).join('');

    this.innerHTML = `
      <link rel="stylesheet" href="styles.css">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
      <header class="site-header">
        <nav>
          <a class="brand" href="index.html">hord<span class="brand-dot">.</span>brayden</a>
          <div class="hamburger-menu" aria-label="menu" role="button" tabindex="0">
            <div class="bar"></div><div class="bar"></div><div class="bar"></div>
          </div>
          <ul>${items}</ul>
        </nav>
      </header>
    `;
    this.MathJaxconfigLoad();
  }

  MathJaxconfigLoad() {
    if (window.MathJax) return;
    window.MathJax = {
      tex: { inlineMath: [['$', '$'], ['\\(', '\\)']] },
      svg: { fontCache: 'global' }
    };
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.0/es5/tex-mml-chtml.js';
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);
  }
}

class FooterComponent extends HTMLElement {
  connectedCallback() {
    const year = new Date().getFullYear();
    this.innerHTML = `
      <footer class="site-footer">
        <div class="privacy-block footer-content">
          <a href="privacy.html">Privacy</a>
          <a href="https://github.com/hord-brayden/" target="_blank" rel="noopener">GitHub</a>
          <button id="reSeed" type="button" onclick="window.reSeed && window.reSeed()">Reseed Game of Life</button>
        </div>
        <div class="footer-content"><p>&copy; ${year} Brayden Hord - built and broken in the open.</p></div>
      </footer>
    `;
    this.loadScripts([
      'js/dark_mode_toggle.js',
      'js/hamburgesa.js',
      'js/canvi-resize.js'
    ]);
  }

  loadScripts(srcs) {
    const next = () => {
      const src = srcs.shift();
      if (!src) return;
      const s = document.createElement('script');
      s.src = src;
      s.onload = next;
      s.onerror = next;
      document.head.appendChild(s);
    };
    next();
  }
}

customElements.define('header-component', HeaderComponent);
customElements.define('footer-component', FooterComponent);
