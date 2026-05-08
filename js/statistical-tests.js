// Lightweight statistical tests for visualizing PRNG quality.
// These are simplified, browser-side analogs of the kinds of tests used in
// NIST SP 800-22 ("A Statistical Test Suite for Random and Pseudorandom
// Number Generators for Cryptographic Applications"). Pass/fail thresholds
// here use chi-squared critical values at α = 0.05.

// ---- helpers ----------------------------------------------------------------

function leadingDigit(sample) {
  // Return the leading non-zero decimal digit of `sample` in [0, 1).
  // Examples: 0.0473 -> 4 ; 0.91   -> 9 ; 0.0009 -> 9 ; 0 -> null
  if (!Number.isFinite(sample) || sample <= 0 || sample >= 1) return null;
  let x = sample;
  while (x < 0.1) x *= 10;
  const d = Math.floor(x * 10);
  return d >= 1 && d <= 9 ? d : null;
}

// Critical values for chi-squared at α = 0.05, df = 1..200 (hard-coded subset
// covers values we need). Source: standard chi-squared table.
const CHI2_05 = {
  1: 3.841, 8: 15.507, 9: 16.919, 99: 123.225, 999: 1073.643
};
function chiCrit(df) {
  if (CHI2_05[df]) return CHI2_05[df];
  // Wilson-Hilferty approximation for large df.
  const z = 1.6449; // z_{0.05}
  const t = 1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df));
  return df * t * t * t;
}

// ---- frequency / equidistribution test -------------------------------------

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
  return {
    binCounts,
    chiSquared,
    df,
    critical,
    pass: chiSquared < critical
  };
}

// ---- Benford's law test ----------------------------------------------------

function benfordsLawTest(samples) {
  const digitCounts = Array(9).fill(0);
  let usable = 0;
  for (const s of samples) {
    const d = leadingDigit(s);
    if (d !== null) { digitCounts[d - 1]++; usable++; }
  }

  // Expected probabilities by Benford's law: log10(1 + 1/d) for d = 1..9.
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
  return {
    digitCounts,
    frequencies,
    chiSquared,
    df,
    critical,
    pass: chiSquared < critical,
    usable
  };
}

// ---- Monobit (NIST SP 800-22 §2.1) -----------------------------------------
// Treats each sample as 32 bits (after scaling to a uint32) and checks that
// the proportion of 1s vs 0s is consistent with a fair coin.

function monobitTest(samples) {
  let n = 0;
  let s = 0; // sum of (+1 for 1, -1 for 0)
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
  // Two-sided p-value: erfc(s_obs / sqrt(2))
  const pValue = erfc(sObs / Math.SQRT2);
  return { ones: (n + s) / 2, zeros: (n - s) / 2, total: n, sObs, pValue, pass: pValue >= 0.01 };
}

// ---- Runs test (NIST SP 800-22 §2.3) ---------------------------------------
// Counts runs of consecutive equal bits; flags the bitstream as failing if
// the proportion of 1s is too lopsided OR the observed run count is far from
// expectation under H0 of independent bits.

function runsTest(samples) {
  const bits = [];
  for (const sample of samples) {
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) continue;
    let v = Math.floor(sample * 0x100000000) >>> 0;
    for (let i = 0; i < 32; i++) {
      bits.push(v & 1);
      v >>>= 1;
    }
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

// ---- erfc (Abramowitz & Stegun 7.1.26 approximation) ----------------------

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

export { frequencyTest, benfordsLawTest, monobitTest, runsTest };
