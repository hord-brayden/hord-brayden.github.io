/* Procedural sound.
 *
 * Everything is synthesised with oscillators and noise buffers — no audio
 * files to load, nothing to 404 on GitHub Pages, and the whole thing is a
 * few kilobytes of code. Sounds are deliberately short and dry; in a game
 * where dozens of hits land per second, reverb turns into mud fast.
 *
 * The context starts suspended until a user gesture, per browser autoplay
 * policy, and every call is a no-op while muted.
 */

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = false;
    this.volume = 0.5;
    this.lastPlayed = new Map();
    this.noiseBuffer = null;
  }

  /** Must be called from inside a user gesture handler. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    // A limiter-ish compressor keeps a ten-ball brawl from clipping.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 12;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this.noiseBuffer = this._makeNoise();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) this.unlock();
  }

  _makeNoise() {
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Rate-limit a sound name so a burst of simultaneous hits stays musical
   *  rather than becoming a wall of phase-cancelled clicks. */
  _throttle(name, ms) {
    const now = performance.now();
    const last = this.lastPlayed.get(name) || 0;
    if (now - last < ms) return false;
    this.lastPlayed.set(name, now);
    return true;
  }

  _tone({ freq = 440, type = 'sine', dur = 0.12, gain = 0.3, sweep = 0, delay = 0 }) {
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + sweep), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noise({ dur = 0.12, gain = 0.25, filter = 'bandpass', freq = 1200, q = 1, delay = 0 }) {
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  play(name, opts = {}) {
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state === 'suspended') return;

    switch (name) {
      case 'hit': {
        if (!this._throttle('hit', 28)) return;
        const p = opts.power || 0.5;
        this._tone({ freq: 180 + p * 260, type: 'square', dur: 0.07, gain: 0.10 + p * 0.1, sweep: -120 });
        this._noise({ dur: 0.06, gain: 0.09, freq: 2400, q: 0.8 });
        break;
      }
      case 'bounce': {
        if (!this._throttle('bounce', 45)) return;
        this._tone({ freq: 320, type: 'triangle', dur: 0.05, gain: 0.05, sweep: -140 });
        break;
      }
      case 'pickup':
        this._tone({ freq: 620, type: 'square', dur: 0.07, gain: 0.16 });
        this._tone({ freq: 930, type: 'square', dur: 0.09, gain: 0.14, delay: 0.06 });
        this._tone({ freq: 1240, type: 'square', dur: 0.11, gain: 0.12, delay: 0.12 });
        break;
      case 'death':
        this._tone({ freq: 300, type: 'sawtooth', dur: 0.5, gain: 0.22, sweep: -260 });
        this._noise({ dur: 0.4, gain: 0.2, filter: 'lowpass', freq: 900 });
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => {
          this._tone({ freq: f, type: 'square', dur: 0.22, gain: 0.16, delay: i * 0.1 });
        });
        break;

      /* Ultimates each get their own gesture so you can hear which fired
       * without looking at the banner. */
      case 'ult_fire':
        this._noise({ dur: 0.7, gain: 0.3, filter: 'lowpass', freq: 1600 });
        this._tone({ freq: 90, type: 'sawtooth', dur: 0.6, gain: 0.24, sweep: 160 });
        break;
      case 'ult_ice':
        this._tone({ freq: 1600, type: 'sine', dur: 0.5, gain: 0.18, sweep: -1100 });
        this._noise({ dur: 0.45, gain: 0.16, freq: 5200, q: 2 });
        break;
      case 'ult_lightning':
        this._noise({ dur: 0.3, gain: 0.34, filter: 'highpass', freq: 2400 });
        this._tone({ freq: 70, type: 'square', dur: 0.45, gain: 0.2 });
        break;
      case 'ult_earth':
        this._tone({ freq: 52, type: 'sine', dur: 0.9, gain: 0.34, sweep: -20 });
        this._noise({ dur: 0.7, gain: 0.24, filter: 'lowpass', freq: 400 });
        break;
      case 'ult_water':
        this._noise({ dur: 0.8, gain: 0.24, filter: 'bandpass', freq: 700, q: 0.5 });
        this._tone({ freq: 220, type: 'sine', dur: 0.6, gain: 0.16, sweep: -120 });
        break;
      case 'ult_nature':
        [392, 494, 587].forEach((f, i) =>
          this._tone({ freq: f, type: 'triangle', dur: 0.5, gain: 0.14, delay: i * 0.07 }));
        break;
      case 'ult_light':
        [784, 988, 1175, 1568].forEach((f, i) =>
          this._tone({ freq: f, type: 'sine', dur: 0.6, gain: 0.13, delay: i * 0.05 }));
        break;
      case 'ult_shadow':
        this._tone({ freq: 140, type: 'sawtooth', dur: 0.8, gain: 0.22, sweep: -90 });
        this._noise({ dur: 0.6, gain: 0.14, filter: 'lowpass', freq: 600 });
        break;
      case 'ult_wind':
        this._noise({ dur: 0.9, gain: 0.26, filter: 'bandpass', freq: 1400, q: 0.4 });
        break;
      case 'ult_metal':
        this._noise({ dur: 0.35, gain: 0.28, freq: 3600, q: 1.5 });
        this._tone({ freq: 420, type: 'square', dur: 0.3, gain: 0.16, sweep: -200 });
        break;
      case 'ult_arcane':
        this._tone({ freq: 300, type: 'sine', dur: 0.8, gain: 0.2, sweep: 900 });
        this._noise({ dur: 0.5, gain: 0.14, filter: 'bandpass', freq: 2000, q: 3 });
        break;
      case 'ult_venom':
        this._tone({ freq: 260, type: 'triangle', dur: 0.7, gain: 0.18, sweep: -140 });
        this._noise({ dur: 0.6, gain: 0.16, filter: 'bandpass', freq: 900, q: 1.2 });
        break;
      default:
        break;
    }
  }
}
