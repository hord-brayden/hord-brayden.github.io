import { XORShift, LCG } from './rng-classes.js';

function getRNGFunction(method, seed) {
  switch (method) {
    case 'mathRandom':
      return () => Math.random();
    case 'xorShift': {
      const r = new XORShift(seed);
      return () => r.random();
    }
    case 'lcg': {
      const r = new LCG(seed);
      return () => r.random();
    }
    case 'cryptoRandomValues':
      return () => crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
    default:
      throw new Error('Unknown RNG method: ' + method);
  }
}

export { getRNGFunction };
