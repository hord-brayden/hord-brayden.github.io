class HeaderComponent extends HTMLElement {
    connectedCallback() {
      this.innerHTML = `
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="styles.css">
        <header>
          <nav>
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
      </footer>
      `;
    }
  }
  
customElements.define('header-component', HeaderComponent);
customElements.define('footer-component', FooterComponent);  