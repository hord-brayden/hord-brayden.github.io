import { XORShift, LCG } from './rng-classes.js';

function getRNGFunction(method, seed, gameState = null) {
  switch (method) {
    case "mathRandom":
      return () => Math.random();
    case "xorShift":
      const xorShiftRng = new XORShift(seed, gameState);
      return () => xorShiftRng.random();
    case "lcg":
      const lcgRng = new LCG(seed, gameState);
      return () => lcgRng.random();
    case "cryptoRandomValues":
      return () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
    default:
      throw new Error("Unknown RNG method");
  }
}

export { getRNGFunction };
