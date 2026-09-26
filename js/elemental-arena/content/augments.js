/* Augments — the part of a build that never stops growing.
 *
 * Every other upgrade in the shop has a purchase cap, which is correct for
 * them and is what keeps a build bounded. Augments are the opposite on
 * purpose: they are the Diablo axis. You do not find a better sword, you keep
 * putting a sharper edge on the one you have, and the blade visibly changes
 * as you do. Keen I is a faint sheen; Keen VII is a mirror.
 *
 * Three things hang off one definition:
 *   step(build, level)  the mechanical delta for reaching that level
 *   desc(level)         what the player is told, with the real total
 *   visual              how the renderer decorates the weapon, orb or core
 *
 * `step` applies only the increment, never the total, because a build is
 * mutated in place as it is bought — the same way every other upgrade works,
 * which is what lets the shop's before/after preview diff it for free.
 *
 * Level maps to rarity, so the card colour climbs with the augment:
 * I Common, II Uncommon, III Rare, IV Epic, V Legendary, VI+ God-like.
 */

import { Registry } from '../core/registry.js';

export const Augments = new Registry('augment', {
  defaults: { slot: 'weapon', visual: null, color: '#94a3b8', tags: [] },
  required: ['name', 'desc', 'step'],
});

/** Level -> rarity. Past Legendary everything is God-like and keeps going. */
export function levelRarity(level) {
  return ['common', 'uncommon', 'rare', 'epic', 'legendary'][level - 1] || 'godlike';
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export function roman(n) {
  if (n <= 10) return NUMERALS[n - 1];
  // Past X the numerals stop being readable at a glance, so it becomes a
  // plain number — by then the player is counting, not reading.
  return String(n);
}

/** Helper: a resistance that respects the same per-kind ceiling the shop uses. */
function resist(b, kind, amount) {
  b.resists[kind] = Math.min(0.5, (b.resists[kind] || 0) + amount);
}

Augments.defineAll([
  /* ================================================== weapon: edge work */
  {
    id: 'keen',
    name: 'Keen',
    slot: 'weapon',
    visual: 'sheen',
    color: '#e8f4ff',
    desc: (l) => `+${(l * 4)}% critical chance and +${(l * 0.12).toFixed(2)}x critical damage. The blade takes a mirror polish — a white highlight runs its length.`,
    step(b, l) {
      b.crit = b.crit || { chance: 0, mult: 1.8 };
      b.crit.chance = Math.min(0.45, b.crit.chance + 0.04);
      b.crit.mult = Math.min(2.8, b.crit.mult + 0.12);
    },
  },
  {
    id: 'honed',
    name: 'Honed',
    slot: 'weapon',
    visual: 'edge',
    color: '#fef3c7',
    desc: (l) => `+${l * 9}% weapon damage. The cutting edge glows hot-white.`,
    step(b) { b.damageMul += 0.09; },
  },
  {
    id: 'weighted',
    name: 'Weighted',
    slot: 'weapon',
    visual: 'heft',
    color: '#78716c',
    desc: (l) => `+${l * 14}% damage, ${Math.round((1 - Math.pow(0.96, l)) * 100)}% slower swing. Dark counterweights band the haft.`,
    step(b) { b.damageMul += 0.14; b.spinMul *= 0.96; },
  },
  {
    id: 'reaching',
    name: 'Reaching',
    slot: 'weapon',
    visual: 'extend',
    color: '#a3a3a3',
    desc: (l) => `+${(l * 0.22).toFixed(2)} reach. Reach raises how often you connect, which is worth more than damage. A segmented extension grows from the haft.`,
    step(b) { b.reachBonus += 0.22; },
  },

  /* ============================================= weapon: elemental coats */
  {
    id: 'searing',
    name: 'Searing',
    slot: 'weapon',
    visual: 'flame',
    color: '#f97316',
    desc: (l) => `Hits set a burn worth ${l * 9}% of the damage over 4s. The blade is on fire, and burns brighter each level.`,
    step(b, l) { b.flags.augBurn = (b.flags.augBurn || 0) + 0.09; },
  },
  {
    id: 'rimed',
    name: 'Rimed',
    slot: 'weapon',
    visual: 'frost',
    color: '#7dd3fc',
    desc: (l) => `${Math.min(60, l * 10)}% chance on hit to chill, slowing the target. Frost creeps along the metal and rimes the edge.`,
    step(b) { b.flags.augChill = Math.min(0.6, (b.flags.augChill || 0) + 0.1); },
  },
  {
    id: 'envenomed',
    name: 'Envenomed',
    slot: 'weapon',
    visual: 'venom',
    color: '#84cc16',
    desc: (l) => `Hits apply poison worth ${l * 7}% of the damage over 5s. Venom beads along the blade and drips.`,
    step(b) { b.flags.augPoison = (b.flags.augPoison || 0) + 0.07; },
  },
  {
    id: 'galvanic',
    name: 'Galvanic',
    slot: 'weapon',
    visual: 'shock',
    color: '#facc15',
    desc: (l) => `${Math.min(55, l * 9)}% chance to arc for ${Math.min(70, l * 12)}% of the hit to a nearby enemy. Current crawls across the weapon.`,
    step(b) {
      b.flags.augShock = Math.min(0.55, (b.flags.augShock || 0) + 0.09);
      b.flags.augShockPower = Math.min(0.7, (b.flags.augShockPower || 0) + 0.12);
    },
  },
  {
    id: 'voidtouched',
    name: 'Voidtouched',
    slot: 'weapon',
    visual: 'void',
    color: '#a855f7',
    desc: (l) => `Ignores ${Math.min(60, l * 10)}% of the target's armour and resistances. The blade drinks the light around it.`,
    step(b) { b.flags.augPierce = Math.min(0.6, (b.flags.augPierce || 0) + 0.1); },
  },

  /* ====================================================== armour coatings */
  {
    id: 'plating',
    name: 'Plating',
    slot: 'armor',
    visual: 'plated',
    color: '#94a3b8',
    desc: (l) => `+${l * 12}% maximum health. Overlapping plates ring the shell.`,
    step(b) { b.maxHpMul += 0.12; },
  },
  {
    id: 'warded',
    name: 'Warded',
    slot: 'armor',
    visual: 'ward',
    color: '#818cf8',
    desc: (l) => `−${Math.min(50, l * 5)}% damage taken from everything. Runes orbit the shell and pulse when struck.`,
    step(b) { resist(b, 'all', 0.05); },
  },
  {
    id: 'emberguard',
    name: 'Emberguard',
    slot: 'armor',
    visual: 'molten',
    color: '#ef4444',
    desc: (l) => `−${Math.min(50, l * 10)}% burn damage, and attackers take ${l * 4}% of their hit back as fire. The coating glows like cooling slag.`,
    step(b) {
      resist(b, 'burn', 0.1);
      b.flags.augRetaliate = (b.flags.augRetaliate || 0) + 0.04;
    },
  },
  {
    id: 'cryoshell',
    name: 'Cryoshell',
    slot: 'armor',
    visual: 'crystal',
    color: '#67e8f9',
    desc: (l) => `${Math.min(60, l * 10)}% chance to chill anything that hits you. Crystal facets grow across the shell.`,
    step(b) { b.flags.augChillBack = Math.min(0.6, (b.flags.augChillBack || 0) + 0.1); },
  },
  {
    id: 'barbed',
    name: 'Barbed',
    slot: 'armor',
    visual: 'spikes',
    color: '#f43f5e',
    desc: (l) => `Reflects ${l * 7}% of melee damage. Spines stand out from the shell and lengthen each level.`,
    step(b) { b.flags.augThorns = (b.flags.augThorns || 0) + 0.07; },
  },
  {
    id: 'anchored',
    name: 'Anchored',
    slot: 'armor',
    visual: 'anchor',
    color: '#a16207',
    desc: (l) => `Control effects last ${Math.min(75, l * 9)}% less time. Heavy bands lock the shell down.`,
    step(b) { b.ccResist = Math.min(0.75, b.ccResist + 0.09); },
  },

  /* ========================================================= core work */
  {
    id: 'overcharged',
    name: 'Overcharged',
    slot: 'core',
    visual: 'pulse',
    color: '#fde047',
    desc: (l) => `Ultimate charges ${l * 10}% faster. The core pulses brighter and quicker.`,
    step(b) { b.ultRate += 0.1; },
  },
  {
    id: 'fleet',
    name: 'Fleet',
    slot: 'core',
    visual: 'streak',
    color: '#22d3ee',
    desc: (l) => `+${l * 6}% movement and +${l * 5}% swing speed. The orb trails light.`,
    step(b) { b.speedMul += 0.06; b.spinMul += 0.05; },
  },
  {
    id: 'vital',
    name: 'Vital',
    slot: 'core',
    visual: 'bloom',
    color: '#4ade80',
    desc: (l) => `Regenerates ${(l * 0.35).toFixed(2)}% of maximum health a second. A green bloom breathes inside the core.`,
    step(b) { b.flags.augRegen = (b.flags.augRegen || 0) + 0.0035; },
  },
]);

/** Augments grouped by the slot they coat, for the Codex and the workshop. */
export const AUGMENT_SLOTS = [
  { id: 'weapon', name: 'Weapon', blurb: 'Edge work and elemental coatings. These change what the blade looks like and what it leaves behind.' },
  { id: 'armor', name: 'Armour', blurb: 'Coatings on the shell itself — plate, ward, crystal, spines.' },
  { id: 'core', name: 'Core', blurb: 'The orb underneath: how fast it charges, moves and mends.' },
];
