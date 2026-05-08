// Standalone 32-bit xorshift PRNG used by the homepage's "Better Random" plot.
// Seeded from crypto.getRandomValues so each page load yields a fresh stream.

(function () {
  let state;

  function seed() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    state = buf[0] || 0x9e3779b9;
  }

  function next() {
    let x = state | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    state = x | 0;
    return x >>> 0;
  }

  function getBetterRandom() {
    return next() / 0x100000000;
  }

  seed();
  window.getBetterRandom = getBetterRandom;
  window.reseedXorshift = seed;
})();
