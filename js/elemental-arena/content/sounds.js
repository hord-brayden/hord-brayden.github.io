/* Sound design — what every impact actually sounds like.
 *
 * A hit is two layers stacked, not one sample:
 *
 *   the WEAPON gives the impact  — what struck what, and how heavy it was.
 *                                  Driven by material and size: a dagger is a
 *                                  small bright tink, a warhammer is a low
 *                                  bang, a flask is breaking glass.
 *   the CORE gives the accent    — the elemental flavour riding on top. Fire
 *                                  sizzles, Ice cracks, Lightning snaps,
 *                                  Earth thuds, Venom squelches.
 *
 * That is why there is no combinatorial explosion: twenty-three weapons and
 * nineteen cores produce four hundred-odd recognisably different hits from
 * about thirty short recipes.
 *
 * A parry is the same idea with two weapons and no accent — the materials of
 * both blades decide whether you get a CLANG, a CLOK or a TINK.
 *
 * Every recipe receives the Audio instance and composes its primitives
 * (`tone`, `noise`, `fm`, `thud`). Nothing here touches the AudioContext
 * directly, so the whole file is safe to edit without knowing WebAudio.
 */

import { Weapons } from './weapons.js';

/* ============================================================ materials */

/* Pitch scales inversely with weapon size — a small blade rings high, a big
 * one rings low — so one recipe covers a whole family of weapons. */
const REF_WIDTH = 30;

export const MATERIALS = {
  /** Bladed steel: bright, inharmonic, with a long thin ring. */
  steel: {
    impact(A, { pitch, power, t }) {
      A.fm({ carrier: 1500 * pitch, ratio: t.ratio, index: 620 * t.bright,
             dur: 0.13 * t.decay, gain: (0.1 + power * 0.1) * t.gain });
      A.noise({ dur: 0.05 * t.decay, gain: (0.06 + power * 0.06) * t.noise,
                filter: 'bandpass', freq: 4200 * pitch * t.bright, q: 1.4 });
      A.tone({ freq: 320 * pitch * t.body, type: 'triangle', dur: 0.07 * t.decay,
               gain: 0.05 * t.body, sweep: -160 });
      // A second detuned partial is what separates a three-pronged trident
      // from a single blade of the same size and metal.
      if (t.chorus) {
        A.fm({ carrier: 1500 * pitch * 1.19, ratio: t.ratio * 0.83, index: 400,
               dur: 0.1 * t.decay, gain: 0.05, delay: 0.01 });
      }
      if (t.rattle) {
        A.noise({ dur: 0.12, gain: 0.05, filter: 'bandpass', freq: 5200 * pitch, q: 5 });
      }
    },
    clash(A, { pitch, power }) {
      // The classic blade-on-blade CLANG: two detuned bells plus a bright
      // scrape, ringing much longer than a hit on a soft target.
      A.fm({ carrier: 2100 * pitch, ratio: 1.41, index: 900, dur: 0.42, gain: 0.13 });
      A.fm({ carrier: 2680 * pitch, ratio: 2.09, index: 700, dur: 0.34, gain: 0.09, delay: 0.008 });
      A.noise({ dur: 0.09, gain: 0.11, filter: 'highpass', freq: 3600 });
      A.tone({ freq: 190 * pitch, type: 'square', dur: 0.08, gain: 0.05, sweep: -90 });
    },
  },

  /** Blunt iron: heavier, duller, more thump than ring. */
  iron: {
    impact(A, { pitch, power, t }) {
      A.thud({ freq: 120 * pitch * t.body, dur: 0.16 * t.decay, gain: (0.14 + power * 0.1) * t.gain });
      A.fm({ carrier: 720 * pitch, ratio: t.ratio, index: 320 * t.bright, dur: 0.16 * t.decay, gain: 0.07 });
      A.noise({ dur: 0.06, gain: 0.07 * t.noise, filter: 'lowpass', freq: 1800 * t.bright });
    },
    clash(A, { pitch }) {
      A.thud({ freq: 105 * pitch, dur: 0.2, gain: 0.15 });
      A.fm({ carrier: 980 * pitch, ratio: 1.51, index: 540, dur: 0.3, gain: 0.11 });
      A.noise({ dur: 0.08, gain: 0.09, filter: 'bandpass', freq: 2200, q: 1.1 });
    },
  },

  /** Wood: dry knock, no ring at all. */
  wood: {
    impact(A, { pitch, power, t }) {
      A.tone({ freq: 260 * pitch * t.body, type: 'triangle', dur: 0.08 * t.decay,
               gain: (0.1 + power * 0.07) * t.gain, sweep: -130 });
      A.noise({ dur: 0.045 * t.decay, gain: 0.07 * t.noise, filter: 'bandpass',
                freq: 1500 * pitch * t.bright, q: 2.2 });
    },
    clash(A, { pitch }) {
      // A hollow CLOK — two knocks a hair apart read as one sharp collision.
      A.tone({ freq: 300 * pitch, type: 'triangle', dur: 0.1, gain: 0.12, sweep: -170 });
      A.tone({ freq: 208 * pitch, type: 'sine', dur: 0.13, gain: 0.08, sweep: -95, delay: 0.012 });
      A.noise({ dur: 0.05, gain: 0.06, filter: 'bandpass', freq: 1100, q: 1.6 });
    },
  },

  /** Bone: dry, hollow, rattling clack. */
  bone: {
    impact(A, { pitch, power, t }) {
      A.tone({ freq: 480 * pitch, type: 'square', dur: 0.045 * t.decay,
               gain: (0.07 + power * 0.05) * t.gain, sweep: -260 });
      A.noise({ dur: 0.06, gain: 0.08 * t.noise, filter: 'bandpass', freq: 2600 * pitch * t.bright, q: 3 });
    },
    clash(A, { pitch }) {
      A.tone({ freq: 560 * pitch, type: 'square', dur: 0.06, gain: 0.09, sweep: -300 });
      A.noise({ dur: 0.11, gain: 0.09, filter: 'bandpass', freq: 3000, q: 2.4 });
      A.tone({ freq: 300 * pitch, type: 'triangle', dur: 0.09, gain: 0.05, sweep: -150, delay: 0.02 });
    },
  },

  /** Glass: a bright tink that turns into a shatter when it loses. */
  glass: {
    impact(A, { pitch, power, t }) {
      A.fm({ carrier: 3200 * pitch, ratio: t.ratio, index: 420 * t.bright,
             dur: 0.1 * t.decay, gain: (0.07 + power * 0.05) * t.gain });
      A.noise({ dur: 0.08 * t.decay, gain: 0.07 * t.noise, filter: 'highpass', freq: 5200 * t.bright });
    },
    clash(A, { pitch }) {
      A.fm({ carrier: 3600 * pitch, ratio: 2.63, index: 640, dur: 0.2, gain: 0.1 });
      A.noise({ dur: 0.16, gain: 0.1, filter: 'highpass', freq: 4600 });
      A.tone({ freq: 2400 * pitch, type: 'sine', dur: 0.12, gain: 0.05, sweep: -1400 });
    },
  },
};

/* ============================================================== weapons */

/* Material per weapon. Everything else — pitch, weight — is derived from the
 * silhouette's own dimensions, so a new weapon only needs a line here. */
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
 * Per-weapon character, on top of material and size.
 *
 * Material and pitch alone left the steel family sounding nearly identical —
 * a sword, a spear and a scythe are all mid-sized steel, so they landed within
 * a few percent of each other. These shift the timbre itself: `ratio` moves
 * the inharmonic partials (the difference between a ping and a clang),
 * `bright` the noise band, `decay` how long it lives, `noise` how much scrape
 * is in it, and `body` the low end.
 */
const TWEAK_DEFAULTS = { ratio: 2.71, bright: 1, decay: 1, noise: 1, gain: 1, body: 1 };

const WEAPON_TWEAKS = {
  // steel
  sword:      {},
  katana:     { ratio: 3.3, bright: 1.2, decay: 1.5, noise: 0.7 },   // clean, singing
  dagger:     { ratio: 2.1, bright: 1.35, decay: 0.55, gain: 0.85 }, // short shick
  greatsword: { ratio: 1.76, bright: 0.75, decay: 1.7, body: 1.7, gain: 1.25 },
  rapier:     { ratio: 4.4, bright: 1.5, decay: 0.8, noise: 0.5, body: 0.6 }, // thin ping
  axe:        { ratio: 1.95, bright: 0.8, decay: 0.75, noise: 2.1, body: 1.3 }, // chop
  spear:      { ratio: 3.6, bright: 1.15, decay: 0.5, noise: 0.8, body: 0.75 },
  trident:    { ratio: 2.44, bright: 1.05, decay: 1.15, chorus: true },
  scythe:     { ratio: 2.95, bright: 0.9, decay: 1.25, noise: 1.9 },  // slice
  shuriken:   { ratio: 5.4, bright: 1.6, decay: 0.45, noise: 1.4, body: 0.5 },
  chakram:    { ratio: 3.8, bright: 1.3, decay: 1.6, noise: 0.8 },    // whirr
  caltrop:    { ratio: 6.2, bright: 1.5, decay: 0.4, rattle: true, body: 0.5 },
  // iron
  hammer:     { ratio: 1.62, bright: 0.85, decay: 1.35, body: 1.35, gain: 1.2 },
  wrench:     { ratio: 2.1, bright: 1.15, decay: 0.9, noise: 0.8, body: 0.85 },
  gauntlet:   { ratio: 1.4, bright: 0.7, decay: 0.7, noise: 1.5, body: 1.1, gain: 0.9 },
  shield:     { ratio: 1.25, bright: 0.6, decay: 1.6, body: 1.5, noise: 0.6 },   // CLUNK
  // wood
  club:       { decay: 1.3, body: 1.4, noise: 1.2, gain: 1.15 },
  staff:      { decay: 0.85, body: 0.8, bright: 1.25, noise: 0.7 },
  pitchfork:  { decay: 0.6, body: 0.7, bright: 1.5, noise: 1.6 },
  bow:        { decay: 1.5, body: 0.65, bright: 0.75, noise: 0.5 },   // twang
  // bone
  bone:       { decay: 1.2, noise: 1.3 },
  // glass
  vial:       { ratio: 3.14, decay: 1.2, bright: 0.9 },
  flask:      { ratio: 2.55, decay: 0.75, bright: 1.25, noise: 1.5 },
};

export function weaponVoice(weaponId) {
  const def = Weapons.get(weaponId);
  const material = MATERIALS[WEAPON_MATERIAL[weaponId] || 'steel'];
  // Big weapons ring low, small ones high, on a gentle curve so a greatsword
  // and a dagger are clearly different without either sounding silly.
  const pitch = def ? Math.pow(REF_WIDTH / def.w, 0.85) : 1;
  const t = { ...TWEAK_DEFAULTS, ...(WEAPON_TWEAKS[weaponId] || {}) };
  return { material, pitch, t, heavy: def ? !!def.heavy : false };
}

/* ================================================================ cores */

/* A short accent laid over the weapon impact. These are quiet on purpose —
 * they colour the hit, they do not replace it. */
export const CORE_ACCENTS = {
  fire(A) {
    A.noise({ dur: 0.22, gain: 0.06, filter: 'bandpass', freq: 1800, q: 0.7, sweepTo: 420 });
    A.tone({ freq: 240, type: 'sawtooth', dur: 0.1, gain: 0.03, sweep: -140 });
  },
  ice(A) {
    A.tone({ freq: 2600, type: 'sine', dur: 0.16, gain: 0.05, sweep: -1500 });
    A.noise({ dur: 0.07, gain: 0.05, filter: 'highpass', freq: 6000 });
  },
  lightning(A) {
    A.noise({ dur: 0.07, gain: 0.09, filter: 'highpass', freq: 4200 });
    A.tone({ freq: 90, type: 'square', dur: 0.06, gain: 0.05 });
  },
  earth(A) {
    A.thud({ freq: 62, dur: 0.22, gain: 0.11 });
    A.noise({ dur: 0.1, gain: 0.05, filter: 'lowpass', freq: 520 });
  },
  water(A) {
    // A splash is a fast downward filter sweep — the "bloop" shape.
    A.noise({ dur: 0.16, gain: 0.07, filter: 'bandpass', freq: 1400, q: 1.1, sweepTo: 300 });
    A.tone({ freq: 620, type: 'sine', dur: 0.1, gain: 0.04, sweep: -380 });
  },
  nature(A) {
    A.noise({ dur: 0.18, gain: 0.05, filter: 'bandpass', freq: 2400, q: 0.8, sweepTo: 1400 });
  },
  light(A) {
    A.tone({ freq: 1568, type: 'sine', dur: 0.26, gain: 0.05 });
    A.tone({ freq: 2349, type: 'sine', dur: 0.2, gain: 0.03, delay: 0.015 });
  },
  shadow(A) {
    A.tone({ freq: 150, type: 'sine', dur: 0.2, gain: 0.06, sweep: -80 });
    A.noise({ dur: 0.14, gain: 0.04, filter: 'lowpass', freq: 700 });
  },
  wind(A) {
    A.noise({ dur: 0.2, gain: 0.06, filter: 'bandpass', freq: 900, q: 0.5, sweepTo: 2600 });
  },
  metal(A) {
    A.fm({ carrier: 2400, ratio: 1.98, index: 480, dur: 0.3, gain: 0.05 });
  },
  arcane(A) {
    A.fm({ carrier: 880, ratio: 2.4, index: 700, dur: 0.22, gain: 0.05, sweep: 420 });
  },
  venom(A) {
    // Squelch: a low bandpass wobbling upward.
    A.noise({ dur: 0.2, gain: 0.06, filter: 'bandpass', freq: 500, q: 2.4, sweepTo: 1100 });
    A.tone({ freq: 180, type: 'triangle', dur: 0.13, gain: 0.04, sweep: 90 });
  },

  lancer(A) {
    A.noise({ dur: 0.1, gain: 0.06, filter: 'bandpass', freq: 2200, q: 1.6, sweepTo: 3600 });
  },
  duelist(A) {
    A.fm({ carrier: 3100, ratio: 1.33, index: 380, dur: 0.14, gain: 0.05 });
  },
  knifethrower(A) {
    A.noise({ dur: 0.06, gain: 0.07, filter: 'highpass', freq: 5200 });
  },
  archer(A) {
    A.tone({ freq: 420, type: 'triangle', dur: 0.1, gain: 0.05, sweep: -220 });
  },
  alchemist(A) {
    A.fm({ carrier: 2600, ratio: 3.7, index: 300, dur: 0.16, gain: 0.045 });
  },
  bombardier(A) {
    A.thud({ freq: 88, dur: 0.16, gain: 0.1 });
    A.noise({ dur: 0.12, gain: 0.06, filter: 'lowpass', freq: 1400 });
  },
  bulwark(A) {
    A.thud({ freq: 100, dur: 0.2, gain: 0.12 });
    A.fm({ carrier: 640, ratio: 1.6, index: 260, dur: 0.18, gain: 0.06 });
  },
};

/** Which material wins when two different ones collide. */
const CLASH_PRIORITY = ['glass', 'steel', 'iron', 'bone', 'wood'];

export function clashMaterial(aId, bId) {
  const a = WEAPON_MATERIAL[aId] || 'steel';
  const b = WEAPON_MATERIAL[bId] || 'steel';
  if (a === b) return MATERIALS[a];
  // Glass breaking beats anything; otherwise the brighter material leads and
  // the duller one is heard underneath as the body of the collision.
  const lead = CLASH_PRIORITY.indexOf(a) <= CLASH_PRIORITY.indexOf(b) ? a : b;
  return MATERIALS[lead];
}

export function clashUnderlay(aId, bId) {
  const a = WEAPON_MATERIAL[aId] || 'steel';
  const b = WEAPON_MATERIAL[bId] || 'steel';
  if (a === b) return null;
  const under = CLASH_PRIORITY.indexOf(a) <= CLASH_PRIORITY.indexOf(b) ? b : a;
  return MATERIALS[under];
}
