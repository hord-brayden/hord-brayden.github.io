/* Particle system.
 *
 * Backed by parallel typed arrays with a free-list, so a busy frame with a
 * few thousand particles allocates nothing and the GC stays quiet. Colours
 * are indices into a small palette table rather than per-particle strings,
 * which lets the renderer batch draws by colour and avoid thousands of
 * fillStyle assignments.
 *
 * Styles are declarative: gravity, drag, lifetime, size curve, shape.
 * Add one to STYLES and any element can emit it by name.
 */

export const STYLES = {
  ember:   { life: [0.5, 1.1], size: [2, 5],   grav: -60, drag: 1.4, shape: 'square', fade: 'out',  spin: 0 },
  frost:   { life: [0.6, 1.3], size: [2, 4],   grav: 30,  drag: 2.0, shape: 'square', fade: 'out',  spin: 6 },
  spark:   { life: [0.2, 0.5], size: [1, 3],   grav: 0,   drag: 3.5, shape: 'streak', fade: 'out',  spin: 0 },
  rubble:  { life: [0.5, 1.0], size: [3, 6],   grav: 620, drag: 0.6, shape: 'square', fade: 'none', spin: 9 },
  droplet: { life: [0.4, 0.9], size: [2, 4],   grav: 420, drag: 0.8, shape: 'circle', fade: 'out',  spin: 0 },
  leaf:    { life: [0.9, 1.8], size: [3, 5],   grav: 70,  drag: 1.8, shape: 'square', fade: 'out',  spin: 5 },
  mote:    { life: [0.6, 1.2], size: [2, 4],   grav: -30, drag: 1.6, shape: 'circle', fade: 'out',  spin: 0 },
  smoke:   { life: [0.7, 1.5], size: [4, 9],   grav: -40, drag: 2.2, shape: 'circle', fade: 'out',  spin: 2 },
  gust:    { life: [0.3, 0.7], size: [2, 6],   grav: 0,   drag: 1.0, shape: 'streak', fade: 'out',  spin: 0 },
  shard:   { life: [0.4, 0.9], size: [2, 4],   grav: 380, drag: 0.9, shape: 'square', fade: 'none', spin: 12 },
  rune:    { life: [0.6, 1.2], size: [3, 6],   grav: -20, drag: 1.5, shape: 'square', fade: 'out',  spin: 4 },
  toxin:   { life: [0.8, 1.6], size: [3, 6],   grav: -25, drag: 1.9, shape: 'circle', fade: 'out',  spin: 0 },
  blood:   { life: [0.4, 0.8], size: [2, 4],   grav: 540, drag: 0.7, shape: 'square', fade: 'none', spin: 0 },
  dust:    { life: [0.3, 0.8], size: [2, 5],   grav: 20,  drag: 2.4, shape: 'circle', fade: 'out',  spin: 0 },
  paint:   { life: [0.3, 0.6], size: [3, 7],   grav: 0,   drag: 3.0, shape: 'square', fade: 'out',  spin: 0 },
};

export class Particles {
  constructor(capacity = 4000) {
    this.cap = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.rot = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.styleIdx = new Uint8Array(capacity);
    this.colorIdx = new Uint16Array(capacity);
    this.alive = new Uint8Array(capacity);

    this.styleNames = Object.keys(STYLES);
    this.styleList = this.styleNames.map((n) => STYLES[n]);
    this.styleIndex = new Map(this.styleNames.map((n, i) => [n, i]));

    // Colour de-duplication: many particles share a handful of colours,
    // so the renderer can group by index and set fillStyle once per group.
    this.colors = ['#ffffff'];
    this.colorLookup = new Map([['#ffffff', 0]]);

    this.free = new Int32Array(capacity);
    for (let i = 0; i < capacity; i++) this.free[i] = capacity - 1 - i;
    this.freeCount = capacity;
    this.count = 0;
    this.rng = null;   // injected by the engine so bursts stay deterministic
  }

  colorId(hex) {
    let id = this.colorLookup.get(hex);
    if (id === undefined) {
      id = this.colors.length;
      this.colors.push(hex);
      this.colorLookup.set(hex, id);
    }
    return id;
  }

  /** One particle. Returns false if the pool is saturated (never throws). */
  spawn(style, x, y, vx, vy, color) {
    if (this.freeCount === 0) return false;
    const i = this.free[--this.freeCount];
    const si = this.styleIndex.get(style);
    if (si === undefined) return false;
    const def = this.styleList[si];
    const r = this.rng;

    this.x[i] = x; this.y[i] = y;
    this.vx[i] = vx; this.vy[i] = vy;
    this.age[i] = 0;
    this.life[i] = r.range(def.life[0], def.life[1]);
    this.size[i] = r.range(def.size[0], def.size[1]);
    this.rot[i] = r.range(0, Math.PI * 2);
    this.spin[i] = def.spin ? r.range(-def.spin, def.spin) : 0;
    this.styleIdx[i] = si;
    this.colorIdx[i] = this.colorId(color);
    this.alive[i] = 1;
    this.count++;
    return true;
  }

  /** Ring burst outward from a point. The workhorse for impacts. */
  burst(style, x, y, count, speed, color) {
    const c = color || this._defaultColor(style);
    const r = this.rng;
    for (let i = 0; i < count; i++) {
      const a = r.next() * Math.PI * 2;
      const s = speed * r.range(0.35, 1);
      this.spawn(style, x, y, Math.cos(a) * s, Math.sin(a) * s, c);
    }
  }

  /** Gentle emission around a radius — trails and ambient auras. */
  emit(style, x, y, radius, count, color) {
    const c = color || this._defaultColor(style);
    const r = this.rng;
    for (let i = 0; i < count; i++) {
      const a = r.next() * Math.PI * 2;
      const d = r.next() * radius;
      this.spawn(style, x + Math.cos(a) * d, y + Math.sin(a) * d,
        r.range(-30, 30), r.range(-30, 30), c);
    }
  }

  /** A directed spray — wall sparks, blood from a hit direction. */
  spray(style, x, y, dirX, dirY, count, speed, spread, color) {
    const c = color || this._defaultColor(style);
    const r = this.rng;
    const base = Math.atan2(dirY, dirX);
    for (let i = 0; i < count; i++) {
      const a = base + r.range(-spread, spread);
      const s = speed * r.range(0.4, 1);
      this.spawn(style, x, y, Math.cos(a) * s, Math.sin(a) * s, c);
    }
  }

  _defaultColor(style) {
    switch (style) {
      case 'ember': return '#ff7b2a';
      case 'frost': return '#b6f0ff';
      case 'spark': return '#fff59a';
      case 'rubble': return '#8b5e34';
      case 'droplet': return '#4aa8e8';
      case 'leaf': return '#6bbf4a';
      case 'smoke': return '#5b2d8a';
      case 'toxin': return '#84cc16';
      case 'blood': return '#c81f3f';
      default: return '#ffffff';
    }
  }

  update(dt) {
    const { x, y, vx, vy, age, life, alive, styleIdx, rot, spin } = this;
    for (let i = 0; i < this.cap; i++) {
      if (!alive[i]) continue;
      const a = age[i] + dt;
      if (a >= life[i]) {
        alive[i] = 0;
        this.free[this.freeCount++] = i;
        this.count--;
        continue;
      }
      age[i] = a;
      const def = this.styleList[styleIdx[i]];
      // Exponential drag, integrated exactly — stable at any timestep.
      const damp = def.drag ? Math.exp(-def.drag * dt) : 1;
      let nvx = vx[i] * damp;
      let nvy = vy[i] * damp + def.grav * dt;
      vx[i] = nvx; vy[i] = nvy;
      x[i] += nvx * dt;
      y[i] += nvy * dt;
      if (spin[i]) rot[i] += spin[i] * dt;
    }
  }

  clear() {
    this.alive.fill(0);
    this.freeCount = this.cap;
    for (let i = 0; i < this.cap; i++) this.free[i] = this.cap - 1 - i;
    this.count = 0;
  }
}
