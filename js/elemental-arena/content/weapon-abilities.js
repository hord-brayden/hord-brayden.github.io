/* Weapon abilities.
 *
 * Every weapon does something a different weapon does not. Before this, the
 * only difference between a bone and a caltrop was a handful of derived
 * numbers, which is not a reason to pick one.
 *
 * An ability is a name, a one-line description, and an optional `onHit`. The
 * description is shown verbatim in the Forge and the Codex, so it has to state
 * the real number — no "deals bonus damage" hand-waving.
 *
 * Kept separate from weapons.js because that file is sprite geometry and this
 * is game rules; the two get edited for completely different reasons.
 */

export const WEAPON_ABILITIES = {
  /* ------------------------------------------------------------- blades */
  sword: {
    name: 'Tempo',
    kind: 'passive',
    desc: 'Builds a stacking +6% damage every hit, up to +30%. Resets when you take a hit.',
    onHit({ engine, attacker, victim, amount }) {
      attacker.tempo = Math.min(5, (attacker.tempo || 0) + 1);
    },
  },
  katana: {
    name: 'Bleeding Edge',
    kind: 'onhit',
    desc: 'Every hit adds a bleed stack that ticks while the target keeps moving.',
    onHit({ engine, attacker, victim, amount }) {
      engine.applyStatus(victim, 'bleed', 5, { power: amount * 0.1, sourceId: attacker.id });
    },
  },
  dagger: {
    name: 'Backstab',
    kind: 'passive',
    desc: '+55% damage against anything below 40% health.',
    bonus({ victim }) {
      return victim.hp / victim.maxHp < 0.4 ? 1.55 : 1;
    },
  },
  greatsword: {
    name: 'Cleave',
    kind: 'onhit',
    desc: 'Splashes 35% of the hit onto every other enemy within 150 units.',
    onHit({ engine, attacker, victim, amount }) {
      for (const foe of engine.enemiesOf(attacker)) {
        if (foe === victim || engine.dist(foe, victim) > 150) continue;
        engine.damage(foe, amount * 0.35, { sourceId: attacker.id, kind: 'cleave' });
      }
    },
  },
  rapier: {
    name: 'Precision',
    kind: 'passive',
    desc: '+20% chance to land a critical hit for 1.8x damage.',
    onSpawn(ball) {
      ball.crit = ball.crit || { chance: 0, mult: 1.8 };
      ball.crit.chance = Math.min(0.75, ball.crit.chance + 0.2);
    },
  },
  scythe: {
    name: 'Reap',
    kind: 'onhit',
    desc: 'Heals you for 14% of the damage it deals.',
    onHit({ engine, attacker, amount }) {
      engine.heal(attacker, amount * 0.14);
    },
  },

  /* ------------------------------------------------------------- hafted */
  axe: {
    name: 'Sunder',
    kind: 'onhit',
    desc: 'Every hit corrodes the target, so it takes 8% more damage from everything.',
    onHit({ engine, attacker, victim }) {
      engine.applyStatus(victim, 'corrode', 6, { sourceId: attacker.id });
    },
  },
  hammer: {
    name: 'Concuss',
    kind: 'onhit',
    desc: '18% chance to stun the target for 0.6s.',
    onHit({ engine, attacker, victim }) {
      if (engine.rng.chance(0.18)) engine.applyStatus(victim, 'stun', 0.6, { sourceId: attacker.id });
    },
  },
  spear: {
    name: 'Pierce',
    kind: 'passive',
    desc: 'Ignores 35% of the target’s damage reduction.',
    pierce: 0.35,
  },
  trident: {
    name: 'Three Prongs',
    kind: 'onhit',
    desc: 'Lands two bleed stacks at once instead of one.',
    onHit({ engine, attacker, victim, amount }) {
      engine.applyStatus(victim, 'bleed', 6, { power: amount * 0.06, stacks: 2, sourceId: attacker.id });
    },
  },
  pitchfork: {
    name: 'Skewer',
    kind: 'passive',
    desc: '+35% damage against anything chilled, frozen, stunned or petrified.',
    bonus({ victim }) {
      const held = victim.statuses.has('chill') || victim.statuses.has('freeze')
        || victim.statuses.has('stun') || victim.statuses.has('petrify');
      return held ? 1.35 : 1;
    },
  },
  club: {
    name: 'Stagger',
    kind: 'onhit',
    desc: 'Knocks the target away hard, and briefly halves its swing speed.',
    onHit({ engine, attacker, victim }) {
      engine.knockback(victim, attacker, 340);
      engine.applyStatus(victim, 'chill', 1.6, { sourceId: attacker.id });
    },
  },
  staff: {
    name: 'Channel',
    kind: 'onhit',
    desc: 'Each hit gives 60% extra ultimate charge.',
    onHit({ engine, attacker }) {
      attacker.ultCharge = Math.min(attacker.ultMax, attacker.ultCharge + 5);
    },
  },

  /* ------------------------------------------------------------- exotic */
  shuriken: {
    name: 'Ricochet',
    kind: 'onhit',
    desc: '40% chance to chip a second enemy for 40% of the hit.',
    onHit({ engine, attacker, victim, amount }) {
      if (!engine.rng.chance(0.4)) return;
      const others = engine.enemiesOf(attacker).filter((b) => b !== victim);
      if (!others.length) return;
      const t = engine.rng.pick(others);
      engine.damage(t, amount * 0.4, { sourceId: attacker.id, kind: 'ricochet' });
      engine.beam(victim, t, '#cbd5e1', 0.16);
    },
  },
  chakram: {
    name: 'Whirl',
    kind: 'onhit',
    desc: 'Every fourth hit strikes every enemy on the board for 45%.',
    onHit({ engine, attacker, victim, amount }) {
      attacker.whirl = (attacker.whirl || 0) + 1;
      if (attacker.whirl % 4) return;
      for (const foe of engine.enemiesOf(attacker)) {
        engine.damage(foe, amount * 0.45, { sourceId: attacker.id, kind: 'whirl' });
      }
      engine.effects.push({ type: 'ring', x: attacker.x, y: attacker.y, r: 10,
        maxR: 260, age: 0, life: 0.4, color: attacker.element.colors.light });
      engine.sfx('whirl');
    },
  },
  wrench: {
    name: 'Deploy Turret',
    kind: 'deploy',
    desc: 'Every 3rd hit bolts down a turret that shoots the nearest enemy for 12s.',
    onHit({ engine, attacker }) {
      attacker.turretCount = (attacker.turretCount || 0) + 1;
      if (attacker.turretCount % 3) return;
      engine.spawnTurret({
        x: attacker.x, y: attacker.y,
        ownerId: attacker.id, teamId: attacker.teamId,
        damage: attacker.baseDamage * 0.45,
        color: attacker.element.colors.accent,
      });
      engine.announce(attacker, 'TURRET DEPLOYED', attacker.element.colors.accent, 1.3);
    },
  },
  gauntlet: {
    name: 'Crush',
    kind: 'passive',
    desc: '+28% damage, at the shortest reach of any weapon.',
    bonus() { return 1.28; },
  },
  bone: {
    name: 'Curse',
    kind: 'onhit',
    desc: 'The target heals 60% less for 5s. Shuts down regeneration and lifesteal.',
    onHit({ engine, attacker, victim }) {
      victim.curseUntil = engine.time + 5;
    },
  },
  bow: {
    name: 'Point Blank',
    kind: 'deploy',
    desc: 'Every hit also looses a homing arrow for 45% of the damage.',
    onHit({ engine, attacker, victim, amount }) {
      const dx = victim.x - attacker.x, dy = victim.y - attacker.y;
      const d = Math.hypot(dx, dy) || 1;
      engine.spawnProjectile({
        x: attacker.x, y: attacker.y,
        vx: (dx / d) * 560, vy: (dy / d) * 560,
        ownerId: attacker.id, teamId: attacker.teamId,
        damage: amount * 0.45, radius: 8, life: 2.5, style: 'arrow',
        color: attacker.element.colors.accent, homing: 220, seekId: victim.id,
      });
    },
  },
  vial: {
    name: 'Volatile Mix',
    kind: 'onhit',
    desc: 'Every hit applies a random debuff: corrode, chill or bleed.',
    onHit({ engine, attacker, victim, amount }) {
      const pick = engine.rng.pick(['corrode', 'chill', 'bleed']);
      engine.applyStatus(victim, pick, 5, { power: amount * 0.1, sourceId: attacker.id });
    },
  },
  flask: {
    name: 'Splash',
    kind: 'deploy',
    desc: 'Leaves a poison pool under the target on every hit.',
    onHit({ engine, attacker, victim }) {
      engine.spawnHazard({
        x: victim.x, y: victim.y, radius: 44, life: 3.5, kind: 'poison',
        ownerId: attacker.id, teamId: attacker.teamId, affects: 'enemies',
        color: attacker.element.colors.accent,
        dps: attacker.baseDamage * 0.16,
      });
    },
  },
  shield: {
    name: 'Bash',
    kind: 'passive',
    desc: 'Wins every weapon clash outright, and knocks the loser back.',
    onSpawn(ball) {
      ball.shieldBash = true;
    },
  },
  caltrop: {
    name: 'Scatter Barbs',
    kind: 'deploy',
    desc: 'Bleeds and chills on hit, and scatters a barb field on the ground for 5s.',
    onHit({ engine, attacker, victim, amount }) {
      engine.applyStatus(victim, 'bleed', 5, { power: amount * 0.09, sourceId: attacker.id });
      engine.applyStatus(victim, 'chill', 2.5, { sourceId: attacker.id });
      engine.spawnHazard({
        x: victim.x, y: victim.y, radius: 40, life: 5, kind: 'barbs',
        ownerId: attacker.id, teamId: attacker.teamId, affects: 'enemies',
        color: attacker.element.colors.light,
        dps: attacker.baseDamage * 0.13,
      });
    },
  },
};

export function weaponAbility(weaponId) {
  return WEAPON_ABILITIES[weaponId] || null;
}
