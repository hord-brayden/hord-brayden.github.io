// Tiny seeded PRNGs used by the testing kit.
// All `random()` methods return a uniform float in [0, 1).

export class XORShift {
  // 32-bit xorshift (Marsaglia, 2003). Period = 2^32 - 1.
  // Note: a 32-bit xorshift is fine for visualization but is *not*
  // cryptographically secure and fails several SP 800-22 tests at
  // long lengths.
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

export class LCG {
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
