/* ============================================================
   testing-kit.js — NIST-style RNG statistical testing kit.
   Consolidates: rng-classes, rng-functions, statistical-tests,
                 file-utils, rng-test.
   Loaded as ES module from testing-kit.html.
   ============================================================ */

// ------------------------------------------------------------
// PRNG classes (seeded)
// ------------------------------------------------------------

class XORShift {
  // 32-bit xorshift (Marsaglia, 2003). Period = 2^32 - 1.
  // Statistically decent for visualization; fails several SP 800-22
  // tests at long lengths and is NOT cryptographically secure.
  constructor(seed) {
    let s = (seed >>> 0) || 0xdeadbeef;
    if (s === 0) s = 0x9e3779b9;
    this.state = s;
  }
  random() {
    let x = this.state | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x | 0;
    return (x >>> 0) / 0x100000000;
  }
}

class LCG {
  // Numerical Recipes parameters (Park-Miller-style 32-bit LCG).
  constructor(seed) {
    this.a = 1664525;
    this.c = 1013904223;
    this.m = 0x100000000; // 2^32
    this.state = ((seed >>> 0) || 1) % this.m;
  }
  random() {
    this.state = (Math.imul(this.a, this.state) + this.c) >>> 0;
    return this.state / this.m;
  }
}

// ------------------------------------------------------------
// RNG factory
// ------------------------------------------------------------

function getRNGFunction(method, seed) {
  switch (method) {
    case 'mathRandom':         return () => Math.random();
    case 'xorShift':           { const r = new XORShift(seed); return () => r.random(); }
    case 'lcg':                { const r = new LCG(seed);      return () => r.random(); }
    case 'cryptoRandomValues': return () => crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
    default: throw new Error('Unknown RNG method: ' + method);
  }
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function leadingDigit(sample) {
  // Leading non-zero decimal digit of `sample` in [0, 1).
  // 0.0473 → 4; 0.91 → 9; 0.0009 → 9; 0 → null
  if (!Number.isFinite(sample) || sample <= 0 || sample >= 1) return null;
  let x = sample;
  while (x < 0.1) x *= 10;
  const d = Math.floor(x * 10);
  return d >= 1 && d <= 9 ? d : null;
}

// Chi-squared critical values at α = 0.05 for common df.
const CHI2_05 = { 1: 3.841, 8: 15.507, 9: 16.919, 99: 123.225, 999: 1073.643 };
function chiCrit(df) {
  if (CHI2_05[df]) return CHI2_05[df];
  // Wilson-Hilferty approximation for large df.
  const z = 1.6449;
  const t = 1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df));
  return df * t * t * t;
}

// Abramowitz & Stegun 7.1.26 approximation of erfc.
function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 +
    t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 +
    t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
  );
  return x >= 0 ? r : 2 - r;
}

// ------------------------------------------------------------
// Statistical tests
// ------------------------------------------------------------

function frequencyTest(samples, numBins) {
  const binCounts = Array(numBins).fill(0);
  for (const s of samples) {
    if (s >= 0 && s < 1) {
      const idx = Math.min(numBins - 1, Math.floor(s * numBins));
      binCounts[idx]++;
    }
  }
  const expected = samples.length / numBins;
  const chiSquared = binCounts.reduce((sum, count) => {
    const diff = count - expected;
    return sum + (diff * diff) / expected;
  }, 0);
  const df = numBins - 1;
  const critical = chiCrit(df);
  return { binCounts, chiSquared, df, critical, pass: chiSquared < critical };
}

function benfordsLawTest(samples) {
  const digitCounts = Array(9).fill(0);
  let usable = 0;
  for (const s of samples) {
    const d = leadingDigit(s);
    if (d !== null) { digitCounts[d - 1]++; usable++; }
  }
  const expectedProbs = Array.from({ length: 9 }, (_, i) => Math.log10(1 + 1 / (i + 1)));
  const chiSquared = digitCounts.reduce((sum, count, i) => {
    const expected = expectedProbs[i] * usable;
    if (expected === 0) return sum;
    const diff = count - expected;
    return sum + (diff * diff) / expected;
  }, 0);
  const frequencies = digitCounts.map((c) => (usable > 0 ? c / usable : 0));
  const df = 8;
  const critical = chiCrit(df);
  return { digitCounts, frequencies, chiSquared, df, critical, pass: chiSquared < critical, usable };
}

function monobitTest(samples) {
  let n = 0, s = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) continue;
    let bits = Math.floor(sample * 0x100000000) >>> 0;
    for (let i = 0; i < 32; i++) {
      s += (bits & 1) ? 1 : -1;
      bits >>>= 1;
      n++;
    }
  }
  const sObs = Math.abs(s) / Math.sqrt(n);
  const pValue = erfc(sObs / Math.SQRT2);
  return { ones: (n + s) / 2, zeros: (n - s) / 2, total: n, sObs, pValue, pass: pValue >= 0.01 };
}

function runsTest(samples) {
  const bits = [];
  for (const sample of samples) {
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) continue;
    let v = Math.floor(sample * 0x100000000) >>> 0;
    for (let i = 0; i < 32; i++) { bits.push(v & 1); v >>>= 1; }
  }
  const n = bits.length;
  if (n < 100) return { pass: false, pValue: 0, note: 'not enough bits' };

  let ones = 0;
  for (const b of bits) ones += b;
  const pi = ones / n;
  if (Math.abs(pi - 0.5) >= 2 / Math.sqrt(n)) {
    return { pass: false, pValue: 0, n, pi, note: 'frequency precondition failed' };
  }
  let vObs = 1;
  for (let i = 1; i < n; i++) if (bits[i] !== bits[i - 1]) vObs++;
  const num = Math.abs(vObs - 2 * n * pi * (1 - pi));
  const den = 2 * Math.sqrt(2 * n) * pi * (1 - pi);
  const pValue = erfc(num / den);
  return { n, pi, vObs, pValue, pass: pValue >= 0.01 };
}

// ------------------------------------------------------------
// File utilities
// ------------------------------------------------------------

function readJSONFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try { resolve(JSON.parse(event.target.result)); }
      catch (error) { reject(error); }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// ------------------------------------------------------------
// UI / test runner
// ------------------------------------------------------------

const RNG_LABELS = {
  mathRandom:         'Math.random()',
  xorShift:           '32-bit XORShift',
  lcg:                'Linear Congruential (Numerical Recipes)',
  cryptoRandomValues: 'crypto.getRandomValues()',
};

function fmt(n, p = 3) {
  if (!Number.isFinite(n)) return String(n);
  if (Math.abs(n) >= 1000) return n.toExponential(p);
  return n.toFixed(p);
}

function badge(pass) {
  const cls = pass ? 'frequencyPass' : 'frequencyFalse';
  return `<span class="${cls}">${pass ? 'PASS' : 'FAIL'}</span>`;
}

async function runTests() {
  const rngMethod = document.getElementById('rngSelect').value;
  const jsonFileInput = document.getElementById('jsonFile');
  const sampleCountInput = document.getElementById('sampleCount');
  const jsonFile = jsonFileInput.files[0];
  const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  const generate = getRNGFunction(rngMethod, seed);

  let samples, source;
  if (jsonFile) {
    samples = await readJSONFile(jsonFile);
    if (!Array.isArray(samples)) throw new Error('JSON must be an array of numbers in [0, 1).');
    source = `JSON file: ${jsonFile.name} (${samples.length.toLocaleString()} samples)`;
  } else {
    const n = Math.max(1000, Math.min(1000000, parseInt(sampleCountInput.value, 10) || 100000));
    samples = new Array(n);
    for (let i = 0; i < n; i++) samples[i] = generate();
    source = `${n.toLocaleString()} samples generated in-browser (seed ${seed})`;
  }

  const numBins = 100;
  const freq = frequencyTest(samples, numBins);
  const benford = benfordsLawTest(samples);
  const mono = monobitTest(samples);
  const runs = runsTest(samples);

  const binSize = 1 / numBins;
  const formattedBinCounts = freq.binCounts.map((count, i) => {
    const lo = (i * binSize).toFixed(2);
    const hi = ((i + 1) * binSize).toFixed(2);
    return `Bin ${String(i + 1).padStart(3)} (${lo}-${hi}): ${count}`;
  }).join('<br>');

  const formattedDigits = benford.digitCounts.map((c, i) => {
    const expected = (Math.log10(1 + 1 / (i + 1)) * benford.usable).toFixed(0);
    return `Digit ${i + 1}: ${String(c).padStart(6)}  (expected ~${expected})`;
  }).join('<br>');

  const results = document.getElementById('results');
  results.innerHTML = `
    <h2 class="main-label">RNG Method: ${RNG_LABELS[rngMethod] || rngMethod}</h2>
    <p class="t-align-c"><span class="pill">${source}</span></p>

    <div class="results-container">
      <div class="standard-chi-results">
        <h2 class="main-label">Frequency / Equidistribution</h2>
        <p class="main-label">${badge(freq.pass)} &chi;<sup>2</sup> = ${fmt(freq.chiSquared)} (df = ${freq.df}; critical = ${fmt(freq.critical)})</p>
        <div class="bin-counts"><p>Bin Counts (${numBins} bins):</p><pre>${formattedBinCounts}</pre></div>
      </div>
      <div class="benfords-chi-results">
        <h2 class="main-label">Benford's Law (1st significant digit)</h2>
        <p class="main-label">${badge(benford.pass)} &chi;<sup>2</sup> = ${fmt(benford.chiSquared)} (df = ${benford.df}; critical = ${fmt(benford.critical)})</p>
        <div class="digit-counts"><p>Digit Counts:</p><pre>${formattedDigits}</pre></div>
      </div>
    </div>

    <div class="results-container">
      <div class="standard-chi-results">
        <h2 class="main-label">Monobit Test (NIST SP 800-22 §2.1)</h2>
        <p class="main-label">${badge(mono.pass)} p-value = ${fmt(mono.pValue, 5)}</p>
        <div class="bin-counts"><pre>0-bits: ${mono.zeros}\n1-bits: ${mono.ones}\nimbalance s_obs = ${fmt(mono.sObs)}\ntotal bits: ${mono.total.toLocaleString()}</pre></div>
      </div>
      <div class="benfords-chi-results">
        <h2 class="main-label">Runs Test (NIST SP 800-22 §2.3)</h2>
        <p class="main-label">${badge(runs.pass)} p-value = ${fmt(runs.pValue || 0, 5)}</p>
        <div class="digit-counts"><pre>${runs.note ? runs.note : `bits n = ${runs.n.toLocaleString()}\nproportion of 1s = ${fmt(runs.pi, 4)}\nobserved runs V_n = ${runs.vObs.toLocaleString()}`}</pre></div>
      </div>
    </div>

    <p class="t-align-c" style="color:var(--muted);font-size:.85rem;margin-top:18px">
      Pass thresholds: chi-squared at &alpha;=0.05; NIST tests at p &ge; 0.01.
      A single failed run is not proof of a broken RNG &mdash; rerun a few times to estimate behavior.
    </p>
  `;
}

document.getElementById('runTestsButton').addEventListener('click', () => {
  runTests().catch((err) => {
    document.getElementById('results').innerHTML =
      `<p class="frequencyFalse">Error: ${err.message || err}</p>`;
  });
});
