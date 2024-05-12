class HeaderComponent extends HTMLElement {
    connectedCallback() {
      this.innerHTML = `
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
              <li><a href="f1-timer.html">Reaction Timer Game</a></li>
              <li><a href="https://github.com/hord-brayden/">My Full Github</a></li>
            <li><a href="privacy.html">Privacy</a></li>
            </ul>
          </nav>
      `;this.MathJaxconfigLoad();}
   MathJaxconfigLoad() {
    // Configure MathJax
    window.MathJax = {
        tex: {inlineMath: [['$', '$'], ['\\(', '\\)']]},
        svg: {fontCache: 'global'}
    };
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.0/es5/tex-mml-chtml.js";
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
        <button id="reSeed" onclick="reSeed()">Reseed Game Of Life</button>
        </div> 
      </footer>
    `;
    this.loadScript("js/dark_mode_toggle.js", () => {
        this.loadScript("js/hamburgesa.js", () => {
            this.loadScript("js/plot_random_numbers.js", () => {
                this.loadScript("js/password_generator.js", () => {
                    this.loadScript("js/arraymama.js", () => {
                        this.loadScript("js/xorshift_rng.js", () => {
                            this.loadScript("js/canvi-resize.js");
                            });
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
