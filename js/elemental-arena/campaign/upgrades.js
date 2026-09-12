/* Campaign upgrades — the shop inventory.
 *
 * An upgrade mutates the run's `build`, which is a flat description of
 * everything the orb has accumulated. The build is turned into an engine
 * profile at battle time, so nothing here needs to know the engine exists.
 *
 * Design rules that keep the shop interesting rather than a stat treadmill:
 *  - Every tier above common carries a real cost somewhere. Bulk slows you
 *    down, reach thins your damage, twin arms cost health.
 *  - Resistances are cheap and specific. They are how a run answers the thing
 *    that keeps killing it, which is the most interesting decision on offer.
 *  - `max` caps repeat purchases so a run cannot simply buy one stat forever.
 *
 * To add an upgrade: define it here. The shop draws from the registry,
 * weighted by tier and filtered by what the build can still take.
 */

import { Registry } from '../core/registry.js';
import { Weapons, weaponLabel } from '../content/weapons.js';

export const TIERS = {
  common: { name: 'Common', weight: 62, color: '#94a3b8', cost: 1 },
  rare: { name: 'Rare', weight: 28, color: '#38bdf8', cost: 1.85 },
  epic: { name: 'Epic', weight: 10, color: '#c084fc', cost: 3.1 },
};

export const Upgrades = new Registry('upgrade', {
  defaults: { tier: 'common', max: 99, tags: [], baseCost: 0 },
  required: ['name', 'desc', 'apply'],
});

/** A fresh, unmodified run build. */
export function emptyBuild(fighterId) {
  return {
    fighterId,
    weaponId: null,
    maxHpMul: 1,
    damageMul: 1,
    speedMul: 1,
    radiusMul: 1,
    spinMul: 1,
    reachBonus: 0,
    ultRate: 1,
    extraWeapons: 0,
    ccResist: 0,
    resists: {},
    perks: [],
    crit: null,
    flags: {},
    owned: {},        // upgradeId -> how many times bought
    repairs: 0,
  };
}

/** Turn a run build into the profile the engine understands. */
export function buildToProfile(build) {
  return {
    maxHpMul: build.maxHpMul,
    damageMul: build.damageMul,
    speedMul: build.speedMul,
    radiusMul: build.radiusMul,
    spinMul: build.spinMul,
    reachBonus: build.reachBonus,
    ultRate: build.ultRate,
    extraWeapons: build.extraWeapons,
    ccResist: build.ccResist,
    resists: { ...build.resists },
    perks: [...build.perks],
    crit: build.crit ? { ...build.crit } : null,
    flags: { ...build.flags },
  };
}

/* Resistance is capped per kind, and the engine caps the total again on top.
 * Stacking a specialised resistance with the blanket one could otherwise
 * reach a 90% reduction, which — multiplied by a run's health upgrades —
 * made a late build effectively unkillable. */
function addResist(build, kind, amount) {
  build.resists[kind] = Math.min(0.5, (build.resists[kind] || 0) + amount);
}

/* ================================================================ stats */

Upgrades.defineAll([
  {
    id: 'plating', name: 'Hull Plating', tier: 'common', max: 8,
    desc: '+18% maximum health.',
    apply(b) { b.maxHpMul *= 1.18; },
  },
  {
    id: 'edge', name: 'Honed Edge', tier: 'common', max: 8,
    desc: '+15% damage.',
    apply(b) { b.damageMul *= 1.15; },
  },
  {
    id: 'bearings', name: 'Polished Bearings', tier: 'common', max: 6,
    desc: '+12% movement speed.',
    apply(b) { b.speedMul *= 1.12; },
  },
  {
    id: 'flywheel', name: 'Flywheel', tier: 'common', max: 6,
    desc: '+15% swing speed. Faster swings mean more hits, not harder ones.',
    apply(b) { b.spinMul *= 1.15; },
  },
  {
    id: 'ballast', name: 'Ballast', tier: 'rare', max: 4,
    desc: '+35% health and +10% size, but 10% slower.',
    apply(b) { b.maxHpMul *= 1.35; b.radiusMul *= 1.1; b.speedMul *= 0.9; },
  },
  {
    id: 'shrink', name: 'Compacted Core', tier: 'rare', max: 3,
    desc: '12% smaller and 18% faster — a harder target, a shorter weapon.',
    apply(b) { b.radiusMul *= 0.88; b.speedMul *= 1.18; },
  },
  {
    id: 'longhaft', name: 'Long Haft', tier: 'rare', max: 3,
    desc: 'Pushes the weapon out onto a chain. Far more reach, 8% less damage.',
    apply(b) { b.reachBonus += 0.85; b.damageMul *= 0.92; },
  },
  {
    id: 'twinarms', name: 'Twin Arms', tier: 'epic', max: 3,
    desc: 'A second weapon on the opposite side. Costs 12% of your health.',
    apply(b) { b.extraWeapons += 1; b.maxHpMul *= 0.88; },
  },
]);

/* ========================================================== resistances */

Upgrades.defineAll([
  {
    id: 'heatshield', name: 'Heat Shielding', tier: 'common', max: 3,
    desc: '−25% damage taken from burning.',
    apply(b) { addResist(b, 'burn', 0.25); },
  },
  {
    id: 'antitoxin', name: 'Antitoxin', tier: 'common', max: 3,
    desc: '−25% damage taken from poison and pools.',
    apply(b) { addResist(b, 'poison', 0.25); addResist(b, 'hazard', 0.25); },
  },
  {
    id: 'coagulant', name: 'Coagulant', tier: 'common', max: 3,
    desc: '−30% damage taken from bleeding.',
    apply(b) { addResist(b, 'bleed', 0.3); },
  },
  {
    id: 'grounding', name: 'Grounding Rod', tier: 'common', max: 3,
    desc: '−30% damage taken from chained lightning.',
    apply(b) { addResist(b, 'chain', 0.3); },
  },
  {
    id: 'deflector', name: 'Deflector', tier: 'rare', max: 3,
    desc: '−22% damage taken from projectiles and blasts.',
    apply(b) { addResist(b, 'projectile', 0.22); addResist(b, 'blast', 0.22); },
  },
  {
    id: 'stabiliser', name: 'Gyro Stabiliser', tier: 'rare', max: 3,
    desc: 'Freezes, stuns and slows last 30% less time.',
    apply(b) { b.ccResist = Math.min(0.75, b.ccResist + 0.3); },
  },
  {
    id: 'wardplate', name: 'Wardplate', tier: 'epic', max: 2,
    desc: '−12% damage taken from absolutely everything.',
    apply(b) { addResist(b, 'all', 0.12); },
  },
]);

/* ============================================================= offence */

Upgrades.defineAll([
  {
    id: 'crit', name: 'Weak Point Sensor', tier: 'rare', max: 4,
    desc: '+12% chance to land a critical hit for 1.8× damage.',
    apply(b) {
      b.crit = b.crit || { chance: 0, mult: 1.8 };
      b.crit.chance = Math.min(0.6, b.crit.chance + 0.12);
    },
  },
  {
    id: 'critpower', name: 'Fracture Charge', tier: 'epic', max: 3,
    desc: 'Critical hits deal an extra 0.6× damage.',
    apply(b) {
      b.crit = b.crit || { chance: 0.1, mult: 1.8 };
      b.crit.mult += 0.6;
    },
  },
  {
    id: 'capacitor', name: 'Capacitor', tier: 'rare', max: 4,
    desc: 'Ultimate meter fills 25% faster.',
    apply(b) { b.ultRate *= 1.25; },
  },
  {
    id: 'siphon', name: 'Siphon Coil', tier: 'rare', max: 1,
    desc: 'Heal for a quarter of all damage you deal.',
    apply(b) { if (!b.perks.includes('lifesteal')) b.perks.push('lifesteal'); },
  },
  {
    id: 'spikes', name: 'Spiked Shell', tier: 'common', max: 1,
    desc: 'Reflect 35% of melee damage back at the attacker.',
    apply(b) { if (!b.perks.includes('thorns')) b.perks.push('thorns'); },
  },
  {
    id: 'knit', name: 'Slow Knit', tier: 'common', max: 1,
    desc: 'Regenerate steadily for the whole battle.',
    apply(b) { if (!b.perks.includes('regen')) b.perks.push('regen'); },
  },
  {
    id: 'berserk', name: 'Berserker Wiring', tier: 'epic', max: 1,
    desc: 'Below half health, deal 50% more damage.',
    apply(b) { b.flags.berserk = true; },
  },
]);

/* ============================================================== weapons */

/* Weapon swaps are generated rather than hand-written, so adding a silhouette
 * to the weapon registry puts it in the shop automatically. */
for (const id of Weapons.ids) {
  Upgrades.define({
    id: `weapon_${id}`,
    name: `Refit: ${weaponLabel(id)}`,
    tier: 'common',
    max: 1,
    tags: ['weapon'],
    weaponId: id,
    desc: `Swap to a ${weaponLabel(id).toLowerCase()}. Longer weapons hit harder and recover slower; shorter ones the reverse.`,
    apply(b) { b.weaponId = id; },
  });
}

/* =============================================================== offers */

/** Cost of an upgrade at a given stage. Later stages charge more. */
export function upgradeCost(def, stage) {
  const tier = TIERS[def.tier];
  const base = 22 * tier.cost;
  return Math.round((base + stage * 4 * tier.cost) / 5) * 5;
}

/** Can this build still take this upgrade? */
export function canOffer(def, build) {
  if ((build.owned[def.id] || 0) >= def.max) return false;
  // Never offer the weapon you are already holding.
  if (def.tags.includes('weapon') && build.weaponId === def.weaponId) return false;
  return true;
}

/**
 * Draw a shop hand. Weapons are capped at one per hand so the shop does not
 * degenerate into a rack of refits.
 */
export function rollOffers(rng, build, stage, count = 3) {
  const pool = Upgrades.all.filter((d) => canOffer(d, build));
  const out = [];
  let weaponTaken = false;

  for (let guard = 0; out.length < count && guard < 200; guard++) {
    const pick = rng.weighted(pool, (d) => {
      if (out.some((o) => o.id === d.id)) return 0;
      if (d.tags.includes('weapon')) return weaponTaken ? 0 : TIERS[d.tier].weight * 0.35;
      return TIERS[d.tier].weight;
    });
    if (!pick || out.some((o) => o.id === pick.id)) continue;
    if (pick.tags.includes('weapon')) weaponTaken = true;
    out.push(pick);
  }
  return out;
}
