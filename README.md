# hord-brayden.github.io

Personal portfolio plus a small playground of math, randomness, and
reaction-time toys. Built as a static site so it's cheap to host, fast to
load, and trivial to inspect.

## Site map

- **`index.html`** — Portfolio homepage. Hero, the outcomes that matter,
  selected work cards (Deazlebub, Datum Veil, AONS, direct-mail attribution,
  Arena Regulatus, ESP32 garage indicator, etc.), and an about / contact
  strip.
- **`resume.html`** — Director-level summary, full work history, tech stack,
  personal builds, education, and certifications.
- **`playground.html`** — The toy shelf. Game of Life background controls,
  F1-style reaction timer teaser, password generator
  (`crypto.getRandomValues()` with rejection sampling), Fisher-Yates array
  shuffle, side-by-side `Math.random` vs 32-bit XORShift plots, MathJax
  sanity check.
- **`testing-kit.html`** — NIST-style RNG testing kit. Frequency / Benford /
  Monobit (SP 800-22 §2.1) / Runs (§2.3) over four PRNGs: `Math.random()`
  (V8 xorshift128+), 32-bit XORShift (Marsaglia 2003), LCG (Numerical
  Recipes), and `crypto.getRandomValues()`. Simplified browser-side analogs
  of a small subset of [NIST SP 800-22 Rev. 1a](https://csrc.nist.gov/pubs/sp/800/22/r1/upd1/final).
- **`f1-timer.html`** — F1-style five-light reaction trainer with
  jump-start detection and a `localStorage`-persisted best time.
- **`flight-tracking.html`** — Standalone Leaflet experiment, not linked
  from the main nav.
- **`privacy.html`** — Short, honest privacy policy. The static site
  collects nothing; the dark-mode toggle and reaction-timer best score
  live in `localStorage` only.
- **`Encrypt_Decrypt.js`** — Standalone bookmarklet / devtools utility:
  PBKDF2 → AES-GCM via SubtleCrypto. Not linked from the site.

Conway's Game of Life animates as the background on every page; reseed
from the footer.

## Architecture notes

- **Three JavaScript bundles**, no build step:
  - `js/site.js` — header / footer custom elements, theme toggle (applied
    pre-paint to avoid FOUC), hamburger menu, Game of Life background,
    debounced resize handling, reveal animations with
    `prefers-reduced-motion` guard.
  - `js/playground.js` — password generator, array shuffler, plot
    drawers for `Math.random` and 32-bit XORShift. Reads CSS variables
    at runtime so plots theme with the rest of the page.
  - `js/testing-kit.js` — ES module: RNG classes, statistical tests,
    UI handler. Loaded only on the testing-kit page.
- **One stylesheet** (`styles.css`) built around CSS custom properties:
  warm cream / deep ink in light mode, warm black / soft warm white in
  dark mode, single terracotta-to-amber accent across themes.
  Typography is Fraunces (display, variable with `opsz` + SOFT + WONK
  axes) + Inter (body) + JetBrains Mono (metadata, numerics).

## Running locally

It's static. Any static server works:

```sh
python3 -m http.server
```

ES modules refuse to load over `file://`, so use a server when
developing.

## Privacy

No analytics, no cookies, no tracking pixels. Public CDN resources
(Google Fonts, MathJax, OpenStreetMap tiles on the flight page) are
disclosed in `privacy.html`. Nothing identifying about visitors leaves
the browser.
