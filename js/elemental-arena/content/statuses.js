/* Status effects.
 *
 * A status is pure data plus a few optional hooks. The engine owns the
 * bookkeeping (duration, stacking, immunity); a definition only describes
 * what the effect *is*.
 *
 * Hooks, all optional:
 *   onApply(engine, ball, inst)        once, when first applied
 *   onTick(engine, ball, inst, dt)     every simulation step while active
 *   onExpire(engine, ball, inst)       once, when it falls off
 *   modify(mods, inst, ball)           contribute to the derived stat bundle
 *   onHitTaken(engine, ball, hit)      react to incoming damage
 *
 * `inst` is { id, until, stacks, power, sourceId }. `power` is set by whoever
 * applied it, so the same status can be weak from a passive and brutal from
 * an ultimate.
 */

import { Registry } from '../core/registry.js';

export const Statuses = new Registry('status', {
  defaults: {
    short: '',
    cc: false,          // crowd control — suppressed by CC immunity
    stackMode: 'refresh',
    maxStacks: 1,
    beneficial: false,
    // hardCC marks the statuses that stop a fighter outright. These get
    // diminishing returns in the engine so nothing can be permanently
    // locked down — without it, one lucky freeze chain ends the match.
    hardCC: false,
    particle: null,     // particle style emitted while active
  },
  required: ['name', 'color'],
});

/* ---------------------------------------------------------------- damage */

Statuses.defineAll([
  {
    id: 'burn',
    name: 'Burning',
    short: 'BRN',
    color: '#ff5a1f',
    stackMode: 'stack',
    maxStacks: 6,
    particle: 'ember',
    // Damage-over-time that scales with stacks. Burn cannot kill through
    // shields; the engine routes it through the normal damage pipeline.
    onTick(engine, ball, inst, dt) {
      engine.damage(ball, inst.power * inst.stacks * dt, {
        sourceId: inst.sourceId,
        kind: 'burn',
        silent: true,
      });
      if (engine.cosmeticRng.chance(dt * 12)) {
        engine.particles.emit('ember', ball.x, ball.y, ball.radius, 1);
      }
    },
  },
  {
    id: 'poison',
    name: 'Poisoned',
    short: 'PSN',
    color: '#7fd13b',
    stackMode: 'stack',
    maxStacks: 5,
    particle: 'toxin',
    // Unlike burn, poison ramps the longer it sits — but the ramp is capped.
    // Uncapped it compounds with the stack count and no amount of health can
    // outlast it, which made Venom win 100% of matchups in testing.
    onTick(engine, ball, inst, dt) {
      const ramp = Math.min(2, 1 + (engine.time - inst.appliedAt) * 0.2);
      engine.damage(ball, inst.power * inst.stacks * ramp * dt, {
        sourceId: inst.sourceId,
        kind: 'poison',
        silent: true,
      });
    },
    modify(mods) {
      mods.healMul *= 0.4;  // poison suppresses regeneration
    },
  },
  {
    id: 'bleed',
    name: 'Bleeding',
    short: 'BLD',
    color: '#c81f3f',
    stackMode: 'stack',
    maxStacks: 5,
    particle: 'blood',
    // Bleed only ticks while the victim is moving — standing still staunches it.
    onTick(engine, ball, inst, dt) {
      const speed = Math.hypot(ball.vx, ball.vy);
      const scale = Math.min(1, speed / 260);
      engine.damage(ball, inst.power * inst.stacks * scale * dt, {
        sourceId: inst.sourceId,
        kind: 'bleed',
        silent: true,
      });
    },
  },
  {
    id: 'corrode',
    name: 'Corroded',
    short: 'COR',
    color: '#b06be0',
    stackMode: 'stack',
    maxStacks: 5,
    // Pure amplification — the setup half of a burst combo.
    modify(mods, inst) {
      mods.dmgTakenMul *= 1 + 0.08 * inst.stacks;
    },
  },
]);

/* ------------------------------------------------------------------- cc */

Statuses.defineAll([
  {
    id: 'chill',
    name: 'Chilled',
    short: 'CHL',
    color: '#4fc3f7',
    cc: true,
    stackMode: 'stack',
    maxStacks: 4,
    particle: 'frost',
    modify(mods, inst) {
      const slow = Math.min(0.7, 0.14 * inst.stacks);
      mods.speedMul *= 1 - slow;
      mods.spinMul *= 1 - slow * 0.6;
    },
  },
  {
    id: 'freeze',
    name: 'Frozen',
    short: 'FRZ',
    color: '#8be9ff',
    cc: true,
    hardCC: true,
    particle: 'frost',
    // A hard stop. Frozen targets take extra damage — shattering is the payoff.
    modify(mods) {
      mods.speedMul *= 0.04;
      mods.spinMul *= 0.06;
      mods.dmgTakenMul *= 1.35;
    },
    onExpire(engine, ball) {
      engine.particles.burst('frost', ball.x, ball.y, 14, 150);
    },
  },
  {
    id: 'stun',
    name: 'Stunned',
    short: 'STN',
    color: '#ffd93d',
    cc: true,
    hardCC: true,
    particle: 'spark',
    modify(mods) {
      mods.speedMul *= 0.1;
      mods.spinMul *= 0;
      mods.canUlt = false;
    },
  },
  {
    id: 'petrify',
    name: 'Petrified',
    short: 'PTR',
    color: '#8d7355',
    cc: true,
    hardCC: true,
    // Rooted but armoured — a trade, not a pure loss.
    modify(mods) {
      mods.speedMul *= 0.08;
      mods.spinMul *= 0.3;
      mods.dmgTakenMul *= 0.55;
    },
  },
  {
    id: 'wet',
    name: 'Soaked',
    short: 'WET',
    color: '#2f9bd8',
    particle: 'droplet',
    // The combo enabler: soaked targets conduct and freeze far harder,
    // but burn far less. Elements read this in their onHit hooks.
    modify(mods) {
      mods.shockMul *= 2;
      mods.freezeMul *= 1.3;
      mods.burnMul *= 0.4;
      mods.dmgMul *= 0.88;   // waterlogged swings land softer
    },
  },
]);

/* ---------------------------------------------------------- buffs / self */

Statuses.defineAll([
  {
    id: 'enrage',
    name: 'Enraged',
    short: 'RAGE',
    color: '#ff2d1f',
    beneficial: true,
    particle: 'ember',
    modify(mods) {
      mods.dmgMul *= 1.6;
      mods.spinMul *= 1.35;
      mods.dmgTakenMul *= 1.1;   // reckless, not free
    },
  },
  {
    id: 'focus',
    name: 'Focused',
    short: 'FCS',
    color: '#f0abfc',
    beneficial: true,
    modify(mods) {
      mods.dmgMul *= 1.1;
    },
  },
  {
    id: 'haste',
    name: 'Hastened',
    short: 'HST',
    color: '#ffe66d',
    beneficial: true,
    modify(mods) {
      mods.speedMul *= 1.45;
      mods.spinMul *= 1.5;
    },
  },
  {
    id: 'shield',
    name: 'Shielded',
    short: 'SHD',
    color: '#7ec8ff',
    beneficial: true,
    modify(mods) {
      mods.dmgTakenMul *= 0.35;
    },
  },
  {
    id: 'regen',
    name: 'Regenerating',
    short: 'REG',
    color: '#4ade80',
    beneficial: true,
    stackMode: 'refresh',
    onTick(engine, ball, inst, dt) {
      engine.heal(ball, inst.power * dt);
    },
  },
  {
    id: 'thorns',
    name: 'Thorned',
    short: 'THN',
    color: '#4f9d3a',
    beneficial: true,
    // Reflects a share of incoming melee back at the attacker.
    onHitTaken(engine, ball, hit) {
      if (hit.kind !== 'weapon') return;
      const attacker = engine.byId(hit.sourceId);
      if (!attacker || attacker === ball) return;
      engine.damage(attacker, hit.amount * 0.35, {
        sourceId: ball.id,
        kind: 'thorns',
      });
    },
  },
  {
    id: 'ccimmune',
    name: 'CC Immune',
    short: 'CC-IMMUNE',
    color: '#ffffff',
    beneficial: true,
    // Checked directly by Engine.applyStatus, which refuses to land any
    // definition flagged `cc: true` while this is up.
    modify(mods) {
      mods.ccImmune = true;
    },
  },
  {
    id: 'lifesteal',
    name: 'Siphoning',
    short: 'SIP',
    color: '#a855f7',
    beneficial: true,
    modify(mods, inst) {
      mods.lifesteal += 0.25 * inst.stacks;
    },
  },
  {
    id: 'giant',
    name: 'Colossal',
    short: 'BIG',
    color: '#f97316',
    beneficial: true,
    modify(mods) {
      mods.sizeMul *= 1.5;
      mods.dmgMul *= 1.25;
      mods.speedMul *= 0.85;
      mods.reachMul *= 1.2;
    },
  },
  {
    id: 'swift',
    name: 'Swift',
    short: 'SWF',
    color: '#22d3ee',
    beneficial: true,
    modify(mods) {
      mods.sizeMul *= 0.7;
      mods.speedMul *= 1.3;
      mods.dmgTakenMul *= 0.9;
    },
  },
]);

/** The neutral stat bundle every ball starts each tick from. */
export function baseModifiers() {
  return {
    speedMul: 1,
    spinMul: 1,
    dmgMul: 1,
    dmgTakenMul: 1,
    healMul: 1,
    sizeMul: 1,
    reachMul: 1,
    lifesteal: 0,
    burnMul: 1,
    freezeMul: 1,
    shockMul: 1,
    ccImmune: false,
    canUlt: true,
  };
}
