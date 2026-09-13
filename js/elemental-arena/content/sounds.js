/* Sound design — what every impact actually sounds like.
 *
 * A hit is three layers, not one sample:
 *
 *   BODY    a deep, pitch-dropping thump at the core's own note. This is the
 *           "ouch" — the weight of being struck — and it is the loudest part
 *           of every impact. It is why nothing here sounds thin.
 *   RING    the weapon's material resonating. Modal synthesis: a short noise
 *           strike exciting a bank of inharmonic resonators, which is how a
 *           struck object actually behaves. Steel clanks, iron clunks, wood
 *           knocks, bone clacks, glass tinks.
 *   ACCENT  a short elemental flourish on top — a sizzle, a crack, a squelch.
 *
 * Every core owns a NOTE, and that note is its identity across the whole mix:
 * the body of its hits, and the "dong" when it bounces off a wall. Earth and
 * Shadow sit near the bottom of the register, Fire and Venom low, Ice and
 * Light at the top. Nothing is bright unless brightness suits it — a fire orb
 * that pings like a wine glass is simply wrong.
 *
 * To retune a core: change its note and brightness. To retune a weapon:
 * change its material or its tweak. No WebAudio knowledge needed either way.
 */

import { Weapons } from './weapons.js';

const REF_WIDTH = 30;

/* ============================================================ materials */

/*
 * Partial ratios are what make a material recognisable. A harmonic series
 * (1, 2, 3…) sounds like a musical note; these deliberately are not, because
 * struck metal, wood and glass all ring in inharmonic modes. The bar-like
 * ratios under `steel` are close to the real modes of a free steel bar.
 */
export const MATERIALS = {
  /** Bladed steel: a bright clank over a solid body. */
  steel: {
    base: 340,
    impact(A, { base, power, t, pan }) {
      A.modal({
        base,
        partials: [
          { ratio: 1, gain: 1, decay: 1 },
          { ratio: 2.76, gain: 0.72, decay: 0.72 },
          { ratio: 5.4, gain: 0.4, decay: 0.42 },
          { ratio: 8.93, gain: 0.2 * t.bright, decay: 0.25 },
        ],
        dur: (0.34 + power * 0.2) * t.decay,
        gain: (0.26 + power * 0.2) * t.gain,
        strike: 0.005,
        noisy: t.noise,
        pan,
      });
      if (t.chorus) {
        A.modal({ base: base * 1.17, partials: [{ ratio: 1, gain: 0.6 }, { ratio: 2.76, gain: 0.3 }],
                  dur: 0.22, gain: 0.12, delay: 0.012, pan: -pan });
      }
      if (t.rattle) {
        A.noise({ dur: 0.16, gain: 0.06, filter: 'bandpass', freq: base * 6, q: 6 });
      }
    },
    clash(A, { base, pan }) {
      // The classic blade-on-blade CLANG: the same modes excited harder and
      // allowed to ring three times as long as a hit on a soft target.
      A.modal({
        base,
        partials: [
          { ratio: 1, gain: 1, decay: 1 },
          { ratio: 2.76, gain: 0.85, decay: 0.9 },
          { ratio: 5.4, gain: 0.55, decay: 0.6 },
          { ratio: 8.93, gain: 0.32, decay: 0.4 },
          { ratio: 13.3, gain: 0.16, decay: 0.22 },
        ],
        dur: 1.1, gain: 0.34, strike: 0.004, pan,
      });
      A.thud({ freq: base * 0.42, dur: 0.16, gain: 0.16, drop: 2.4 });
    },
  },

  /** Blunt iron: a deep CLUNK with very little top end. */
  iron: {
    base: 170,
    impact(A, { base, power, t, pan }) {
      A.modal({
        base,
        partials: [
          { ratio: 1, gain: 1, decay: 1 },
          { ratio: 1.62, gain: 0.6, decay: 0.7 },
          { ratio: 2.31, gain: 0.35, decay: 0.45 },
          { ratio: 3.4, gain: 0.15, decay: 0.3 },
        ],
        dur: (0.4 + power * 0.2) * t.decay,
        gain: (0.3 + power * 0.22) * t.gain,
        strike: 0.008, noisy: t.noise * 1.3, pan,
      });
      A.thud({ freq: base * 0.5, dur: 0.2 * t.decay, gain: 0.2 * t.body, drop: 2.8 });
    },
    clash(A, { base, pan }) {
      A.modal({
        base,
        partials: [
          { ratio: 1, gain: 1, decay: 1 },
          { ratio: 1.62, gain: 0.75, decay: 0.85 },
          { ratio: 2.31, gain: 0.5, decay: 0.6 },
          { ratio: 3.4, gain: 0.25, decay: 0.4 },
        ],
        dur: 0.95, gain: 0.36, strike: 0.007, pan,
      });
      A.thud({ freq: base * 0.45, dur: 0.3, gain: 0.24, drop: 3 });
    },
  },

  /** Wood: a dry knock. Almost no ring — the modes die immediately. */
  wood: {
    base: 260,
    impact(A, { base, power, t, pan }) {
      A.modal({
        base,
        partials: [
          { ratio: 1, gain: 1, decay: 1 },
          { ratio: 1.47, gain: 0.5, decay: 0.6 },
          { ratio: 2.09, gain: 0.22, decay: 0.35 },
        ],
        dur: (0.16 + power * 0.06) * t.decay,
        gain: (0.28 + power * 0.18) * t.gain,
        strike: 0.01, noisy: t.noise * 1.4, pan,
      });
      A.thud({ freq: base * 0.55, dur: 0.14, gain: 0.16 * t.body, drop: 2.2 });
    },
    clash(A, { base, pan }) {
      // A hollow CLOK: two knocks a hair apart read as one hard collision.
      A.modal({ base, partials: [{ ratio: 1, gain: 1 }, { ratio: 1.47, gain: 0.6 }, { ratio: 2.09, gain: 0.3 }],
                dur: 0.3, gain: 0.32, strike: 0.009, pan });
      A.modal({ base: base * 0.78, partials: [{ ratio: 1, gain: 0.8 }], dur: 0.22, gain: 0.2,
                strike: 0.011, delay: 0.016, pan: -pan });
      A.thud({ freq: base * 0.5, dur: 0.18, gain: 0.18, drop: 2.4 });
    },
  },

  /** Bone: dry and hollow, a clack with a short woody tail. */
  bone: {
    base: 320,
    impact(A, { base, power, t, pan }) {
      A.modal({
        base,
        partials: [
          { ratio: 1, gain: 1, decay: 1 },
          { ratio: 1.73, gain: 0.55, decay: 0.5 },
          { ratio: 2.61, gain: 0.3, decay: 0.35 },
        ],
        dur: (0.2 + power * 0.08) * t.decay,
        gain: (0.26 + power * 0.16) * t.gain,
        strike: 0.006, noisy: t.noise * 1.5, pan,
      });
      A.thud({ freq: base * 0.4, dur: 0.13, gain: 0.13 * t.body, drop: 2 });
    },
    clash(A, { base, pan }) {
      A.modal({ base, partials: [{ ratio: 1, gain: 1 }, { ratio: 1.73, gain: 0.7 }, { ratio: 2.61, gain: 0.45 }],
                dur: 0.42, gain: 0.32, strike: 0.005, pan });
      A.thud({ freq: base * 0.38, dur: 0.16, gain: 0.15, drop: 2.2 });
    },
  },

  /** Glass: the one material that is meant to be bright. */
  glass: {
    base: 820,
    impact(A, { base, power, t, pan }) {
      A.modal({
        base,
        partials: [
          { ratio: 1, gain: 1, decay: 1 },
          { ratio: 2.4, gain: 0.6, decay: 0.7 },
          { ratio: 4.3, gain: 0.32, decay: 0.45 },
          { ratio: 6.8, gain: 0.16, decay: 0.3 },
        ],
        dur: (0.4 + power * 0.16) * t.decay,
        gain: (0.2 + power * 0.14) * t.gain,
        strike: 0.003, noisy: t.noise * 0.7, pan,
      });
      A.thud({ freq: 150, dur: 0.1, gain: 0.1, drop: 2 });
    },
    clash(A, { base, pan }) {
      A.modal({
        base,
        partials: [
          { ratio: 1, gain: 1, decay: 1 },
          { ratio: 2.4, gain: 0.7, decay: 0.8 },
          { ratio: 4.3, gain: 0.45, decay: 0.55 },
          { ratio: 6.8, gain: 0.28, decay: 0.35 },
        ],
        dur: 0.85, gain: 0.26, strike: 0.0025, pan,
      });
      A.noise({ dur: 0.2, gain: 0.08, filter: 'highpass', freq: 5000 });
    },
  },
};

/* ============================================================== weapons */

const WEAPON_MATERIAL = {
  sword: 'steel', katana: 'steel', dagger: 'steel', greatsword: 'steel',
  axe: 'steel', spear: 'steel', trident: 'steel', scythe: 'steel',
  rapier: 'steel', shuriken: 'steel', chakram: 'steel', caltrop: 'steel',
  hammer: 'iron', wrench: 'iron', gauntlet: 'iron', shield: 'iron',
  club: 'wood', staff: 'wood', pitchfork: 'wood', bow: 'wood',
  bone: 'bone',
  vial: 'glass', flask: 'glass',
};

/*
 * Per-weapon character on top of material and size. `bright` moves the top
 * modes, `decay` how long it rings, `noise` how much scrape is in the strike,
 * `body` the low end, `gain` the overall weight.
 */
const TWEAK_DEFAULTS = { bright: 1, decay: 1, noise: 1, gain: 1, body: 1, pitch: 1 };

const WEAPON_TWEAKS = {
  // steel
  sword:      {},
  katana:     { bright: 1.15, decay: 1.6, noise: 0.6, pitch: 1.05 },   // clean, singing
  dagger:     { bright: 1.3, decay: 0.5, gain: 0.8, pitch: 1.5 },      // short shick
  greatsword: { bright: 0.7, decay: 1.8, body: 1.8, gain: 1.3, pitch: 0.62 },
  rapier:     { bright: 1.45, decay: 0.85, noise: 0.45, body: 0.6, pitch: 1.35 },
  axe:        { bright: 0.78, decay: 0.7, noise: 2.2, body: 1.4, gain: 1.15, pitch: 0.78 },
  spear:      { bright: 1.1, decay: 0.5, noise: 0.8, body: 0.8, pitch: 1.15 },
  trident:    { bright: 1.0, decay: 1.2, chorus: true, pitch: 0.9 },
  scythe:     { bright: 0.9, decay: 1.3, noise: 2.0, pitch: 0.85 },     // slice
  shuriken:   { bright: 1.5, decay: 0.45, noise: 1.4, body: 0.5, pitch: 1.6 },
  chakram:    { bright: 1.25, decay: 1.7, noise: 0.75, pitch: 1.25 },   // whirr
  caltrop:    { bright: 1.4, decay: 0.4, rattle: true, body: 0.5, pitch: 1.7 },
  // iron
  hammer:     { bright: 0.8, decay: 1.4, body: 1.5, gain: 1.25, pitch: 0.7 },   // BANG
  wrench:     { bright: 1.15, decay: 0.9, noise: 0.85, body: 0.9, pitch: 1.1 },
  gauntlet:   { bright: 0.66, decay: 0.7, noise: 1.6, body: 1.15, gain: 0.95, pitch: 0.95 },
  shield:     { bright: 0.55, decay: 1.8, body: 1.6, noise: 0.6, gain: 1.2, pitch: 0.6 }, // CLUNK
  // wood
  club:       { decay: 1.35, body: 1.5, noise: 1.2, gain: 1.2, pitch: 0.78 },
  staff:      { decay: 0.9, body: 0.8, bright: 1.2, noise: 0.7, pitch: 1.1 },
  pitchfork:  { decay: 0.6, body: 0.7, bright: 1.45, noise: 1.6, pitch: 1.25 },
  bow:        { decay: 1.6, body: 0.7, bright: 0.72, noise: 0.5, pitch: 0.9 },  // twang
  // bone
  bone:       { decay: 1.25, noise: 1.3 },
  // glass
  vial:       { decay: 1.25, bright: 0.9, pitch: 0.95 },
  flask:      { decay: 0.8, bright: 1.2, noise: 1.5, pitch: 1.15 },
};

export function weaponVoice(weaponId) {
  const def = Weapons.get(weaponId);
  const materialId = WEAPON_MATERIAL[weaponId] || 'steel';
  const material = MATERIALS[materialId];
  const t = { ...TWEAK_DEFAULTS, ...(WEAPON_TWEAKS[weaponId] || {}) };
  // Big weapons ring low, small ones high, on a gentle curve so a greatsword
  // and a dagger differ clearly without either sounding silly.
  const size = def ? Math.pow(REF_WIDTH / def.w, 0.7) : 1;
  return { material, materialId, t, base: material.base * size * t.pitch, heavy: def ? !!def.heavy : false };
}

/* ================================================================ cores */

/*
 * Every core owns a note. It is the pitch of the body thump under its hits
 * and of the "dong" when it bounces off a wall, so a Fire orb reads as low and
 * heavy everywhere it appears while Ice reads as high and brittle.
 *
 *   note    fundamental in Hz for body and bounce
 *   bright  multiplier on the weapon's ring — under 1 darkens the metal
 *   bell    partial set for the wall bounce
 *   accent  a short flourish laid over a hit
 */
const BELL_ROUND = [{ ratio: 1, gain: 1 }, { ratio: 2.01, gain: 0.4, decay: 0.6 }, { ratio: 3.02, gain: 0.15, decay: 0.35 }];
const BELL_DARK = [{ ratio: 1, gain: 1 }, { ratio: 1.58, gain: 0.35, decay: 0.5 }, { ratio: 2.24, gain: 0.12, decay: 0.3 }];
const BELL_GLASS = [{ ratio: 1, gain: 1 }, { ratio: 2.76, gain: 0.5, decay: 0.7 }, { ratio: 5.4, gain: 0.22, decay: 0.4 }];

export const CORE_VOICES = {
  /* --- elemental --- */
  fire: {
    note: 98, bright: 0.72, bell: BELL_DARK, bounceDur: 0.34,
    accent(A) {
      A.noise({ dur: 0.34, gain: 0.1, filter: 'lowpass', freq: 620, sweepTo: 170 });
      A.thud({ freq: 74, dur: 0.24, gain: 0.12, drop: 1.7 });
    },
  },
  ice: {
    note: 523, bright: 1.5, bell: BELL_GLASS, bounceDur: 0.6,
    accent(A) {
      A.modal({ base: 1560, partials: [{ ratio: 1, gain: 1 }, { ratio: 2.4, gain: 0.4 }],
                dur: 0.3, gain: 0.09, strike: 0.002, q: 70 });
    },
  },
  lightning: {
    note: 196, bright: 1.15, bell: BELL_ROUND, bounceDur: 0.3,
    accent(A) {
      A.noise({ dur: 0.06, gain: 0.1, filter: 'highpass', freq: 3200 });
      A.thud({ freq: 58, dur: 0.16, gain: 0.13, drop: 2.6 });
    },
  },
  earth: {
    note: 62, bright: 0.5, bell: BELL_DARK, bounceDur: 0.42,
    accent(A) {
      A.thud({ freq: 44, dur: 0.36, gain: 0.2, drop: 2.2 });
      A.noise({ dur: 0.2, gain: 0.08, filter: 'lowpass', freq: 260 });
    },
  },
  water: {
    note: 147, bright: 0.85, bell: BELL_ROUND, bounceDur: 0.36,
    accent(A) {
      A.noise({ dur: 0.2, gain: 0.08, filter: 'bandpass', freq: 900, q: 1.2, sweepTo: 220 });
      A.tone({ freq: 320, type: 'sine', dur: 0.14, gain: 0.06, sweep: -190 });
    },
  },
  nature: {
    note: 131, bright: 0.8, bell: BELL_DARK, bounceDur: 0.3,
    accent(A) {
      A.noise({ dur: 0.22, gain: 0.07, filter: 'bandpass', freq: 1100, q: 1.1, sweepTo: 520 });
    },
  },
  light: {
    note: 392, bright: 1.25, bell: BELL_ROUND, bounceDur: 0.7,
    accent(A) {
      A.modal({ base: 784, partials: [{ ratio: 1, gain: 1 }, { ratio: 2.0, gain: 0.4 }, { ratio: 3.0, gain: 0.2 }],
                dur: 0.5, gain: 0.08, strike: 0.003, q: 60 });
    },
  },
  shadow: {
    note: 73, bright: 0.55, bell: BELL_DARK, bounceDur: 0.4,
    accent(A) {
      A.thud({ freq: 52, dur: 0.3, gain: 0.15, drop: 1.6 });
      A.noise({ dur: 0.2, gain: 0.06, filter: 'lowpass', freq: 500 });
    },
  },
  wind: {
    note: 262, bright: 1.0, bell: BELL_ROUND, bounceDur: 0.28,
    accent(A) {
      A.noise({ dur: 0.26, gain: 0.08, filter: 'bandpass', freq: 700, q: 0.5, sweepTo: 2400 });
    },
  },
  metal: {
    note: 175, bright: 1.1, bell: BELL_ROUND, bounceDur: 0.75,
    accent(A) {
      A.modal({ base: 700, partials: [{ ratio: 1, gain: 1 }, { ratio: 2.76, gain: 0.5 }, { ratio: 5.4, gain: 0.22 }],
                dur: 0.55, gain: 0.09, strike: 0.004, q: 56 });
    },
  },
  arcane: {
    note: 220, bright: 1.05, bell: BELL_GLASS, bounceDur: 0.5,
    accent(A) {
      A.fm({ carrier: 440, ratio: 2.4, index: 500, dur: 0.3, gain: 0.07, sweep: 260 });
    },
  },
  venom: {
    note: 110, bright: 0.7, bell: BELL_DARK, bounceDur: 0.32,
    accent(A) {
      A.noise({ dur: 0.26, gain: 0.08, filter: 'bandpass', freq: 380, q: 2.6, sweepTo: 900 });
      A.tone({ freq: 130, type: 'triangle', dur: 0.18, gain: 0.06, sweep: 70 });
    },
  },

  /* --- arsenal --- */
  lancer: {
    note: 147, bright: 0.9, bell: BELL_ROUND, bounceDur: 0.36,
    accent(A) { A.noise({ dur: 0.12, gain: 0.07, filter: 'bandpass', freq: 1400, q: 1.6, sweepTo: 2600 }); },
  },
  duelist: {
    note: 294, bright: 1.25, bell: BELL_ROUND, bounceDur: 0.4,
    accent(A) { A.modal({ base: 1180, partials: [{ ratio: 1, gain: 1 }, { ratio: 2.76, gain: 0.35 }],
                          dur: 0.22, gain: 0.07, strike: 0.002, q: 62 }); },
  },
  knifethrower: {
    note: 165, bright: 1.2, bell: BELL_DARK, bounceDur: 0.26,
    accent(A) { A.noise({ dur: 0.07, gain: 0.07, filter: 'highpass', freq: 3600 }); },
  },
  archer: {
    note: 175, bright: 0.85, bell: BELL_ROUND, bounceDur: 0.34,
    accent(A) { A.tone({ freq: 300, type: 'triangle', dur: 0.14, gain: 0.07, sweep: -150 }); },
  },
  alchemist: {
    note: 262, bright: 1.15, bell: BELL_GLASS, bounceDur: 0.5,
    accent(A) { A.modal({ base: 1046, partials: [{ ratio: 1, gain: 1 }, { ratio: 2.4, gain: 0.35 }],
                          dur: 0.3, gain: 0.07, strike: 0.0025, q: 70 }); },
  },
  bombardier: {
    note: 87, bright: 0.62, bell: BELL_DARK, bounceDur: 0.36,
    accent(A) {
      A.thud({ freq: 56, dur: 0.28, gain: 0.17, drop: 2.4 });
      A.noise({ dur: 0.18, gain: 0.07, filter: 'lowpass', freq: 900 });
    },
  },
  bulwark: {
    note: 82, bright: 0.6, bell: BELL_DARK, bounceDur: 0.48,
    accent(A) {
      A.thud({ freq: 60, dur: 0.32, gain: 0.19, drop: 2.6 });
    },
  },
};

export const DEFAULT_CORE = { note: 160, bright: 1, bell: BELL_ROUND, bounceDur: 0.35 };

export function coreVoice(coreId) {
  return CORE_VOICES[coreId] || DEFAULT_CORE;
}

/* =============================================================== clash */

/** Which material leads when two different ones collide. */
const CLASH_PRIORITY = ['glass', 'steel', 'iron', 'bone', 'wood'];

export function clashParts(aId, bId) {
  const a = WEAPON_MATERIAL[aId] || 'steel';
  const b = WEAPON_MATERIAL[bId] || 'steel';
  if (a === b) return { lead: MATERIALS[a], under: null };
  // Glass breaking beats anything; otherwise the brighter material leads and
  // the duller one is heard underneath as the body of the collision.
  const leadIsA = CLASH_PRIORITY.indexOf(a) <= CLASH_PRIORITY.indexOf(b);
  return {
    lead: MATERIALS[leadIsA ? a : b],
    under: MATERIALS[leadIsA ? b : a],
  };
}
