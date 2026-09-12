/* Orb parts — the Beyblade layer of the game.
 *
 * An orb is assembled from four separable pieces, and every mode uses the
 * same assembly:
 *
 *   Core     the fighter template. Identity: colours, passive, ultimate,
 *            signature on-hit effect. Chosen from the roster packs.
 *   Weapon   the striking implement. Length is a real trade — long hits
 *            harder and recovers slower, short the reverse.
 *   Chassis  the shell. Mass, size, durability, how it takes a hit.
 *   Drive    how the weapon moves. Spin rate, reach, and what one swing is
 *            worth when it lands.
 *
 * Chassis and Drive are pure modifier bundles — no hooks, no per-frame cost.
 * They multiply into the ball at construction, which keeps the combination
 * space wide (19 cores × 23 weapons × 6 chassis × 6 drives) without any of it
 * needing bespoke code.
 *
 * The two registries are deliberately *symmetric trades*. Nothing here is a
 * straight upgrade, because every fighter in every mode can pick any of them —
 * an option that is simply better would just become the only option.
 */

import { Registry } from '../core/registry.js';

/* ============================================================== chassis */

export const Chassis = new Registry('chassis', {
  defaults: {
    hpMul: 1, radiusMul: 1, speedMul: 1, spinMul: 1, damageMul: 1,
    dmgTakenMul: 1, evasion: 0, knockbackResist: 0, ultRate: 1,
    flags: null, startStatus: null,
  },
  required: ['name', 'desc'],
});

Chassis.defineAll([
  {
    id: 'standard',
    name: 'Standard',
    short: 'STD',
    desc: 'No bias in any direction. The shape everything else is measured against.',
  },
  {
    id: 'feather',
    name: 'Featherweight',
    short: 'FTH',
    desc: 'Small, quick and evasive. Folds fast if something does connect.',
    hpMul: 0.84, radiusMul: 0.86, speedMul: 1.2, evasion: 0.18,
  },
  {
    id: 'heavy',
    name: 'Heavyweight',
    short: 'HVY',
    desc: 'Bulky and hard to shift. Swings slower and takes its time getting anywhere.',
    hpMul: 1.22, radiusMul: 1.14, speedMul: 0.84, spinMul: 0.88, knockbackResist: 0.45,
  },
  {
    id: 'spiked',
    name: 'Spiked Shell',
    short: 'SPK',
    desc: 'Reflects a share of melee damage back. Slightly more fragile for it.',
    hpMul: 0.94,
    startStatus: { id: 'thorns', duration: 9999 },
  },
  {
    id: 'hollow',
    name: 'Hollow Core',
    short: 'HLW',
    desc: 'Light and lively. Charges its ultimate far faster; there is less of it to hit.',
    hpMul: 0.88, speedMul: 1.1, ultRate: 1.55,
  },
  {
    id: 'ablative',
    name: 'Ablative Plate',
    short: 'ABL',
    desc: 'Sheds 10% of all incoming damage, and hits a little softer for the weight.',
    hpMul: 1.04, dmgTakenMul: 0.9, damageMul: 0.9,
  },
]);

/* ================================================================ drive */

export const Drives = new Registry('drive', {
  defaults: {
    spinMul: 1, tetherBonus: 0, damageMul: 1, cooldownMul: 1,
    speedMul: 1, reversesOnParry: false,
  },
  required: ['name', 'desc'],
});

Drives.defineAll([
  {
    id: 'orbit',
    name: 'Orbit',
    short: 'ORB',
    desc: 'A steady, even sweep held tight to the shell. No drawbacks, and the cleanest recovery of any drive.',
    cooldownMul: 0.86, damageMul: 1.06,
  },
  {
    id: 'flail',
    name: 'Flail',
    short: 'FLL',
    desc: 'Rides out on a chain. Far more reach, but a slower and wilder swing.',
    tetherBonus: 1.15, spinMul: 0.88, damageMul: 1.06,
  },
  {
    id: 'whip',
    name: 'Whip',
    short: 'WHP',
    desc: 'Fast, light strikes. Many more hits, each one worth less.',
    spinMul: 1.4, damageMul: 0.72, cooldownMul: 0.9,
  },
  {
    id: 'pendulum',
    name: 'Pendulum',
    short: 'PND',
    desc: 'Slow, committed arcs that land hard and leave you exposed between them.',
    spinMul: 0.68, damageMul: 1.52, cooldownMul: 1.26,
  },
  {
    id: 'gyro',
    name: 'Gyro',
    short: 'GYR',
    desc: 'A blur. Enormous hit rate, very little behind each one.',
    spinMul: 1.75, damageMul: 0.72, cooldownMul: 0.7, speedMul: 1.05,
  },
  {
    id: 'counter',
    name: 'Counterweight',
    short: 'CNT',
    desc: 'Reverses direction on every clash and sharpens for a moment after.',
    spinMul: 0.88, damageMul: 0.92, reversesOnParry: true,
  },
]);

/* =============================================================== combos */

/** A short human-readable name for an assembled orb, e.g. "Heavy Pendulum". */
export function partsLabel(loadout) {
  const c = Chassis.get(loadout.chassisId);
  const d = Drives.get(loadout.driveId);
  if (!c || !d) return '';
  if (c.id === 'standard' && d.id === 'orbit') return 'Stock';
  if (c.id === 'standard') return d.name;
  if (d.id === 'orbit') return c.name;
  return `${c.name} · ${d.name}`;
}
