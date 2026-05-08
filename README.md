# hord-brayden.github.io

Personal portfolio + a small playground of math, randomness, and physics toys.

## What's here

- **Resume** (`resume.html`) - director-level summary plus the builder-flavored
  highlights and personal builds.
- **NIST-style RNG testing kit** (`testing-kit.html`) - frequency / Benford /
  Monobit / Runs tests over four PRNGs (Math.random, 32-bit XORShift, LCG,
  crypto.getRandomValues). Simplified browser-side analogs of a subset of
  [NIST SP 800-22](https://csrc.nist.gov/pubs/sp/800/22/r1/upd1/final).
- **Random plots & cryptographic password generator** (`index.html`) - small
  visualizations comparing Math.random against xorshift output, plus a
  Fisher-Yates array shuffler and a password generator using rejection
  sampling on top of `crypto.getRandomValues()`.
- **F1-style reaction timer** (`f1-timer.html`) - five-light start sequence
  with jump-start detection and a persistent best time.
- **Conway's Game of Life** runs as the page background; reseed from the footer.
- A few standalone experiments (`flight-tracking.html`, `Encrypt_Decrypt.js`)
  that aren't linked from the main nav.

## Running locally

It's a static site. Any static server works (e.g. `python3 -m http.server`).
ES modules and similar will refuse to load via `file://` URLs, so use a server
when developing locally.
