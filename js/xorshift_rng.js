function seedXorshiftState() {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  xorshiftState = buffer[0];
}

function xorshift() {
  xorshiftState ^= xorshiftState << 13;
  xorshiftState ^= xorshiftState >> 17;
  xorshiftState ^= xorshiftState << 5;
  return xorshiftState;
}

function getBetterRandom() {
  return (xorshift() >>> 0) / (0xFFFFFFFF + 1);
}

seedXorshiftState();
