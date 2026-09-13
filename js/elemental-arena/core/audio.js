/* Procedural sound.
 *
 * Everything is synthesised from oscillators and noise — no audio files to
 * load, nothing to 404 on GitHub Pages, and the whole thing is a few kilobytes
 * of code. Sounds are deliberately short and dry; in a game where dozens of
 * hits land per second, reverb turns into mud immediately.
 *
 * This module owns the *primitives* (tone, noise, fm, thud) and the routing.
 * What an individual weapon or core actually sounds like lives in
 * content/sounds.js, so the sound design can be edited without touching any
 * WebAudio plumbing.
 *
 * Two things keep a busy fight from becoming noise:
 *  - a voice budget, so a ten-orb brawl cannot stack ninety oscillators;
 *  - per-event throttling with a little pitch drift, so repeated hits read as
 *    a flurry rather than one sample machine-gunning.
 */

import { weaponVoice, coreVoice, clashParts } from '../content/sounds.js';

const MAX_VOICES = 64;

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = false;
    this.volume = 0.5;
    this.lastPlayed = new Map();
    this.noiseBuffer = null;
    this.voices = 0;
    this.drift = 1;      // per-event pitch jitter, set before a recipe runs
    this.pan = 0;        // per-event stereo placement, likewise
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
    // Catches peaks in a ten-orb brawl without squashing everything else —
    // the old settings were aggressive enough to flatten impacts into clicks.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -9;
    comp.ratio.value = 5;
    comp.knee.value = 14;
    comp.attack.value = 0.006;
    comp.release.value = 0.22;

    // A gentle high shelf cut takes the brittle, chiptune edge off the top
    // without dulling the transient that makes an impact read as an impact.
    const tame = this.ctx.createBiquadFilter();
    tame.type = 'highshelf';
    tame.frequency.value = 7000;
    tame.gain.value = -5;

    this.master.connect(tame);
    tame.connect(comp);
    comp.connect(this.ctx.destination);
    // Held so a screen recording can tap the finished mix rather than the
    // raw master, i.e. exactly what the speakers get.
    this.outputBus = comp;
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

  get ready() {
    return this.enabled && this.ctx && this.ctx.state !== 'suspended';
  }

  _makeNoise() {
    const len = this.ctx.sampleRate * 0.6;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Rate-limit an event so a burst of simultaneous hits stays musical. */
  _throttle(name, ms) {
    const now = performance.now();
    const last = this.lastPlayed.get(name) || 0;
    if (now - last < ms) return false;
    this.lastPlayed.set(name, now);
    return true;
  }

  /** Reserve voice slots; returns false when the budget is spent. */
  _claim(n = 1) {
    if (this.voices + n > MAX_VOICES) return false;
    this.voices += n;
    return true;
  }

  _release(n = 1) {
    this.voices = Math.max(0, this.voices - n);
  }

  /**
   * A MediaStream of the finished mix, for recording the match with sound.
   * Returns null when audio has never been unlocked, in which case the
   * recording is simply silent rather than failing.
   */
  captureStream() {
    if (!this.ctx || !this.outputBus) return null;
    if (!this._streamDest) {
      this._streamDest = this.ctx.createMediaStreamDestination();
      this.outputBus.connect(this._streamDest);
    }
    return this._streamDest.stream;
  }

  /* ---------------------------------------------------------- primitives */

  /** A plain oscillator with an exponential decay. */
  tone({ freq = 440, type = 'sine', dur = 0.12, gain = 0.3, sweep = 0, delay = 0 }) {
    if (!this.ready || !this._claim()) return;
    const t0 = this.ctx.currentTime + delay;
    const f = Math.max(20, freq * this.drift);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t0);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f + sweep), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    osc.onended = () => this._release();
  }

  /** Filtered noise. `sweepTo` moves the filter, which is what turns a hiss
   *  into a splash, a gust or a squelch. */
  noise({ dur = 0.12, gain = 0.25, filter = 'bandpass', freq = 1200, q = 1, delay = 0, sweepTo = 0 }) {
    if (!this.ready || !this._claim()) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(Math.max(40, freq * this.drift), t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
    src.onended = () => this._release();
  }

  /**
   * Two-operator FM. This is where metal comes from: a non-integer ratio gives
   * inharmonic partials, which is the difference between a bell, a clang and
   * a plain beep.
   */
  fm({ carrier = 900, ratio = 1.7, index = 400, dur = 0.2, gain = 0.12, delay = 0, sweep = 0 }) {
    if (!this.ready || !this._claim(2)) return;
    const t0 = this.ctx.currentTime + delay;
    const c = Math.max(20, carrier * this.drift);
    const car = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const g = this.ctx.createGain();

    car.type = 'sine';
    mod.type = 'sine';
    car.frequency.setValueAtTime(c, t0);
    if (sweep) car.frequency.exponentialRampToValueAtTime(Math.max(20, c + sweep), t0 + dur);
    mod.frequency.setValueAtTime(c * ratio, t0);

    // The modulation index decaying faster than the amplitude is what makes a
    // struck object sound struck: bright at the transient, pure as it rings.
    modGain.gain.setValueAtTime(index, t0);
    modGain.gain.exponentialRampToValueAtTime(1, t0 + dur * 0.4);

    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    mod.connect(modGain);
    modGain.connect(car.frequency);
    car.connect(g);
    g.connect(this.master);
    mod.start(t0); car.start(t0);
    mod.stop(t0 + dur + 0.02); car.stop(t0 + dur + 0.02);
    car.onended = () => this._release(2);
  }

  /**
   * Where a stereo voice goes. A little width per impact stops a flurry piling
   * up in the centre of the image and sounding like one flat source.
   */
  _dest(pan = 0) {
    if (!pan || !this.ctx.createStereoPanner) return this.master;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master);
    return p;
  }

  /**
   * Modal synthesis — the ringing modes of a struck object.
   *
   * This is the difference between a clank and a beep. A struck metal object
   * rings in many inharmonic modes at once, each decaying at its own rate;
   * two-operator FM can only ever make a clean bell, which is why the first
   * version of this sounded synthetic.
   *
   * The modes are additive sine partials rather than resonant filters. A
   * bandpass *selects* energy instead of adding any, and its ring time is
   * fixed by Q — a Q of 34 at 340Hz dies in about 30ms no matter what
   * envelope you draw on it, so the filter version was inaudible under its
   * own transient. Oscillators give exact control of both pitch and decay.
   *
   * @param {object} o
   *   base     fundamental in Hz
   *   partials [{ ratio, gain, decay }] — inharmonic ratios make it metal
   *   dur      ring length of the fundamental, in seconds
   *   strike   length of the noise transient that opens the sound
   *   noisy    how much of that transient is heard
   */
  modal({ base = 400, partials = [], dur = 0.5, gain = 0.3, strike = 0.006,
          pan = 0, delay = 0, noisy = 1 }) {
    const n = partials.length;
    if (!this.ready || !this._claim(n + 1)) return;
    const t0 = this.ctx.currentTime + delay;
    const out = this._dest(pan);

    // The strike: a few milliseconds of filtered noise. This is the sound of
    // contact, as distinct from the ring that follows it.
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(14000, base * 3.2 * this.drift);
    bp.Q.value = 0.7;
    const hitGain = this.ctx.createGain();
    hitGain.gain.setValueAtTime(gain * 0.85 * noisy, t0);
    hitGain.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.01, strike * 3));
    src.connect(bp); bp.connect(hitGain); hitGain.connect(out);
    src.start(t0);
    src.stop(t0 + 0.12);
    src.onended = () => this._release();

    for (const pt of partials) {
      const f = Math.min(15000, Math.max(28, base * pt.ratio * this.drift));
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      // A few cents of detune per partial stops a stack of pure sines reading
      // as one synthetic tone.
      osc.detune.value = (Math.random() - 0.5) * 14;

      // Higher modes die faster in any real object.
      const life = Math.max(0.04, dur * (pt.decay ?? 1) / Math.pow(pt.ratio, 0.3));
      const amp = gain * (pt.gain ?? 1);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(amp, t0 + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + life);

      osc.connect(g); g.connect(out);
      osc.start(t0);
      osc.stop(t0 + life + 0.02);
      osc.onended = () => this._release();
    }
  }

  /** A low pitched-down sine — the body of any heavy impact. */
  thud({ freq = 90, dur = 0.18, gain = 0.2, delay = 0, drop = 2.2, pan = 0 }) {
    if (!this.ready || !this._claim()) return;
    const t0 = this.ctx.currentTime + delay;
    const f = Math.max(24, freq * this.drift);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    // The pitch drop is what gives weight. A flat sine reads as a tone; one
    // that falls an octave in 50ms reads as something heavy landing.
    osc.frequency.setValueAtTime(f * drop, t0);
    osc.frequency.exponentialRampToValueAtTime(f, t0 + dur * 0.5);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this._dest(pan));
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    osc.onended = () => this._release();
  }

  /* ------------------------------------------------------------- events */

  /**
   * A landed hit: the weapon's material impact, plus the attacking core's
   * accent on top.
   * @param {object} o { weaponId, coreId, power } — power is 0..1
   */
  hit({ weaponId, coreId, power = 0.4 }) {
    // Throttle per weapon rather than globally: two different weapons landing
    // in the same instant should both be heard, or a crowded fight collapses
    // back to one repeated sound.
    if (!this.ready || !this._throttle(`hit:${weaponId}`, 34)) return;
    const w = weaponVoice(weaponId);
    const c = coreVoice(coreId);
    // A little drift per hit so a flurry sounds like many strikes rather than
    // one sample retriggering.
    this.drift = 0.94 + Math.random() * 0.12;
    const pan = (Math.random() - 0.5) * 0.5;

    // 1. Body — the "ouch". Pitched to the core's own note, dropping an
    //    octave as it lands. This is the loudest layer of every hit, and the
    //    reason an impact has weight instead of just brightness.
    this.thud({
      freq: c.note * 0.82,
      dur: 0.2 + power * 0.16,
      gain: 0.3 + power * 0.24,
      drop: 2.6,
      pan: pan * 0.4,
    });

    // 2. Ring — the weapon's material, tinted by how bright the core is.
    w.material.impact(this, { base: w.base * c.bright, power, t: w.t, pan });

    // 3. Accent — a short elemental flourish over the top.
    if (c.accent) c.accent(this, { power });
    this.drift = 1;
  }

  /**
   * A clash: both weapons' materials, the brighter one leading and the duller
   * one heard underneath as the body of the collision.
   */
  parry({ aWeaponId, bWeaponId }) {
    if (!this.ready || !this._throttle(`parry:${aWeaponId}:${bWeaponId}`, 55)) return;
    const a = weaponVoice(aWeaponId);
    const b = weaponVoice(bWeaponId);
    const { lead, under } = clashParts(aWeaponId, bWeaponId);
    const base = (a.base + b.base) / 2;
    this.drift = 0.96 + Math.random() * 0.09;
    const pan = (Math.random() - 0.5) * 0.4;

    lead.clash(this, { base, pan });
    // The duller material is heard underneath as the body of the collision,
    // which is what makes a sword on a shield sound different from two swords.
    if (under) under.impact(this, { base: base * 0.7, power: 0.5, t: b.t, pan: -pan });
    this.drift = 1;
  }

  /**
   * A wall bounce — a soft "dong" on the core's own note, so every orb has a
   * recognisable pitch as it rattles around. Bigger orbs ring lower.
   *
   * Kept quiet on purpose: bounces are the most frequent event in the game by
   * a wide margin, and anything assertive here would bury the actual fighting.
   */
  bounce({ coreId, size = 1 } = {}) {
    if (!this.ready || !this._throttle(`bounce:${coreId}`, 110)) return;
    const c = coreVoice(coreId);
    this.drift = 0.97 + Math.random() * 0.06;
    const pan = (Math.random() - 0.5) * 0.6;
    this.modal({
      base: c.note / Math.max(0.7, Math.pow(size, 0.6)),
      partials: c.bell,
      dur: c.bounceDur,
      gain: 0.2,
      strike: 0.007,
      noisy: 0.3,
      pan,
    });
    this.drift = 1;
  }

  /** Named one-offs that are not assembled from weapon and core parts. */
  play(name, opts = {}) {
    if (!this.ready) return;
    switch (name) {
      case 'hit': return this.hit(opts);
      case 'parry': return this.parry(opts);
      case 'bounce': return this.bounce(opts);

      case 'crit':
        this.fm({ carrier: 1800, ratio: 2.2, index: 900, dur: 0.22, gain: 0.12 });
        this.tone({ freq: 2600, type: 'square', dur: 0.07, gain: 0.06, sweep: 900 });
        break;
      case 'pickup':
        this.tone({ freq: 620, type: 'square', dur: 0.07, gain: 0.12 });
        this.tone({ freq: 930, type: 'square', dur: 0.09, gain: 0.1, delay: 0.06 });
        this.tone({ freq: 1240, type: 'square', dur: 0.11, gain: 0.09, delay: 0.12 });
        break;
      case 'death':
        this.thud({ freq: 70, dur: 0.5, gain: 0.22 });
        this.tone({ freq: 300, type: 'sawtooth', dur: 0.5, gain: 0.16, sweep: -260 });
        this.noise({ dur: 0.4, gain: 0.16, filter: 'lowpass', freq: 900, sweepTo: 200 });
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) =>
          this.tone({ freq: f, type: 'square', dur: 0.22, gain: 0.13, delay: i * 0.1 }));
        break;
      case 'throw':
        if (!this._throttle('throw', 55)) return;
        this.noise({ dur: 0.09, gain: 0.05, filter: 'bandpass', freq: 2600, q: 1.2, sweepTo: 4200 });
        break;
      case 'bow':
        if (!this._throttle('bow', 70)) return;
        this.tone({ freq: 240, type: 'triangle', dur: 0.12, gain: 0.07, sweep: -120 });
        this.noise({ dur: 0.08, gain: 0.05, filter: 'highpass', freq: 2600 });
        break;
      case 'shatter':
        if (!this._throttle('shatter', 60)) return;
        this.noise({ dur: 0.24, gain: 0.13, filter: 'highpass', freq: 4200 });
        this.fm({ carrier: 3400, ratio: 2.9, index: 700, dur: 0.2, gain: 0.08 });
        break;

      /* Ultimates each get their own gesture so you can hear which fired
       * without looking at the banner. */
      case 'ult_fire':
        this.noise({ dur: 0.7, gain: 0.26, filter: 'lowpass', freq: 1600, sweepTo: 380 });
        this.tone({ freq: 90, type: 'sawtooth', dur: 0.6, gain: 0.2, sweep: 160 });
        break;
      case 'ult_ice':
        this.tone({ freq: 1600, type: 'sine', dur: 0.5, gain: 0.16, sweep: -1100 });
        this.noise({ dur: 0.45, gain: 0.14, filter: 'highpass', freq: 5200 });
        break;
      case 'ult_lightning':
        this.noise({ dur: 0.3, gain: 0.3, filter: 'highpass', freq: 2400 });
        this.tone({ freq: 70, type: 'square', dur: 0.45, gain: 0.18 });
        break;
      case 'ult_earth':
        this.thud({ freq: 46, dur: 0.9, gain: 0.3 });
        this.noise({ dur: 0.7, gain: 0.2, filter: 'lowpass', freq: 400 });
        break;
      case 'ult_water':
        this.noise({ dur: 0.8, gain: 0.2, filter: 'bandpass', freq: 900, q: 0.5, sweepTo: 240 });
        this.tone({ freq: 220, type: 'sine', dur: 0.6, gain: 0.14, sweep: -120 });
        break;
      case 'ult_nature':
        [392, 494, 587].forEach((f, i) =>
          this.tone({ freq: f, type: 'triangle', dur: 0.5, gain: 0.12, delay: i * 0.07 }));
        break;
      case 'ult_light':
        [784, 988, 1175, 1568].forEach((f, i) =>
          this.tone({ freq: f, type: 'sine', dur: 0.6, gain: 0.11, delay: i * 0.05 }));
        break;
      case 'ult_shadow':
        this.tone({ freq: 140, type: 'sawtooth', dur: 0.8, gain: 0.18, sweep: -90 });
        this.noise({ dur: 0.6, gain: 0.12, filter: 'lowpass', freq: 600 });
        break;
      case 'ult_wind':
        this.noise({ dur: 0.9, gain: 0.22, filter: 'bandpass', freq: 700, q: 0.4, sweepTo: 3200 });
        break;
      case 'ult_metal':
        this.noise({ dur: 0.35, gain: 0.22, filter: 'bandpass', freq: 3600, q: 1.5 });
        this.fm({ carrier: 1400, ratio: 1.87, index: 800, dur: 0.4, gain: 0.12 });
        break;
      case 'ult_arcane':
        this.fm({ carrier: 300, ratio: 2.4, index: 900, dur: 0.8, gain: 0.16, sweep: 900 });
        break;
      case 'ult_venom':
        this.noise({ dur: 0.6, gain: 0.14, filter: 'bandpass', freq: 700, q: 2, sweepTo: 1600 });
        this.tone({ freq: 260, type: 'triangle', dur: 0.7, gain: 0.14, sweep: -140 });
        break;
      case 'ult_lancer':
        this.tone({ freq: 130, type: 'sawtooth', dur: 0.5, gain: 0.2, sweep: 320 });
        this.noise({ dur: 0.4, gain: 0.14, filter: 'bandpass', freq: 1200, q: 0.7, sweepTo: 3400 });
        break;
      case 'ult_duelist':
        for (let i = 0; i < 5; i++) {
          this.fm({ carrier: 2200 + i * 260, ratio: 1.4, index: 420, dur: 0.1, gain: 0.08, delay: i * 0.06 });
        }
        break;
      case 'ult_knife':
        this.noise({ dur: 0.35, gain: 0.18, filter: 'highpass', freq: 3000 });
        this.tone({ freq: 600, type: 'square', dur: 0.25, gain: 0.1, sweep: -380 });
        break;
      case 'ult_archer':
        this.tone({ freq: 420, type: 'triangle', dur: 0.3, gain: 0.12, sweep: -160 });
        this.noise({ dur: 0.6, gain: 0.14, filter: 'highpass', freq: 2200 });
        break;
      case 'ult_alchemist':
        [440, 554, 659, 880].forEach((f, i) =>
          this.tone({ freq: f, type: 'sine', dur: 0.4, gain: 0.1, delay: i * 0.07 }));
        break;
      case 'ult_bombardier':
        this.thud({ freq: 60, dur: 0.5, gain: 0.26 });
        this.noise({ dur: 0.5, gain: 0.2, filter: 'lowpass', freq: 1100 });
        break;
      case 'ult_bulwark':
        this.thud({ freq: 92, dur: 0.5, gain: 0.24 });
        this.fm({ carrier: 620, ratio: 1.6, index: 520, dur: 0.4, gain: 0.12 });
        break;
      default:
        break;
    }
  }
}
