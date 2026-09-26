/* The elemental pack.
 *
 * Twelve elements. Each one owns a status effect that nothing else applies
 * the same way, so a matchup is really a question of which status lands first
 * and whether the other template can answer it.
 *
 * To add an element: copy the shape of any block below. It joins the roster
 * builder, the matchup matrix, the codex and the share-URL codec on its own.
 */

import { Fighters, wpal } from '../fighters.js';

/* ================================================================= FIRE */

Fighters.define({
  id: 'fire',
  name: 'Fire',
  glyph: '🔥',
  blurb: 'Stacks burn that keeps ticking long after the hit lands.',
  colors: { core: '#ef2b16', dark: '#7a0f06', light: '#ff8a3d', accent: '#ffd24a', ink: '#ffffff', trail: '#ff6a2a' },
  weapon: { id: 'sword', name: 'Cinderbrand', palette: wpal('fire', '#ff6a1f', '#ffd24a', '#9a2a06', '#fff0a8', '#3a2118') },
  cosmetic: 'wings',
  damage: 1.16, hp: 1.02,
  strong: ['nature', 'ice', 'metal'],
  weak: ['water', 'earth'],
  particle: 'ember',

  // Fire's whole plan: land hits, stack burn, let the stacks do the work.
  onHit({ engine, attacker, victim, amount }) {
    const mult = victim.mods.burnMul;
    if (mult <= 0.01) return;
    engine.applyStatus(victim, 'burn', 3.2, {
      power: amount * 0.27 * mult,
      sourceId: attacker.id,
    });
    engine.particles.burst('ember', victim.x, victim.y, 8, 170);
  },

  passive: {
    name: 'Kindling',
    desc: 'Deals +12% damage for every burn stack already on the target.',
    // Read by the damage pipeline via element.damageBonus.
    damageBonus(engine, attacker, victim) {
      const burn = victim.statuses.get('burn');
      return burn ? 1 + 0.12 * burn.stacks : 1;
    },
  },

  ult: {
    name: 'Infernal Rage',
    chargePerHit: 9,
    chargePerSecond: 2.2,
    statLabel: (ball) => `Burn DMG/Duration: ${(ball.baseDamage * 0.22).toFixed(1)}`,
    cast(engine, owner) {
      engine.applyStatus(owner, 'enrage', 6, { sourceId: owner.id });
      engine.applyStatus(owner, 'ccimmune', 6, { sourceId: owner.id });
      for (const foe of engine.enemiesOf(owner)) {
        engine.applyStatus(foe, 'burn', 6, { power: owner.baseDamage * 0.3, stacks: 3, sourceId: owner.id });
      }
      engine.shockwave(owner.x, owner.y, 190, 320, { damage: owner.baseDamage * 1.1, sourceId: owner.id });
      engine.particles.burst('ember', owner.x, owner.y, 90, 420);
      engine.flash('#ff6a2a', 0.34);
      engine.shake(16);
      engine.sfx('ult_fire');
    },
  },

  overload: {
    name: 'Wildfire',
    desc: 'Every hit splashes burn onto all nearby enemies.',
    apply(engine, ball) {
      ball.flags.wildfire = true;
      engine.applyStatus(ball, 'enrage', 10, { sourceId: ball.id });
    },
  },
});

/* ================================================================== ICE */

Fighters.define({
  id: 'ice',
  name: 'Ice',
  glyph: '❄️',
  blurb: 'Chill stacks slow the target until they freeze solid.',
  colors: { core: '#29c6f0', dark: '#0a5877', light: '#b6f0ff', accent: '#ffffff', ink: '#05323f', trail: '#8be9ff' },
  weapon: { id: 'axe', name: 'Rimehewer', palette: wpal('ice', '#9fe8ff', '#ffffff', '#2a7b9b', '#d8f7ff', '#4a3b2c') },
  cosmetic: 'frost',
  hp: 1.16, speed: 1.04, damage: 1.18,
  strong: ['nature', 'water', 'wind'],
  weak: ['fire', 'metal'],
  particle: 'frost',

  // Four chills freeze. The engine's status stacking does the counting;
  // ice just has to keep landing hits.
  onHit({ engine, attacker, victim }) {
    if (engine.rng.chance(0.8 * victim.mods.freezeMul)) {
      engine.applyStatus(victim, 'chill', 3, { sourceId: attacker.id });
      const chill = victim.statuses.get('chill');
      if (chill && chill.stacks >= 4) {
        victim.statuses.delete('chill');
        engine.applyStatus(victim, 'freeze', 1.3, { sourceId: attacker.id });
        engine.announce(victim, 'FROZEN', '#8be9ff');
      }
    }
    engine.particles.burst('frost', victim.x, victim.y, 6, 140);
  },

  passive: {
    name: 'Shatterpoint',
    desc: 'Hits into chilled targets scale with the chill; shattering a frozen one doubles.',
    // Chill stacks are now the payoff rather than a stepping stone to a
    // freeze, since hard CC no longer chains.
    damageBonus(engine, attacker, victim) {
      if (victim.statuses.has('freeze')) return 2;
      const chill = victim.statuses.get('chill');
      return chill ? 1 + 0.2 * chill.stacks : 1;
    },
  },

  ult: {
    name: 'Blizzard',
    chargePerHit: 8,
    chargePerSecond: 2.4,
    statLabel: (ball) => `Damage/Slow: ${(ball.baseDamage * 1.4).toFixed(0)}`,
    cast(engine, owner) {
      for (const foe of engine.enemiesOf(owner)) {
        engine.damage(foe, owner.baseDamage * 1.4, { sourceId: owner.id, kind: 'ult' });
        engine.applyStatus(foe, 'chill', 7, { stacks: 3, sourceId: owner.id });
        if (engine.rng.chance(0.5)) engine.applyStatus(foe, 'freeze', 1.6, { sourceId: owner.id });
      }
      engine.applyStatus(owner, 'shield', 5, { sourceId: owner.id });
      engine.weather('blizzard', 6);
      engine.particles.burst('frost', owner.x, owner.y, 110, 300);
      engine.flash('#b6f0ff', 0.4);
      engine.shake(10);
      engine.sfx('ult_ice');
    },
  },

  overload: {
    name: 'Absolute Zero',
    desc: 'Contact freezes outright, and the arena floor turns slick.',
    apply(engine, ball) {
      ball.flags.deepFreeze = true;
      engine.applyStatus(ball, 'shield', 12, { sourceId: ball.id });
    },
  },
});

/* ============================================================ LIGHTNING */

Fighters.define({
  id: 'lightning',
  name: 'Lightning',
  glyph: '⚡',
  blurb: 'Damage arcs to a second target; soaked enemies conduct double.',
  colors: { core: '#f7d417', dark: '#7a5c00', light: '#fff59a', accent: '#ffffff', ink: '#241d00', trail: '#ffe76b' },
  weapon: { id: 'spear', name: 'Stormpike', palette: wpal('lightning', '#ffe14a', '#fffbcc', '#8a6b00', '#ffffff', '#2e2a1a') },
  cosmetic: 'sparks',
  speed: 1.2, spin: 1.24, hp: 1.04, damage: 1.12,
  strong: ['water', 'wind', 'metal'],
  weak: ['earth'],
  particle: 'spark',

  // The arc is what makes lightning scale into crowded fights.
  onHit({ engine, attacker, victim, amount }) {
    const others = engine.enemiesOf(attacker).filter((b) => b !== victim);
    if (others.length) {
      const arc = engine.rng.pick(others);
      engine.damage(arc, amount * 0.45 * arc.mods.shockMul, { sourceId: attacker.id, kind: 'chain' });
      engine.beam(victim, arc, '#fff59a', 0.22);
    } else {
      // Nowhere to arc to: the charge earths itself through the same target.
      engine.damage(victim, amount * 0.62 * victim.mods.shockMul,
        { sourceId: attacker.id, kind: 'chain' });
    }
    if (engine.rng.chance(0.14 * victim.mods.shockMul)) {
      engine.applyStatus(victim, 'stun', 0.55, { sourceId: attacker.id });
    }
    engine.particles.burst('spark', victim.x, victim.y, 7, 240);
  },

  passive: {
    name: 'Overcharge',
    desc: 'Builds speed and swing rate continuously; taking a hit halves the charge.',
    onTick(engine, ball, dt) {
      ball.charge = Math.min(1, (ball.charge || 0) + dt * 0.09);
      ball.mods.speedMul *= 1 + ball.charge * 0.35;
      ball.mods.spinMul *= 1 + ball.charge * 0.3;
    },
    onDamaged(engine, ball) {
      ball.charge *= 0.5;   // knocked back, not reset to nothing
    },
  },

  ult: {
    name: 'Chain Storm',
    chargePerHit: 10,
    chargePerSecond: 2.6,
    statLabel: (ball) => `Arc DMG: ${(ball.baseDamage * 0.9).toFixed(0)} ×3`,
    cast(engine, owner) {
      let from = owner;
      for (let bounce = 0; bounce < 3; bounce++) {
        for (const foe of engine.enemiesOf(owner)) {
          engine.damage(foe, owner.baseDamage * 0.9 * foe.mods.shockMul, { sourceId: owner.id, kind: 'ult' });
          engine.applyStatus(foe, 'stun', 0.4, { sourceId: owner.id });
          engine.beam(from, foe, '#fffbcc', 0.3);
          from = foe;
        }
      }
      engine.applyStatus(owner, 'haste', 6, { sourceId: owner.id });
      engine.flash('#fff59a', 0.5);
      engine.shake(14);
      engine.sfx('ult_lightning');
    },
  },

  overload: {
    name: 'Tesla Coil',
    desc: 'Continuously zaps whoever is closest, no weapon contact needed.',
    apply(engine, ball) {
      ball.flags.tesla = true;
      engine.applyStatus(ball, 'haste', 12, { sourceId: ball.id });
    },
  },
});

/* ================================================================ EARTH */

Fighters.define({
  id: 'earth',
  name: 'Earth',
  glyph: '🪨',
  blurb: 'Slow and enormously durable. Every wall bounce sheds armour damage.',
  colors: { core: '#8b5e34', dark: '#40281a', light: '#c89b6a', accent: '#5b8c3a', ink: '#ffffff', trail: '#a97c50' },
  weapon: { id: 'hammer', name: 'Terrafall', palette: wpal('earth', '#8d7355', '#c4a683', '#4a3a28', '#5b8c3a', '#3a2a1c') },
  cosmetic: 'rocks',
  hp: 1.3, speed: 0.96, damage: 1.26, spin: 0.94,
  strong: ['lightning', 'fire', 'metal'],
  weak: ['nature', 'wind'],
  particle: 'rubble',

  onHit({ engine, attacker, victim, amount }) {
    engine.knockback(victim, attacker, 260);
    if (engine.rng.chance(0.18)) {
      engine.applyStatus(victim, 'petrify', 1.1, { sourceId: attacker.id });
    }
    engine.shockwave(victim.x, victim.y, 70, 120, { damage: amount * 0.2, sourceId: attacker.id, exclude: victim });
    engine.particles.burst('rubble', victim.x, victim.y, 9, 190);
    engine.shake(4);
  },

  passive: {
    name: 'Bedrock',
    desc: 'Takes 20% less damage, and cannot be knocked around easily.',
    onTick(engine, ball) {
      ball.mods.dmgTakenMul *= 0.8;
      ball.mods.knockbackResist = 0.55;
    },
  },

  ult: {
    name: 'Tectonic Slam',
    chargePerHit: 11,
    chargePerSecond: 2,
    statLabel: (ball) => `Quake DMG: ${(ball.baseDamage * 1.8).toFixed(0)}`,
    cast(engine, owner) {
      engine.shockwave(owner.x, owner.y, 320, 640, { damage: owner.baseDamage * 1.8, sourceId: owner.id });
      for (const foe of engine.enemiesOf(owner)) {
        if (engine.dist(owner, foe) < 320) engine.applyStatus(foe, 'petrify', 2.2, { sourceId: owner.id });
      }
      engine.applyStatus(owner, 'shield', 7, { sourceId: owner.id });
      engine.particles.burst('rubble', owner.x, owner.y, 100, 380);
      engine.shake(26);
      engine.sfx('ult_earth');
    },
  },

  overload: {
    name: 'Avalanche',
    desc: 'Grows colossal and leaves a crushing trail of debris.',
    apply(engine, ball) {
      engine.applyStatus(ball, 'giant', 14, { sourceId: ball.id });
      ball.flags.debrisTrail = true;
    },
  },
});

/* ================================================================ WATER */

Fighters.define({
  id: 'water',
  name: 'Water',
  glyph: '💧',
  blurb: 'Soaks targets, setting them up for ice and lightning to finish.',
  colors: { core: '#1f7fd4', dark: '#06304f', light: '#7fc8ff', accent: '#c9f0ff', ink: '#ffffff', trail: '#4aa8e8' },
  weapon: { id: 'trident', name: 'Tidewarden', palette: wpal('water', '#4aa8e8', '#c9f0ff', '#0d4a72', '#ffffff', '#2a3a44') },
  cosmetic: 'bubbles',
  hp: 1.05, speed: 1.08, damage: 1.12,
  strong: ['fire', 'earth', 'metal'],
  weak: ['lightning', 'nature'],
  particle: 'droplet',

  onHit({ engine, attacker, victim }) {
    engine.applyStatus(victim, 'wet', 8, { sourceId: attacker.id });
    // Negative force pulls rather than shoves — Water wants the target close
    // so it can keep hitting into its own Soaked debuff.
    engine.knockback(victim, attacker, -150);
    engine.particles.burst('droplet', victim.x, victim.y, 8, 160);
  },

  passive: {
    name: 'Undertow',
    desc: 'Hits 45% harder into a soaked target, and drags soaked enemies closer.',
    // Water needs to cash in its own debuff. Without this the element is
    // pure utility for whoever it is standing next to, and loses every duel.
    damageBonus(engine, attacker, victim) {
      return victim.statuses.has('wet') ? 1.45 : 1;
    },
    onTick(engine, ball, dt) {
      for (const foe of engine.enemiesOf(ball)) {
        if (!foe.statuses.has('wet')) continue;
        const dx = ball.x - foe.x, dy = ball.y - foe.y;
        const d = Math.hypot(dx, dy) || 1;
        foe.vx += (dx / d) * 26 * dt;
        foe.vy += (dy / d) * 26 * dt;
      }
    },
  },

  ult: {
    name: 'Maelstrom',
    chargePerHit: 9,
    chargePerSecond: 2.3,
    statLabel: (ball) => `Vortex DMG: ${(ball.baseDamage * 1.3).toFixed(0)}`,
    cast(engine, owner) {
      engine.vortex(owner.x, owner.y, 360, 900, 3.5, owner.id);
      for (const foe of engine.enemiesOf(owner)) {
        engine.damage(foe, owner.baseDamage * 1.3, { sourceId: owner.id, kind: 'ult' });
        engine.applyStatus(foe, 'wet', 9, { sourceId: owner.id });
      }
      engine.particles.burst('droplet', owner.x, owner.y, 120, 340);
      engine.flash('#7fc8ff', 0.3);
      engine.shake(12);
      engine.sfx('ult_water');
    },
  },

  overload: {
    name: 'Riptide',
    desc: 'Leaves a soaking wake behind, and moves without friction.',
    apply(engine, ball) {
      ball.flags.wake = true;
      engine.applyStatus(ball, 'swift', 14, { sourceId: ball.id });
    },
  },
});

/* =============================================================== NATURE */

Fighters.define({
  id: 'nature',
  name: 'Nature',
  glyph: '🌿',
  blurb: 'Out-sustains everything. Entangles, reflects, and regrows faster the closer it gets to dying.',
  colors: { core: '#3f9d3a', dark: '#1c4a1a', light: '#8fd96a', accent: '#d4f27a', ink: '#ffffff', trail: '#6bbf4a' },
  weapon: { id: 'scythe', name: 'Bramblereap', palette: wpal('nature', '#8fd96a', '#d4f27a', '#2f6b2a', '#c8a24a', '#4a3520') },
  cosmetic: 'leaves',
  hp: 0.98, damage: 0.86,
  strong: ['water', 'earth'],
  weak: ['fire', 'ice'],
  particle: 'leaf',

  onHit({ engine, attacker, victim, amount }) {
    // Entangle rather than poison — Venom owns damage-over-time.
    engine.applyStatus(victim, 'chill', 2, { sourceId: attacker.id });
    engine.heal(attacker, amount * 0.03);
    engine.particles.burst('leaf', victim.x, victim.y, 7, 150);
  },

  passive: {
    name: 'Photosynthesis',
    desc: 'Regenerates continuously, faster the lower its health gets.',
    onTick(engine, ball, dt) {
      const missing = 1 - ball.hp / ball.maxHp;
      engine.heal(ball, (0.025 + missing * 0.08) * dt);
    },
  },

  ult: {
    name: 'Overgrowth',
    chargePerHit: 8,
    chargePerSecond: 2.5,
    statLabel: (ball) => `Regen/Poison: ${(ball.baseDamage * 0.5).toFixed(1)}`,
    cast(engine, owner) {
      engine.applyStatus(owner, 'regen', 8, { power: owner.maxHp * 0.045, sourceId: owner.id });
      engine.applyStatus(owner, 'thorns', 8, { sourceId: owner.id });
      for (const foe of engine.enemiesOf(owner)) {
        engine.applyStatus(foe, 'poison', 8, { power: owner.baseDamage * 0.22, stacks: 4, sourceId: owner.id });
        engine.applyStatus(foe, 'chill', 4, { stacks: 2, sourceId: owner.id });
      }
      engine.particles.burst('leaf', owner.x, owner.y, 100, 280);
      engine.flash('#8fd96a', 0.28);
      engine.sfx('ult_nature');
    },
  },

  overload: {
    name: 'Ancient Bloom',
    desc: 'Permanent thorns and doubled regeneration.',
    apply(engine, ball) {
      engine.applyStatus(ball, 'thorns', 20, { sourceId: ball.id });
      engine.applyStatus(ball, 'regen', 20, { power: ball.maxHp * 0.03, sourceId: ball.id });
    },
  },
});

/* ================================================================ LIGHT */

Fighters.define({
  id: 'light',
  name: 'Light',
  glyph: '🛡️',
  blurb: 'Cleanses its own debuffs and punishes anything holding a curse.',
  colors: { core: '#f5efc8', dark: '#8a7b2a', light: '#ffffff', accent: '#ffd34a', ink: '#3a3210', trail: '#fff4b8' },
  weapon: { id: 'gauntlet', name: 'Dawnbreaker', palette: wpal('light', '#ffe9a8', '#ffffff', '#a08430', '#ffd34a', '#6a5a24') },
  cosmetic: 'halo',
  hp: 1.08, damage: 0.98,
  strong: ['shadow', 'venom'],
  weak: ['arcane'],
  particle: 'mote',

  onHit({ engine, attacker, victim, amount }) {
    // Rips one debuff off the target and converts it into raw damage.
    for (const [id, inst] of victim.statuses) {
      const def = engine.statusDef(id);
      if (def && !def.beneficial) {
        victim.statuses.delete(id);
        engine.damage(victim, amount * 0.5 * (inst.stacks || 1), { sourceId: attacker.id, kind: 'purge' });
        engine.announce(victim, 'PURGED', '#ffd34a');
        break;
      }
    }
    engine.particles.burst('mote', victim.x, victim.y, 8, 170);
  },

  passive: {
    name: 'Sanctified',
    desc: 'Shrugs off one debuff every few seconds, all on its own.',
    onTick(engine, ball, dt) {
      ball.cleanseTimer = (ball.cleanseTimer || 0) + dt;
      if (ball.cleanseTimer < 3.5) return;
      ball.cleanseTimer = 0;
      for (const [id] of ball.statuses) {
        const def = engine.statusDef(id);
        if (def && !def.beneficial) { ball.statuses.delete(id); break; }
      }
    },
  },

  ult: {
    name: 'Judgment',
    chargePerHit: 9,
    chargePerSecond: 2.2,
    statLabel: (ball) => `Smite DMG: ${(ball.baseDamage * 1.5).toFixed(0)}`,
    cast(engine, owner) {
      owner.statuses.clear();
      engine.heal(owner, owner.maxHp * 0.3);
      engine.applyStatus(owner, 'ccimmune', 6, { sourceId: owner.id });
      for (const foe of engine.enemiesOf(owner)) {
        engine.damage(foe, owner.baseDamage * 1.5, { sourceId: owner.id, kind: 'ult' });
        engine.applyStatus(foe, 'stun', 0.8, { sourceId: owner.id });
        engine.pillar(foe.x, foe.y, '#fff4b8');
      }
      engine.flash('#ffffff', 0.6);
      engine.shake(12);
      engine.sfx('ult_light');
    },
  },

  overload: {
    name: 'Ascendant',
    desc: 'Immune to crowd control and constantly restoring itself.',
    apply(engine, ball) {
      engine.applyStatus(ball, 'ccimmune', 18, { sourceId: ball.id });
      engine.applyStatus(ball, 'regen', 18, { power: ball.maxHp * 0.02, sourceId: ball.id });
    },
  },
});

/* =============================================================== SHADOW */

Fighters.define({
  id: 'shadow',
  name: 'Shadow',
  glyph: '🌑',
  blurb: 'Drains health on contact and softens targets for the kill.',
  colors: { core: '#5b2d8a', dark: '#1a0b2e', light: '#a970e0', accent: '#e0a0ff', ink: '#ffffff', trail: '#7a45b5' },
  weapon: { id: 'dagger', name: 'Nightfang', palette: wpal('shadow', '#7a45b5', '#c79bea', '#2a1140', '#e0a0ff', '#241634') },
  cosmetic: 'smoke',
  speed: 1.22, spin: 1.38, hp: 1.14, damage: 1.3,
  strong: ['arcane', 'metal', 'knifethrower'],
  weak: ['light'],
  particle: 'smoke',

  onHit({ engine, attacker, victim, amount }) {
    engine.heal(attacker, amount * 0.58);
    engine.applyStatus(victim, 'corrode', 5, { sourceId: attacker.id });
    engine.particles.burst('smoke', victim.x, victim.y, 7, 130);
  },

  passive: {
    name: 'Umbral Step',
    desc: 'Below a third health it phases — 35% of incoming hits pass through.',
    onTick(engine, ball) {
      if (ball.hp / ball.maxHp < 0.34) {
        ball.mods.evasion = 0.35;
        ball.mods.speedMul *= 1.2;
      }
    },
  },

  ult: {
    name: 'Eclipse',
    chargePerHit: 10,
    chargePerSecond: 2.4,
    statLabel: (ball) => `Drain: ${(ball.baseDamage * 1.2).toFixed(0)}`,
    cast(engine, owner) {
      let drained = 0;
      for (const foe of engine.enemiesOf(owner)) {
        const dmg = owner.baseDamage * 1.2;
        engine.damage(foe, dmg, { sourceId: owner.id, kind: 'ult' });
        engine.applyStatus(foe, 'corrode', 9, { stacks: 4, sourceId: owner.id });
        engine.beam(foe, owner, '#a970e0', 0.4);
        drained += dmg;
      }
      engine.heal(owner, drained * 0.6);
      engine.applyStatus(owner, 'lifesteal', 8, { stacks: 2, sourceId: owner.id });
      engine.weather('eclipse', 6);
      engine.particles.burst('smoke', owner.x, owner.y, 90, 260);
      engine.sfx('ult_shadow');
    },
  },

  overload: {
    name: 'Devourer',
    desc: 'Heals for a large share of all damage dealt.',
    apply(engine, ball) {
      engine.applyStatus(ball, 'lifesteal', 20, { stacks: 3, sourceId: ball.id });
    },
  },
});

/* ================================================================= WIND */

Fighters.define({
  id: 'wind',
  name: 'Wind',
  glyph: '🌪️',
  blurb: 'Fast, evasive, and impossible to pin down. Flings everyone around.',
  colors: { core: '#7fd6c4', dark: '#1f5b52', light: '#d4fff6', accent: '#ffffff', ink: '#123a34', trail: '#a8ece0' },
  weapon: { id: 'chakram', name: 'Galecutter', palette: wpal('wind', '#a8ece0', '#ffffff', '#2f7a6c', '#d4fff6', '#3a4a48') },
  cosmetic: 'swirl',
  speed: 1.32, spin: 1.42, hp: 0.96, damage: 1.08, reach: 1.12,
  strong: ['earth', 'nature', 'duelist'],
  weak: ['lightning'],
  particle: 'gust',

  onHit({ engine, attacker, victim }) {
    engine.knockback(victim, attacker, 330);
    victim.spinBoost = (victim.spinBoost || 0) + 2;
    engine.particles.burst('gust', victim.x, victim.y, 6, 210);
  },

  passive: {
    name: 'Slipstream',
    desc: 'Three in ten incoming hits simply miss.',
    onTick(engine, ball) {
      ball.mods.evasion = Math.max(ball.mods.evasion || 0, 0.3);
    },
  },

  ult: {
    name: 'Cyclone',
    chargePerHit: 8,
    chargePerSecond: 2.8,
    statLabel: (ball) => `Shear DMG: ${(ball.baseDamage * 0.8).toFixed(0)} ×4`,
    cast(engine, owner) {
      engine.vortex(owner.x, owner.y, 420, -700, 4, owner.id);
      for (const foe of engine.enemiesOf(owner)) {
        for (let i = 0; i < 4; i++) {
          engine.damage(foe, owner.baseDamage * 0.8, { sourceId: owner.id, kind: 'ult' });
        }
        const a = engine.rng.next() * Math.PI * 2;
        foe.vx = Math.cos(a) * 620;
        foe.vy = Math.sin(a) * 620;
      }
      engine.applyStatus(owner, 'haste', 7, { sourceId: owner.id });
      engine.applyStatus(owner, 'swift', 7, { sourceId: owner.id });
      engine.weather('gale', 6);
      engine.particles.burst('gust', owner.x, owner.y, 110, 480);
      engine.shake(18);
      engine.sfx('ult_wind');
    },
  },

  overload: {
    name: 'Tempest Form',
    desc: 'Becomes small, blindingly fast, and very hard to hit.',
    apply(engine, ball) {
      engine.applyStatus(ball, 'swift', 16, { sourceId: ball.id });
      engine.applyStatus(ball, 'haste', 16, { sourceId: ball.id });
    },
  },
});

/* ================================================================ METAL */

Fighters.define({
  id: 'metal',
  name: 'Metal',
  glyph: '⚙️',
  blurb: 'Armour plating that sheds damage, and bleed that never stops.',
  colors: { core: '#9aa5b1', dark: '#3a444f', light: '#e2e8ee', accent: '#f0a020', ink: '#1b2027', trail: '#c0cad4' },
  weapon: { id: 'wrench', name: 'Ironjaw', palette: wpal('metal', '#b8c2cc', '#eef3f7', '#4a5560', '#f0a020', '#2e3640') },
  cosmetic: 'plating',
  hp: 1.18, damage: 1.08, speed: 0.94,
  strong: ['ice', 'venom'],
  weak: ['fire', 'lightning', 'earth'],
  particle: 'shard',

  onHit({ engine, attacker, victim, amount }) {
    engine.applyStatus(victim, 'bleed', 6, { power: amount * 0.09, sourceId: attacker.id });
    // Plating builds as it lands hits, but bleeds away on its own (see the
    // passive), so it rewards sustained pressure rather than just surviving.
    attacker.plating = Math.min(5, (attacker.plating || 0) + 1);
    engine.particles.burst('shard', victim.x, victim.y, 6, 200);
  },

  passive: {
    name: 'Plating',
    desc: 'Each landed hit adds a layer of armour, up to 20%. Layers rust away if it stops hitting.',
    onTick(engine, ball, dt) {
      ball.plating = Math.max(0, (ball.plating || 0) - dt * 0.3);
      ball.mods.dmgTakenMul *= 1 - 0.04 * ball.plating;
    },
  },

  ult: {
    name: 'Shrapnel Storm',
    chargePerHit: 9,
    chargePerSecond: 2.1,
    statLabel: (ball) => `Shards: ${(ball.baseDamage * 0.45).toFixed(0)} ×18`,
    cast(engine, owner) {
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        engine.spawnProjectile({
          x: owner.x, y: owner.y,
          vx: Math.cos(a) * 460, vy: Math.sin(a) * 460,
          ownerId: owner.id, teamId: owner.teamId,
          damage: owner.baseDamage * 0.45,
          radius: 5, life: 3, style: 'shard',
          color: owner.element.colors.light,
          statusId: 'bleed', statusPower: owner.baseDamage * 0.1,
        });
      }
      engine.applyStatus(owner, 'shield', 6, { sourceId: owner.id });
      owner.plating = 6;
      engine.shake(12);
      engine.sfx('ult_metal');
    },
  },

  overload: {
    name: 'Juggernaut',
    desc: 'Full plating, a shield, and colossal mass.',
    apply(engine, ball) {
      ball.plating = 6;
      engine.applyStatus(ball, 'giant', 16, { sourceId: ball.id });
      engine.applyStatus(ball, 'shield', 16, { sourceId: ball.id });
    },
  },
});

/* =============================================================== ARCANE */

Fighters.define({
  id: 'arcane',
  name: 'Arcane',
  glyph: '🔮',
  blurb: 'Ignores armour and warps the fight with homing bolts.',
  colors: { core: '#c026d3', dark: '#4a0d52', light: '#f0a8ff', accent: '#7dd3fc', ink: '#ffffff', trail: '#e060f0' },
  weapon: { id: 'staff', name: 'Riftcaller', palette: wpal('arcane', '#c026d3', '#f0a8ff', '#4a0d52', '#7dd3fc', '#2e1a3a') },
  cosmetic: 'runes',
  hp: 0.9, damage: 1.08, spin: 1.1,
  strong: ['light', 'metal'],
  weak: ['shadow'],
  particle: 'rune',

  onHit({ engine, attacker, victim, amount }) {
    // True damage: deliberately routed around dmgTakenMul.
    engine.damage(victim, amount * 0.22, { sourceId: attacker.id, kind: 'true', ignoreArmor: true });
    engine.applyStatus(victim, 'corrode', 6, { sourceId: attacker.id });
    if (engine.rng.chance(0.2)) {
      engine.spawnProjectile({
        x: attacker.x, y: attacker.y, vx: 0, vy: 0,
        ownerId: attacker.id, teamId: attacker.teamId,
        damage: amount * 0.5, radius: 6, life: 4, style: 'orb',
        color: attacker.element.colors.light, homing: 260, seekId: victim.id,
      });
    }
    engine.particles.burst('rune', victim.x, victim.y, 7, 160);
  },

  passive: {
    name: 'Mana Burn',
    desc: 'Drains the enemy ultimate meter on every hit.',
    onHitExtra(engine, attacker, victim) {
      victim.ultCharge = Math.max(0, victim.ultCharge - 12);
    },
  },

  ult: {
    name: 'Singularity',
    chargePerHit: 10,
    chargePerSecond: 2.3,
    statLabel: (ball) => `Collapse: ${(ball.baseDamage * 2).toFixed(0)}`,
    cast(engine, owner) {
      const tx = engine.arena.w / 2, ty = engine.arena.h / 2;
      engine.vortex(tx, ty, 999, 1400, 3, owner.id);
      for (const foe of engine.enemiesOf(owner)) {
        engine.damage(foe, owner.baseDamage * 2, { sourceId: owner.id, kind: 'ult', ignoreArmor: true });
        foe.ultCharge = 0;
        engine.applyStatus(foe, 'corrode', 10, { stacks: 5, sourceId: owner.id });
      }
      engine.particles.burst('rune', tx, ty, 140, 400);
      engine.flash('#c026d3', 0.42);
      engine.shake(22);
      engine.sfx('ult_arcane');
    },
  },

  overload: {
    name: 'Archmage',
    desc: 'Fires homing bolts on a timer, entirely independent of the weapon.',
    apply(engine, ball) {
      ball.flags.autoBolt = true;
    },
  },
});

/* ================================================================ VENOM */

Fighters.define({
  id: 'venom',
  name: 'Venom',
  glyph: '🧪',
  blurb: 'Poison that ramps the longer it sits. Wins long fights outright.',
  colors: { core: '#65a30d', dark: '#2a4a06', light: '#bef264', accent: '#a3e635', ink: '#12210a', trail: '#84cc16' },
  weapon: { id: 'bone', name: 'Blightfang', palette: wpal('venom', '#a3b18a', '#e3edc8', '#4a5a3a', '#84cc16', '#3a4028') },
  cosmetic: 'drip',
  hp: 0.95, damage: 0.85, speed: 1.08,
  strong: ['nature', 'shadow'],
  weak: ['light', 'metal'],
  particle: 'toxin',

  onHit({ engine, attacker, victim, amount }) {
    engine.applyStatus(victim, 'poison', 7, { power: amount * 0.052, sourceId: attacker.id });
    engine.particles.burst('toxin', victim.x, victim.y, 8, 150);
  },

  passive: {
    name: 'Virulence',
    desc: 'Immune to poison, and spreads it to anything it touches.',
    onTick(engine, ball) {
      ball.statuses.delete('poison');
    },
  },

  ult: {
    name: 'Plague Bloom',
    chargePerHit: 8,
    chargePerSecond: 2.6,
    statLabel: (ball) => `Toxin/sec: ${(ball.baseDamage * 0.35).toFixed(1)}`,
    cast(engine, owner) {
      for (const foe of engine.enemiesOf(owner)) {
        engine.applyStatus(foe, 'poison', 12, { power: owner.baseDamage * 0.3, stacks: 5, sourceId: owner.id });
        engine.applyStatus(foe, 'corrode', 12, { stacks: 5, sourceId: owner.id });
      }
      engine.weather('miasma', 8);
      engine.particles.burst('toxin', owner.x, owner.y, 130, 300);
      engine.flash('#84cc16', 0.3);
      engine.sfx('ult_venom');
    },
  },

  overload: {
    name: 'Pandemic',
    desc: 'Poison leaps between enemies who touch each other.',
    apply(engine, ball) {
      ball.flags.contagion = true;
    },
  },
});
