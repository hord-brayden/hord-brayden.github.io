# hord-brayden.github.io

Personal portfolio for Brayden Hord, plus a small playground of math,
randomness, reaction-time and orb-combat toys. Built as a static site so it is
cheap to host, fast to load, and trivial to inspect.

## Site map

- **`index.html`**: portfolio homepage. Hero, recent outcomes, what I run
  (engineering, AI, IT, innovation, automation, clients and revenue), the
  operating thesis, tools you can install, selected work, and an about /
  contact strip.
- **`resume.html`**: executive summary, what I run, selected outcomes,
  innovation highlights, full work history, tech stack, personal builds,
  education and certifications.
- **`pixel-lab.html`**: Pixel Lab, a Chrome extension for testing ad pixels
  and proving consent compliance (private beta; access by LinkedIn DM). A
  single self-contained file: screenshots and fonts are inlined. Built from
  the extension repo's `site/src/public.html` (`npm run site:build`).
- **`bid-inspector.html`**: Bid Inspector, a Chrome extension that shows the
  header-bidding auction in the browser, including losing bids and their
  creatives, with a targeting injector, snapshots and compare (private beta).
  Splash page only; the extension's code is not in this repo. The panels on
  the page are drawn in HTML in the extension's layout, not screenshots.
- **`faraday.html`**, **`faraday-brief.html`**, **`faraday-brand.html`**:
  Faraday, a sealed-browser consent audit (closed beta): the product page, a
  partner brief for web-governance platforms, and the brand sheet. Shared
  styles in `css/faraday.css`; the cage animation in `js/faraday.js`
  (respects reduced motion). Share image at `img/faraday-card.png`, source
  `img/faraday-card.svg`.
- **`elemental-arena.html`**: Elemental Arena, a bouncing-orb battle game.
  Deterministic simulation, nineteen fighter templates, three modes, a
  roguelite campaign, synthesized audio, match recording, every match
  reproducible from a seed. Source under `js/elemental-arena/`.
- **`playground.html`**: the toy shelf. Game of Life background controls,
  reaction-timer teaser, password generator (`crypto.getRandomValues()` with
  rejection sampling), Fisher-Yates array shuffle, side-by-side `Math.random`
  vs 32-bit XORShift plots, MathJax sanity check.
- **`testing-kit.html`**: NIST-style RNG testing kit. Frequency, Benford,
  Monobit (SP 800-22 section 2.1) and Runs (section 2.3) over four PRNGs:
  `Math.random()` (V8 xorshift128+), 32-bit XORShift (Marsaglia 2003), LCG
  (Numerical Recipes), and `crypto.getRandomValues()`. Simplified browser-side
  analogs of a small subset of
  [NIST SP 800-22 Rev. 1a](https://csrc.nist.gov/pubs/sp/800/22/r1/upd1/final).
- **`f1-timer.html`**: F1-style five-light reaction trainer with jump-start
  detection and a `localStorage`-persisted best time.
- **`ble-terminal.html`**: Web Bluetooth terminal for a hardware project. Not
  linked from the main nav.
- **`flight-tracking.html`**: standalone Leaflet experiment, not linked from
  the main nav.
- **`privacy.html`**: short, honest privacy policy. Google Analytics is the
  only third party; the dark-mode toggle, reaction-timer best score and
  business-card scan counter live in `localStorage`.
- **`nfc-builder.html`**: private helper that builds personalized links for
  the NFC business card. Not linked from the nav.
- **`Encrypt_Decrypt.js`**: standalone bookmarklet / devtools utility, PBKDF2
  to AES-GCM via SubtleCrypto. Not linked from the site.

Lidless, the macOS menu bar app linked from the Tools section, lives in its
own repo: [hord-brayden/lidless](https://github.com/hord-brayden/lidless)
(MIT).

Conway's Game of Life animates as the background on every page; reseed from
the footer.

## Architecture notes

- **No build step.** The header and footer are custom elements defined in
  `js/site.js`, which also owns the theme toggle (applied pre-paint to avoid
  a flash), the grouped nav menus (Tools, Play), the hamburger menu, the Game
  of Life background, debounced resize handling, and reveal animations with a
  `prefers-reduced-motion` guard.
- `js/playground.js`: password generator, array shuffler, plot drawers for
  `Math.random` and 32-bit XORShift. Reads CSS variables at runtime so plots
  theme with the rest of the page.
- `js/testing-kit.js`: ES module with RNG classes, statistical tests and the
  UI handler. Loaded only on the testing-kit page.
- `js/nfc-card.js`: the business-card experience. Does nothing unless the
  URL carries `?via=nfc`.
- `js/elemental-arena/`: the game, split into core (engine, RNG, audio,
  particles), content (fighters, weapons, statuses, packs), modes, campaign,
  render and ui.
- **One stylesheet** (`styles.css`) built around CSS custom properties: warm
  cream / deep ink in light mode, warm black / soft warm white in dark mode, a
  single terracotta-to-amber accent across themes. Typography is Fraunces
  (display, variable with `opsz`, SOFT and WONK axes), Inter (body) and
  JetBrains Mono (metadata, numerics). The Pixel Lab and Bid Inspector pages
  are self-contained and carry their own styles.
- **Icons** in `img/` are rendered from `img/favicon.svg`, so every size is
  crisp. `img/icon-1024.png` is the master.

## Running locally

It's static. Any static server works:

```sh
python3 -m http.server
```

ES modules refuse to load over `file://`, so use a server when developing.

## Privacy

Google Analytics 4 is the only analytics; there are no ad pixels and no
cookies beyond GA's. Public CDN resources (Google Fonts, MathJax, OpenStreetMap
tiles on the flight page) are disclosed in `privacy.html`. The Pixel Lab and
Bid Inspector pages serve their fonts from this site rather than from Google.
