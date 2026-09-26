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
import { Enchantments } from '../content/enchantments.js';
import { RARITIES } from '../content/rarity.js';

/* The shop and the enchantment table read the same rarity ladder, so "Rare"
 * means one thing across the whole game rather than one thing per system. */
export const TIERS = RARITIES;

export const Upgrades = new Registry('upgrade', {
  defaults: { tier: 'common', max: 99, tags: [], baseCost: 0 },
  required: ['name', 'desc', 'apply'],
});

/** A fresh, unmodified run build. */
export function emptyBuild(fighterId) {
  return {
    fighterId,
    weaponId: null,
    enchantId: null,
    goldMul: 1,
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
    enchantId: build.enchantId,
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
    id: 'crit', name: 'Weak Point Sensor', tier: 'rare', max: 3,
    desc: '+10% chance to land a critical hit for 1.8× damage. Caps at 40%.',
    apply(b) {
      b.crit = b.crit || { chance: 0, mult: 1.8 };
      b.crit.chance = Math.min(0.4, b.crit.chance + 0.1);
    },
  },
  {
    id: 'critpower', name: 'Fracture Charge', tier: 'epic', max: 2,
    desc: 'Critical hits deal an extra 0.45× damage. Caps at 2.7×.',
    apply(b) {
      b.crit = b.crit || { chance: 0.1, mult: 1.8 };
      b.crit.mult = Math.min(2.7, b.crit.mult + 0.45);
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

/* ============================================================ eccentric

 * The trade-off shelf. Every one of these makes you worse at something in
 * exchange for making you much better at something else, which is the only
 * kind of upgrade that produces a *build* rather than a bigger number.
 *
 * These are also the answer to a late run having nothing to buy. A run that
 * has maxed every stat still has all of these open, because the interesting
 * ones are capped at one or two and there are a lot of them.
 */

Upgrades.defineAll([
  {
    id: 'midas', name: 'Midas Engine', tier: 'cursed', max: 1, tags: ['gold'],
    desc: 'Double gold from every fight for the rest of the run. You deal 20% less damage. Gold multipliers cap at 3x in total.',
    apply(b) { b.goldMul *= 2; b.damageMul *= 0.8; },
  },
  {
    id: 'glasscannon', name: 'Glass Cannon', tier: 'cursed', max: 2,
    desc: '+65% damage, −35% maximum health. Twice is a dare.',
    apply(b) { b.damageMul *= 1.65; b.maxHpMul *= 0.65; },
  },
  {
    id: 'thornfield', name: 'Thornfield', tier: 'rare', max: 1,
    desc: 'Every wall you bounce off sprouts a vine patch behind you. They snare and chew on whoever follows you in.',
    apply(b) { b.flags.vineWake = true; },
  },
  {
    id: 'tortoise', name: 'Tortoise Shell', tier: 'rare', max: 2,
    desc: '+55% health and −18% damage taken, but 25% slower and 20% less damage.',
    apply(b) { b.maxHpMul *= 1.55; addResist(b, 'all', 0.18); b.speedMul *= 0.75; b.damageMul *= 0.8; },
  },
  {
    id: 'hairtrigger', name: 'Hair Trigger', tier: 'rare', max: 2,
    desc: '+40% swing speed and +25% movement, but −22% health. All tempo, no cushion.',
    apply(b) { b.spinMul *= 1.4; b.speedMul *= 1.25; b.maxHpMul *= 0.78; },
  },
  {
    id: 'lastbreath', name: 'Last Breath', tier: 'epic', max: 1,
    desc: 'The first time you would die in a fight, you survive on 25% health instead. Once per stage.',
    apply(b) { b.flags.lastBreath = true; },
  },
  {
    id: 'vampiric', name: 'Vampiric Coil', tier: 'epic', max: 1,
    desc: 'Heal for 35% of all damage dealt, but you no longer regenerate between stages — repairs cost double.',
    apply(b) {
      if (!b.perks.includes('lifesteal')) b.perks.push('lifesteal');
      b.flags.costlyRepairs = true;
    },
  },
  {
    id: 'gambler', name: "Gambler's Purse", tier: 'cursed', max: 3, tags: ['gold'],
    desc: '+45% gold, and every enemy you face is 25% stronger. Stacks, and the difficulty stacks with it.',
    apply(b) { b.goldMul *= 1.45; b.flags.threatBonus = (b.flags.threatBonus || 0) + 0.25; },
  },
  {
    id: 'juggernaut', name: 'Juggernaut Frame', tier: 'epic', max: 1,
    desc: '+45% size and you cannot be knocked back, but −20% swing speed. A much bigger target that does not move.',
    apply(b) { b.radiusMul *= 1.45; b.flags.immovable = true; b.spinMul *= 0.8; },
  },
  {
    id: 'featherweight', name: 'Featherweight', tier: 'rare', max: 1,
    desc: '−25% size and +35% movement speed. Small and quick, with the shorter weapon that comes with being small.',
    apply(b) { b.radiusMul *= 0.75; b.speedMul *= 1.35; },
  },

  /* The uncapped sink. A run that has bought everything still has this, and
   * it doubles in price each time, so gold never simply piles up unspent but
   * never buys a runaway build either. */
  {
    id: 'overclock', name: 'Overclock', tier: 'legendary', max: 99,
    desc: '+9% damage and +9% health. No cap — but the price doubles every single time you buy it.',
    escalating: true,
    apply(b) { b.damageMul *= 1.09; b.maxHpMul *= 1.09; },
  },
]);

/* ========================================================== enchantments */

/* Every enchantment is purchasable, carrying its own rarity through to the
 * shop. You hold one at a time, so buying a second is a replacement and a
 * real decision rather than another stack. */
for (const ench of Enchantments.all) {
  Upgrades.define({
    id: `ench_${ench.id}`,
    name: `Enchant: ${ench.name}`,
    tier: ench.rarity,
    max: 1,
    tags: ['enchant', ...(ench.tags || [])],
    enchantId: ench.id,
    desc: `${ench.desc} Replaces whatever enchantment you are carrying.`,
    apply(b) {
      b.enchantId = ench.id;
      if (ench.goldMul) b.goldMul *= ench.goldMul;
    },
  });
}

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

/**
 * Build an orb the way a player would have, shopping stage by stage.
 *
 * Deliberately the same registry, the same caps and the same `upgradeCost`
 * the player pays. An enemy that grows by buying upgrades grows along the
 * same curve the player does — multiplicatively, across many axes — instead
 * of by a single scalar that a compounding player build eventually laps.
 *
 * Picks are weighted by tier but otherwise random, so two encounters at the
 * same stage are built differently. Gold upgrades are skipped: an enemy has
 * no purse, so buying one would spend its income on nothing.
 */
export function buildForSchedule(rng, fighterId, stage, incomeAt) {
  const build = emptyBuild(fighterId);
  const pool = Upgrades.all.filter((d) => !d.tags.includes('gold'));
  // One of each, for the whole build. `canOffer` only rejects the weapon
  // currently held, so without this the shopper buys refit after refit, each
  // overwriting the last, and spends its entire budget on nothing.
  let weaponBought = false, enchantBought = false;
  let purse = 0;
  // Trade-off upgrades a random shopper cannot evaluate. Left unchecked it
  // buys Glass Cannon every time it is offered and arrives at stage 45 with
  // four times the damage and half the health of a stock orb.
  const rejected = new Set();

  // Walk the run the way the player did. Buying at each stage's own prices is
  // the whole point: a player reaching stage 45 bought most of their build
  // cheaply on the way up and kept it. An enemy handed the same total gold at
  // stage-45 prices could afford a fraction of it, which is exactly how the
  // opposition fell behind a compounding build.
  for (let s = 0; s <= stage; s++) {
    purse += incomeAt(s);
    for (let guard = 0; guard < 12 && purse > 0; guard++) {
      const affordable = pool.filter((d) => {
        if (rejected.has(d.id)) return false;
        if (d.tags.includes('weapon') && weaponBought) return false;
        if (d.tags.includes('enchant') && enchantBought) return false;
        return canOffer(d, build) && upgradeCost(d, s, build) <= purse;
      });
      if (!affordable.length) break;
      const pick = rng.weighted(affordable, (d) => {
        // Weapons and enchantments are one-offs, so they must not crowd out
        // the stat upgrades that are the bulk of a build's strength.
        const w = TIERS[d.tier].weight;
        if (d.tags.includes('weapon')) return w * 0.25;
        if (d.tags.includes('enchant')) return w * 0.6;
        return w;
      });
      if (!pick) break;

      // A competent-but-not-optimal shopper: it will take a trade-off, but it
      // will not tip itself into being made of paper or unable to hurt anyone.
      const test = structuredClone(build);
      pick.apply(test);
      if (test.maxHpMul < build.maxHpMul * 0.9 && test.maxHpMul < 0.95) {
        rejected.add(pick.id);
        continue;
      }
      if (test.damageMul < build.damageMul * 0.9 && test.damageMul < 0.95) {
        rejected.add(pick.id);
        continue;
      }

      purse -= upgradeCost(pick, s, build);
      pick.apply(build);
      build.owned[pick.id] = (build.owned[pick.id] || 0) + 1;
      if (pick.tags.includes('weapon')) weaponBought = true;
      if (pick.tags.includes('enchant')) enchantBought = true;
    }
  }
  return build;
}

/** Cost of an upgrade at a given stage. Later stages charge more. */
export function upgradeCost(def, stage, build) {
  const tier = TIERS[def.tier];
  const base = 22 * tier.cost;
  let cost = base + stage * 4 * tier.cost;
  // The uncapped sink doubles per purchase, so a rich late run can always
  // spend but can never simply buy its way out of the difficulty curve.
  if (def.escalating && build) cost *= Math.pow(2, build.owned[def.id] || 0);
  return Math.round(cost / 5) * 5;
}

/** Can this build still take this upgrade? */
export function canOffer(def, build) {
  if ((build.owned[def.id] || 0) >= def.max) return false;
  // Never offer the weapon you are already holding, or the enchantment
  // already fitted — both would be a purchase that changes nothing.
  if (def.tags.includes('weapon') && build.weaponId === def.weaponId) return false;
  if (def.tags.includes('enchant') && build.enchantId === def.enchantId) return false;
  return true;
}

/**
 * Draw a shop hand. Weapons are capped at one per hand so the shop does not
 * degenerate into a rack of refits.
 */
export function rollOffers(rng, build, stage, count = 3) {
  const pool = Upgrades.all.filter((d) => canOffer(d, build));
  const out = [];
  let weaponTaken = false, enchantTaken = false;

  for (let guard = 0; out.length < count && guard < 200; guard++) {
    const pick = rng.weighted(pool, (d) => {
      if (out.some((o) => o.id === d.id)) return 0;
      if (d.tags.includes('weapon')) return weaponTaken ? 0 : TIERS[d.tier].weight * 0.35;
      if (d.tags.includes('enchant')) return enchantTaken ? 0 : TIERS[d.tier].weight * 0.7;
      return TIERS[d.tier].weight;
    });
    if (!pick || out.some((o) => o.id === pick.id)) continue;
    if (pick.tags.includes('weapon')) weaponTaken = true;
    if (pick.tags.includes('enchant')) enchantTaken = true;
    out.push(pick);
  }
  return out;
}
