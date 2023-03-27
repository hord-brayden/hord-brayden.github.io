import { XORShift, LCG } from './rng-classes.js';

function getRNGFunction(method, seed) {
  switch (method) {
    case "mathRandom":
      return () => Math.random();
    case "xorShift":
      const xorShiftRng = new XORShift(seed);
      return () => xorShiftRng.random();
    case "lcg":
      const lcgRng = new LCG(seed);
      return () => lcgRng.random();
    case "cryptoRandomValues":
      return () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
    default:
      throw new Error("Unknown RNG method");
  }
}

export { getRNGFunction };
