/* Loadouts — everything about an orb that is not its core.
 *
 * A roster entry pairs a core (the fighter template) with a loadout, and the
 * loadout is the assembly: weapon, chassis, drive, one perk, and three stat
 * steppers on a shared budget.
 *
 * The budget is the point. An unconstrained slider set just produces a roster
 * of maxed-out orbs; a zero-sum one makes every choice a trade. Chassis and
 * drive work the same way — see content/parts.js, where nothing is a straight
 * upgrade because everything can pick anything.
 */

import { Registry } from '../core/registry.js';
import { Chassis, Drives } from './parts.js';
import { STAT_RANGE } from '../ui/stat-track.js';

export const Perks = new Registry('perk', {
  defaults: { desc: '', apply: null },
  required: ['name'],
});

Perks.defineAll([
  { id: 'none', name: 'No perk', desc: 'Start clean.' },
  {
    id: 'twin', name: 'Twin Arms', desc: 'Start with a second weapon on the opposite side.',
    apply(engine, ball) { ball.addWeapon(engine, true); },
  },
  {
    id: 'reach', name: 'Extended Grip', desc: 'The weapon rides out on a chain instead of against the orb.',
    apply(engine, ball) { ball.tetherBonus = (ball.tetherBonus || 0) + 1.5; },
  },
  {
    id: 'thorns', name: 'Spiked Shell', desc: 'Reflects 35% of melee damage back.',
    apply(engine, ball) { engine.applyStatus(ball, 'thorns', 9999, { sourceId: ball.id }); },
  },
  {
    id: 'regen', name: 'Slow Knit', desc: 'Regenerates steadily all match.',
    apply(engine, ball) { engine.applyStatus(ball, 'regen', 9999, { power: ball.maxHp * 0.012, sourceId: ball.id }); },
  },
  {
    id: 'lifesteal', name: 'Siphon', desc: 'Heals for a quarter of damage dealt.',
    apply(engine, ball) { engine.applyStatus(ball, 'lifesteal', 9999, { sourceId: ball.id }); },
  },
  {
    id: 'bulwark', name: 'Plated', desc: 'Takes 25% less damage, but moves slower.',
    apply(engine, ball) { ball.flags.plated = true; },
  },
  {
    id: 'berserk', name: 'Berserker', desc: 'Below half health, deals 50% more damage.',
    apply(engine, ball) { ball.flags.berserk = true; },
  },
  {
    id: 'ultcharge', name: 'Attuned', desc: 'Ultimate meter fills 40% faster.',
    apply(engine, ball) { ball.ultRate = 1.4; },
  },
]);

/**
 * Stat steppers, each in [-STAT_RANGE, +STAT_RANGE].
 *
 * The range used to be [-2, +2], which made the control feel like three
 * settings rather than a slider. Same total swing, five times the resolution.
 */
export const BUILD_STATS = [
  { id: 'hp', name: 'Health', step: 0.055 },
  { id: 'dmg', name: 'Damage', step: 0.055 },
  { id: 'spd', name: 'Speed', step: 0.05 },
];

/** Points you may spend above neutral. Sum of positives minus negatives. */
export const BUILD_BUDGET = 0;

export function defaultLoadout() {
  return {
    weaponId: null,
    chassisId: 'standard',
    driveId: 'orbit',
    perk: 'none',
    hp: 0, dmg: 0, spd: 0,
  };
}

/** Clamp a loadout into legal territory — used on load, URL decode and edit. */
export function normalizeLoadout(raw) {
  const out = defaultLoadout();
  if (!raw || typeof raw !== 'object') return out;
  if (typeof raw.weaponId === 'string') out.weaponId = raw.weaponId;
  if (Chassis.has(raw.chassisId)) out.chassisId = raw.chassisId;
  if (Drives.has(raw.driveId)) out.driveId = raw.driveId;
  if (Perks.has(raw.perk)) out.perk = raw.perk;
  for (const s of BUILD_STATS) {
    const v = Math.round(Number(raw[s.id]) || 0);
    out[s.id] = Math.max(-STAT_RANGE, Math.min(STAT_RANGE, v));
  }
  // Enforce the budget by shaving the largest positive until it balances.
  let guard = 40;
  while (buildSpend(out) > BUILD_BUDGET && guard-- > 0) {
    const best = BUILD_STATS.reduce((a, b) => (out[a.id] >= out[b.id] ? a : b));
    out[best.id] -= 1;
  }
  return out;
}

export function buildSpend(loadout) {
  return BUILD_STATS.reduce((n, s) => n + loadout[s.id], 0);
}

/** Multiplier a build point count maps to, e.g. +2 damage -> 1.26x. */
export function buildMultiplier(loadout, statId) {
  const s = BUILD_STATS.find((x) => x.id === statId);
  return 1 + (loadout[statId] || 0) * s.step;
}
