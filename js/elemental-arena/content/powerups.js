/* Powerups.
 *
 * Pickups drift into the arena on a timer and are claimed by contact. Most
 * are flat buffs, but the interesting one is `overload`: it has no effect of
 * its own, it delegates to whatever the picking element defines as its
 * `overload`. Fire gets Wildfire, Ice gets Absolute Zero, Metal becomes a
 * Juggernaut. Same pickup, twelve different outcomes.
 *
 * Add one here and it joins the spawn table automatically, weighted by
 * `weight` and gated by `minFighters` where that matters.
 */

import { Registry } from '../core/registry.js';

export const Powerups = new Registry('powerup', {
  defaults: { weight: 1, minFighters: 0, glyph: '?', announce: true },
  required: ['name', 'color', 'apply'],
});

Powerups.defineAll([
  {
    id: 'damage',
    name: 'Damage Up',
    color: '#ef4444',
    glyph: '+',
    weight: 3,
    // Permanent and stacking — this is the pickup that decides long matches.
    apply(engine, ball) {
      ball.baseDamage *= 1.2;
      ball.permMods.damage = (ball.permMods.damage || 0) + 1;
    },
  },
  {
    id: 'heal',
    name: 'Repair',
    color: '#22c55e',
    glyph: '♥',
    weight: 3,
    apply(engine, ball) {
      engine.heal(ball, ball.maxHp * 0.28);
    },
  },
  {
    id: 'shield',
    name: 'Bulwark',
    color: '#7ec8ff',
    glyph: '⬡',
    weight: 2,
    apply(engine, ball) {
      engine.applyStatus(ball, 'shield', 9, { sourceId: ball.id });
    },
  },
  {
    id: 'haste',
    name: 'Frenzy',
    color: '#ffe66d',
    glyph: '»',
    weight: 2,
    apply(engine, ball) {
      engine.applyStatus(ball, 'haste', 10, { sourceId: ball.id });
    },
  },
  {
    id: 'giant',
    name: 'Colossus',
    color: '#f97316',
    glyph: '▲',
    weight: 1.5,
    apply(engine, ball) {
      engine.applyStatus(ball, 'giant', 12, { sourceId: ball.id });
    },
  },
  {
    id: 'swift',
    name: 'Quicksilver',
    color: '#22d3ee',
    glyph: '▼',
    weight: 1.5,
    apply(engine, ball) {
      engine.applyStatus(ball, 'swift', 12, { sourceId: ball.id });
    },
  },
  {
    id: 'reach',
    name: 'Long Chain',
    color: '#a3a3a3',
    glyph: '—',
    weight: 2,
    // Weapons are held against the orb by default, so this is the pickup that
    // pushes one out onto a chain. Reach is quietly one of the strongest
    // stats: it widens the arc the weapon sweeps, raising hit *rate* rather
    // than hit damage.
    apply(engine, ball) {
      ball.tetherBonus = (ball.tetherBonus || 0) + 0.75;
      ball.permMods.reach = (ball.permMods.reach || 0) + 1;
    },
  },
  {
    id: 'twin',
    name: 'Twin Arms',
    color: '#e879f9',
    glyph: '✚',
    weight: 1,
    apply(engine, ball) {
      ball.addWeapon(engine);
    },
  },
  {
    id: 'lifesteal',
    name: 'Siphon',
    color: '#a855f7',
    glyph: '◈',
    weight: 1.5,
    apply(engine, ball) {
      engine.applyStatus(ball, 'lifesteal', 14, { sourceId: ball.id });
    },
  },
  {
    id: 'thorns',
    name: 'Bramble Guard',
    color: '#4f9d3a',
    glyph: '✳',
    weight: 1.5,
    apply(engine, ball) {
      engine.applyStatus(ball, 'thorns', 12, { sourceId: ball.id });
    },
  },
  {
    id: 'ultcharge',
    name: 'Surge',
    color: '#facc15',
    glyph: '★',
    weight: 2,
    apply(engine, ball) {
      ball.ultCharge = Math.min(ball.ultMax, ball.ultCharge + ball.ultMax * 0.6);
    },
  },
  {
    id: 'cleanse',
    name: 'Purify',
    color: '#ffffff',
    glyph: '○',
    weight: 1.5,
    apply(engine, ball) {
      for (const [id] of ball.statuses) {
        const def = engine.statusDef(id);
        if (def && !def.beneficial) ball.statuses.delete(id);
      }
      engine.applyStatus(ball, 'ccimmune', 5, { sourceId: ball.id });
    },
  },
  {
    id: 'maxhp',
    name: 'Vitality',
    color: '#fb7185',
    glyph: '✦',
    weight: 1.5,
    apply(engine, ball) {
      ball.maxHp += ball.baseMaxHp * 0.25;
      engine.heal(ball, ball.baseMaxHp * 0.25);
    },
  },
  /* ------------------------------------------------- the eccentric shelf

   * Pickups that change how the fight goes rather than how big your numbers
   * are. Every one of these costs you something, so grabbing one is a real
   * decision even when it is the only pickup on the floor.
   */
  {
    id: 'thornbloom',
    name: 'Thornbloom',
    color: '#4f9d3a',
    glyph: '❦',
    weight: 1.5,
    rare: true,
    // Vines everywhere, including under you. Whoever is better at not
    // standing still wins the next ten seconds.
    apply(engine, ball) {
      for (let i = 0; i < 7; i++) {
        engine.spawnHazard({
          x: engine.rng.range(engine.bounds.x0, engine.bounds.x1),
          y: engine.rng.range(engine.bounds.y0, engine.bounds.y1),
          radius: 60, life: 10, kind: 'vine',
          ownerId: ball.id, teamId: ball.teamId, affects: 'enemies',
          color: '#4f9d3a', status: 'chill', dps: ball.baseDamage * 0.22,
        });
      }
      engine.sfx('vine');
    },
  },
  {
    id: 'glasscannon',
    name: 'Glass Cannon',
    color: '#f43f5e',
    glyph: '☠',
    weight: 1.5,
    rare: true,
    desc: 'Double damage, half your remaining health.',
    apply(engine, ball) {
      ball.baseDamage *= 2;
      ball.hp = Math.max(1, ball.hp * 0.5);
      engine.particles.burst('blood', ball.x, ball.y, 24, 260, '#f43f5e');
    },
  },
  {
    id: 'hoard',
    name: "Miser's Hoard",
    color: '#fbbf24',
    glyph: '❖',
    weight: 1.2,
    rare: true,
    // Campaign only in practice — a sandbox fight has no purse, so this
    // reads there as a straight damage downgrade. That is the joke.
    apply(engine, ball) {
      ball.goldMul = (ball.goldMul || 1) * 2;
      ball.baseDamage *= 0.8;
      engine.announce(ball, 'DOUBLE GOLD', '#fbbf24', 1.8);
    },
  },
  {
    id: 'swarmcall',
    name: 'Swarm Call',
    color: '#a855f7',
    glyph: '⁂',
    weight: 1.2,
    rare: true,
    // A third arm, paid for in health.
    apply(engine, ball) {
      ball.addWeapon(engine);
      ball.maxHp *= 0.85;
      ball.hp = Math.min(ball.hp, ball.maxHp);
    },
  },
  {
    id: 'berserk',
    name: 'Blood Rush',
    color: '#ef4444',
    glyph: '⚔',
    weight: 1.5,
    rare: true,
    apply(engine, ball) {
      engine.applyStatus(ball, 'enrage', 12, { sourceId: ball.id });
      engine.applyStatus(ball, 'bleed', 12, { power: ball.maxHp * 0.004, sourceId: ball.id });
    },
  },
  {
    id: 'overload',
    name: 'Elemental Overload',
    color: '#ffffff',      // recoloured at spawn to match whoever grabs it
    glyph: '✺',
    weight: 1.2,
    rare: true,
    // The one pickup whose effect depends entirely on who eats it.
    apply(engine, ball) {
      const ov = ball.element.overload;
      if (!ov) {
        engine.applyStatus(ball, 'enrage', 10, { sourceId: ball.id });
        return;
      }
      ov.apply(engine, ball);
      engine.announce(ball, ov.name.toUpperCase(), ball.element.colors.light, 2.2);
    },
    labelFor(ball) {
      return ball.element.overload ? ball.element.overload.name : 'Overload';
    },
  },
]);
