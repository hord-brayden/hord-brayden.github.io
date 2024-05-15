export class XORShift {
  constructor(seed, gameState) {
      this.state = seed;
      this.gameState = gameState;
  }

  random() {
      if (this.gameState) {
          // Use the game state in some way if needed
          // For example, you could XOR with a value from the game state
          let x = this.state ^ this.gameState.someValue;
          x ^= x << 13;
          x ^= x >> 17;
          x ^= x << 5;
          this.state = x;
          return x / 4294967296 + 0.5;
      } else {
          let x = this.state;
          x ^= x << 13;
          x ^= x >> 17;
          x ^= x << 5;
          this.state = x;
          return x / 4294967296 + 0.5;
      }
  }
}

export class LCG {
  constructor(seed, gameState) {
      this.a = 1664525;
      this.c = 1013904223;
      this.m = 4294967296; // 2^32
      this.state = seed;
      this.gameState = gameState;
  }

  random() {
      if (this.gameState) {
          this.state = (this.a * (this.state ^ this.gameState.someValue) + this.c) % this.m;
      } else {
          this.state = (this.a * this.state + this.c) % this.m;
      }
      return this.state / this.m;
  }
}
