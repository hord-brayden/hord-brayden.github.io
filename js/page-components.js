class HeaderComponent extends HTMLElement {
    connectedCallback() {
      this.innerHTML = `
      <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="apple-touch-icon" sizes="57x57" href="img/apple-icon-57x57.png">
        <link rel="apple-touch-icon" sizes="60x60" href="img/apple-icon-60x60.png">
        <link rel="apple-touch-icon" sizes="72x72" href="img/apple-icon-72x72.png">
        <link rel="apple-touch-icon" sizes="76x76" href="img/apple-icon-76x76.png">
        <link rel="apple-touch-icon" sizes="114x114" href="img/apple-icon-114x114.png">
        <link rel="apple-touch-icon" sizes="120x120" href="img/apple-icon-120x120.png">
        <link rel="apple-touch-icon" sizes="144x144" href="imgv/apple-icon-144x144.png">
        <link rel="apple-touch-icon" sizes="152x152" href="img/apple-icon-152x152.png">
        <link rel="apple-touch-icon" sizes="180x180" href="img/apple-icon-180x180.png">
        <link rel="icon" type="image/png" sizes="192x192"  href="img/android-icon-192x192.png">
        <link rel="icon" type="image/png" sizes="32x32" href="img/favicon-32x32.png">
        <link rel="icon" type="image/png" sizes="96x96" href="img/favicon-96x96.png">
        <link rel="icon" type="image/png" sizes="16x16" href="img/favicon-16x16.png">
        <link rel="manifest" href="/manifest.json">
        <meta name="msapplication-TileColor" content="#ffffff">
        <meta name="msapplication-TileImage" content="img/ms-icon-144x144.png">
        <meta name="theme-color" content="#ffffff">
      <link rel="stylesheet" href="styles.css">
          <title>Random Password Generator</title>
          <nav>
            <div class="hamburger-menu">
              <div class="bar"></div>
              <div class="bar"></div>
              <div class="bar"></div>
            </div>
            <ul>
              <li><a href="index.html">Home</a></li>
              <li><a href="testing-kit.html">NIST Style Testing Kit</a></li>
              <li><a href="privacy.html">Privacy</a></li>
              <li><a href="https://github.com/hord-brayden/">My Full Github</a></li>
            </ul>
          </nav>
        </head>
      `;this.MathJaxconfigLoad();}
   MathJaxconfigLoad() {
    // Configure MathJax
    window.MathJax = {
        tex: {inlineMath: [['$', '$'], ['\\(', '\\)']]},
        svg: {fontCache: 'global'}
    };
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.0/es5/tex-mml-chtml.js";
    ;(function () {
    var src = '//cdn.jsdelivr.net/npm/eruda';
    if (!/eruda=true/.test(window.location) && localStorage.getItem('active-eruda') != 'true') return;
    document.write('<script src="' + src + '"></script>');
    document.write('<script>eruda.init();</script>');
})();
    // need a new hash
    // script.integrity = "new-correct-hash"; 
    script.crossOrigin = "anonymous";
    document.head.appendChild(script);
}
}

  class FooterComponent extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <footer>
        <div class="privacy-block footer-content">
            <a href="privacy.html">Privacy Policy</a>
        </div> 
      </footer>
    `;
    this.loadScript("js/dark_mode_toggle.js", () => {
        this.loadScript("js/hamburgesa.js", () => {
            this.loadScript("js/plot_random_numbers.js", () => {
                this.loadScript("js/password_generator.js", () => {
                    this.loadScript("js/xorshift_rng.js", () => {
                            this.loadScript("js/canvi-resize.js");
                        });
                    });
                });
            });
        });
    }

  loadScript(src, callback) {
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = src;
    script.onload = callback;
    document.head.appendChild(script);
  }
}
customElements.define('header-component', HeaderComponent);
customElements.define('footer-component', FooterComponent);  
