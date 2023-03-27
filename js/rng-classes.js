export class XORShift {
    constructor(seed) {
      this.state = seed;
    }
  
    random() {
      let x = this.state;
      x ^= x << 13;
      x ^= x >> 17;
      x ^= x << 5;
      this.state = x;
      return x / 4294967296 + 0.5;
    }
  }
  
export  class LCG {
    constructor(seed) {
      this.a = 1664525;
      this.c = 1013904223;
      this.m = 4294967296; // 2^32
      this.state = seed;
    }
  
    random() {
      this.state = (this.a * this.state + this.c) % this.m;
      return this.state / this.m;
    }
  }
  