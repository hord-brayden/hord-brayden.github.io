class HeaderComponent extends HTMLElement {
    connectedCallback() {
      this.innerHTML = `
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="styles.css">
        <header>
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
</header>
      `;
    }
  }

  class FooterComponent extends HTMLElement {
    connectedCallback() {
      this.innerHTML = `
      <footer>
      <div class="privacy-block footer-content">
        <a href="privacy.html">Privacy Policy</a>
      </div> 
        <script src="js/canvi-resize.js"></script>
        <script src="js/hamburgesa.js"></script>
        <script src="js/xorshift_rng.js"></script>
        <script src="js/plot_random_numbers.js"></script>
        <script src="js/password_generator.js"></script>
        <script src="js/dark_mode_toggle.js"></script>   
        <script src="js/page-components.js"></script> 
      </footer>
      `;
    }
  }
  
customElements.define('header-component', HeaderComponent);
customElements.define('footer-component', FooterComponent);  
