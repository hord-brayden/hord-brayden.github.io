import { getRNGFunction } from './rng-functions.js';
import {
  frequencyTest, benfordsLawTest, monobitTest, runsTest
} from './statistical-tests.js';
import { readJSONFile } from './file-utils.js';

const RNG_LABELS = {
  mathRandom: 'Math.random()',
  xorShift: '32-bit XORShift',
  lcg: 'Linear Congruential (Numerical Recipes)',
  cryptoRandomValues: 'crypto.getRandomValues()'
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
  const rngSelect = document.getElementById('rngSelect');
  const rngMethod = rngSelect.value;
  const jsonFileInput = document.getElementById('jsonFile');
  const sampleCountInput = document.getElementById('sampleCount');
  const jsonFile = jsonFileInput.files[0];
  const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  const generate = getRNGFunction(rngMethod, seed);

  let samples;
  let source;
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

    <p class="t-align-c" style="color:var(--muted);font-size:.85rem;margin-top:14px">
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
