/* Rarity.
 *
 * Rarity used to be a price tag and a border colour. It is now a mechanic:
 * everything above Common carries a *proc chance* — a percentage roll that
 * fires an extra effect on top of whatever the item already does.
 *
 * That is the whole point. A Rare item is not "a Common with bigger numbers",
 * it is a Common that sometimes does something else entirely. Two orbs with
 * identical stats can play completely differently because one of them rolls
 * vines and the other rolls a meteor.
 *
 * Cursed is deliberately the odd one out: the cheapest tier and the highest
 * proc rate, paid for with a permanent downside written into the item itself.
 * It is the tier you take when you need a spike and can afford the tax.
 */

export const RARITIES = {
  common:    { id: 'common',    name: 'Common',    color: '#94a3b8', weight: 50, cost: 1.0,  proc: 0    },
  uncommon:  { id: 'uncommon',  name: 'Uncommon',  color: '#4ade80', weight: 26, cost: 1.35, proc: 0.20 },
  rare:      { id: 'rare',      name: 'Rare',      color: '#38bdf8', weight: 14, cost: 1.85, proc: 0.28 },
  epic:      { id: 'epic',      name: 'Epic',      color: '#c084fc', weight: 6,  cost: 3.1,  proc: 0.34 },
  legendary: { id: 'legendary', name: 'Legendary', color: '#fbbf24', weight: 2,  cost: 5.0,  proc: 0.42 },
  // Cheap and loud. The downside is written into each cursed item.
  cursed:    { id: 'cursed',    name: 'Cursed',    color: '#f43f5e', weight: 5,  cost: 0.8,  proc: 0.50 },
};

export const RARITY_IDS = Object.keys(RARITIES);

export function rarity(id) {
  return RARITIES[id] || RARITIES.common;
}

/** The roll chance for an item, including any bonus the item itself carries. */
export function procChance(def) {
  if (!def) return 0;
  const base = rarity(def.rarity).proc;
  return Math.max(0, Math.min(0.85, base + (def.chanceBonus || 0)));
}

/** "18%" — used everywhere a proc is shown to the player. */
export function procLabel(def) {
  return `${Math.round(procChance(def) * 100)}%`;
}
