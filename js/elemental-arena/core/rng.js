/* Seeded PRNG for the Elemental Arena.
 *
 * Every stochastic decision in the simulation draws from one of these,
 * never from Math.random(). That is what makes a seed reproduce a match
 * exactly: same seed + same config => same fight, frame for frame.
 *
 * mulberry32 is used rather than the site's xorshift128+ because it needs
 * only 32 bits of state, which means a whole RNG can be snapshotted and
 * restored in a single integer — handy for replay scrubbing later.
 */

/** FNV-1a. Turns an arbitrary seed string into a 32-bit integer. */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Avoid the zero state, which mulberry32 handles but which makes the
  // first few outputs suspiciously small.
  return (h >>> 0) || 0x9e3779b9;
}

export class Rng {
  constructor(seed) {
    this.seedString = String(seed);
    this.state = hashSeed(seed);
  }

  /** Uniform in [0, 1). */
  next() {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [min, max). */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p. */
  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Fisher-Yates, in place. Returns the same array for chaining. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /** Random unit vector, written into `out` to avoid allocating per call. */
  unit(out = { x: 0, y: 0 }) {
    const a = this.next() * Math.PI * 2;
    out.x = Math.cos(a);
    out.y = Math.sin(a);
    return out;
  }

  /** Weighted pick. `weightOf` maps an item to a non-negative number. */
  weighted(items, weightOf) {
    let total = 0;
    for (let i = 0; i < items.length; i++) total += weightOf(items[i]);
    if (total <= 0) return items[0];
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weightOf(items[i]);
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  /** Fork an independent stream. Useful for cosmetic-only randomness that
   *  must not perturb the simulation stream (see `Engine.cosmeticRng`). */
  fork(tag) {
    return new Rng(`${this.seedString}::${tag}`);
  }
}

const SEED_WORDS = [
  'ember', 'quartz', 'tide', 'gale', 'cinder', 'frost', 'bramble', 'volt',
  'obsidian', 'aurora', 'basalt', 'mirage', 'cobalt', 'thorn', 'zephyr',
  'magma', 'glacier', 'static', 'loam', 'prism', 'venom', 'rune', 'halo',
  'dusk', 'flint', 'surge', 'moss', 'shard', 'nova', 'abyss'
];

/** A pronounceable, memorable seed — nicer to share than a raw number. */
export function randomSeedPhrase() {
  const r = Math.random;
  const a = SEED_WORDS[Math.floor(r() * SEED_WORDS.length)];
  const b = SEED_WORDS[Math.floor(r() * SEED_WORDS.length)];
  const n = Math.floor(r() * 1000).toString().padStart(3, '0');
  return `${a}-${b}-${n}`;
}
