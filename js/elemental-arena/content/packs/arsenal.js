/* The arsenal pack.
 *
 * Where the elemental pack is built around status effects, these are built
 * around *how the weapon behaves*: how far it reaches, how fast it recovers,
 * whether it throws something, and what it leaves on the floor.
 *
 * Two mechanics are theirs in particular:
 *  - Ground hazards. The Alchemist leaves brews that buff whoever rolls over
 *    them; the Bombardier leaves flasks that shatter into pools which only
 *    hurt its enemies. Same entity, opposite polarity.
 *  - Reach. Most templates hold the weapon against the orb (tether 0). The
 *    Lancer is the exception, and reach powerups are what let anyone else
 *    fight at range.
 */

import { Fighters, wpal } from '../fighters.js';

/* =============================================================== LANCER */

Fighters.define({
  id: 'lancer',
  family: 'arsenal',
  name: 'Lancer',
  glyph: '🔱',
  blurb: 'Fights at range on a long haft. Hits hardest while closing distance.',
  colors: { core: '#b45309', dark: '#4a2306', light: '#fbbf24', accent: '#fde68a', ink: '#ffffff', trail: '#d97706' },
  weapon: { id: 'spear', name: 'Longreach', palette: wpal('lancer', '#c8a24a', '#fde68a', '#6b4a10', '#ffffff', '#4a3520') },
  cosmetic: 'plating',
  // The one template that starts with real reach; everyone else earns it.
  tether: 1.15,
  reach: 1.2, damage: 1.14, hp: 1.02, spin: 0.92,
  strong: ['duelist', 'alchemist'],
  weak: ['knifethrower', 'bulwark'],
  particle: 'dust',

  onHit({ engine, attacker, victim, amount }) {
    engine.applyStatus(victim, 'bleed', 5, { power: amount * 0.08, sourceId: attacker.id });
    engine.knockback(victim, attacker, 180);
    engine.particles.burst('dust', victim.x, victim.y, 7, 180, attacker.element.colors.light);
  },

  passive: {
    name: 'Impale',
    desc: 'Damage scales with how fast the two orbs are closing on each other.',
    // Rewards driving into a target rather than orbiting it.
    damageBonus(engine, attacker, victim) {
      const dx = victim.x - attacker.x, dy = victim.y - attacker.y;
      const d = Math.hypot(dx, dy) || 1;
      const closing = ((attacker.vx - victim.vx) * dx + (attacker.vy - victim.vy) * dy) / d;
      return 1 + Math.max(0, Math.min(0.6, closing / 700));
    },
  },

  ult: {
    name: 'Phalanx Charge',
    chargePerHit: 9,
    chargePerSecond: 2.2,
    statLabel: (ball) => `Charge DMG: ${(ball.baseDamage * 1.7).toFixed(0)}`,
    cast(engine, owner) {
      // Aim at the nearest enemy and commit, spearing anything on the line.
      const foes = engine.enemiesOf(owner);
      if (foes.length) {
        let best = foes[0], bd = engine.dist(owner, best);
        for (const f of foes) { const d = engine.dist(owner, f); if (d < bd) { bd = d; best = f; } }
        const dx = best.x - owner.x, dy = best.y - owner.y;
        const d = Math.hypot(dx, dy) || 1;
        owner.vx = (dx / d) * 1250;
        owner.vy = (dy / d) * 1250;
      }
      for (const foe of foes) {
        engine.damage(foe, owner.baseDamage * 1.7, { sourceId: owner.id, kind: 'ult', knockback: 320 });
        engine.applyStatus(foe, 'bleed', 7, { power: owner.baseDamage * 0.16, stacks: 3, sourceId: owner.id });
      }
      engine.applyStatus(owner, 'haste', 5, { sourceId: owner.id });
      engine.applyStatus(owner, 'ccimmune', 5, { sourceId: owner.id });
      engine.particles.burst('dust', owner.x, owner.y, 80, 380, owner.element.colors.light);
      engine.shake(16);
      engine.sfx('ult_lancer');
    },
  },

  overload: {
    name: 'Pike Wall',
    desc: 'Doubles reach and adds a second haft.',
    apply(engine, ball) {
      ball.tetherBonus = (ball.tetherBonus || 0) + 1.4;
      ball.addWeapon(engine);
    },
  },
});

/* ============================================================== DUELIST */

Fighters.define({
  id: 'duelist',
  family: 'arsenal',
  name: 'Duelist',
  glyph: '🤺',
  blurb: 'Punishes whoever hit it last. A landed riposte hits twice as hard.',
  colors: { core: '#be123c', dark: '#4c0519', light: '#fb7185', accent: '#ffe4e6', ink: '#ffffff', trail: '#e11d48' },
  weapon: { id: 'rapier', name: 'Answer', palette: wpal('duelist', '#e2e8f0', '#ffffff', '#64748b', '#fb7185', '#3f1220') },
  cosmetic: 'sparks',
  speed: 1.16, spin: 1.3, hp: 0.86, damage: 0.79,
  strong: ['knifethrower', 'bombardier'],
  weak: ['lancer', 'bulwark'],
  particle: 'spark',

  onHit({ engine, attacker, victim, amount }) {
    if (attacker.riposteUntil && engine.time < attacker.riposteUntil) {
      attacker.riposteUntil = 0;
      engine.damage(victim, amount * 0.7, { sourceId: attacker.id, kind: 'riposte' });
      engine.announce(attacker, 'RIPOSTE', attacker.element.colors.light, 0.9);
      engine.particles.burst('spark', victim.x, victim.y, 18, 260, '#ffe4e6');
    }
    engine.applyStatus(victim, 'bleed', 4, { power: amount * 0.07, sourceId: attacker.id });
  },

  // Parrying is this template's whole plan, so a clash arms the riposte too.
  onParry(engine, ball) {
    ball.riposteUntil = engine.time + 2.5;
    engine.announce(ball, 'EN GARDE', ball.element.colors.light, 0.8);
  },

  passive: {
    name: 'Riposte',
    desc: 'Being hit — or parrying — arms a counter that hits 70% harder for 2.5s.',
    onDamaged(engine, ball) {
      ball.riposteUntil = engine.time + 2.5;
    },
    onTick(engine, ball) {
      if (ball.riposteUntil && engine.time < ball.riposteUntil) ball.mods.spinMul *= 1.25;
    },
  },

  ult: {
    name: 'Flurry',
    chargePerHit: 10,
    chargePerSecond: 2.5,
    statLabel: (ball) => `Thrusts: ${(ball.baseDamage * 0.55).toFixed(0)} ×9`,
    cast(engine, owner) {
      for (const foe of engine.enemiesOf(owner)) {
        for (let i = 0; i < 9; i++) {
          engine.damage(foe, owner.baseDamage * 0.55, { sourceId: owner.id, kind: 'ult' });
        }
        engine.applyStatus(foe, 'bleed', 8, { power: owner.baseDamage * 0.14, stacks: 4, sourceId: owner.id });
        engine.beam(owner, foe, '#ffe4e6', 0.3);
      }
      engine.applyStatus(owner, 'haste', 6, { sourceId: owner.id });
      owner.riposteUntil = engine.time + 6;
      engine.particles.burst('spark', owner.x, owner.y, 90, 320, '#fb7185');
      engine.shake(12);
      engine.sfx('ult_duelist');
    },
  },

  overload: {
    name: 'Perfect Form',
    desc: 'The riposte never expires.',
    apply(engine, ball) {
      ball.riposteUntil = Infinity;
      engine.applyStatus(ball, 'haste', 14, { sourceId: ball.id });
    },
  },
});

/* ========================================================= KNIFETHROWER */

Fighters.define({
  id: 'knifethrower',
  family: 'arsenal',
  name: 'Knifethrower',
  glyph: '🔪',
  blurb: 'Never stops throwing. Every hit sends another blade at someone else.',
  colors: { core: '#475569', dark: '#0f172a', light: '#cbd5e1', accent: '#38bdf8', ink: '#ffffff', trail: '#94a3b8' },
  weapon: { id: 'dagger', name: 'Last Blade', palette: wpal('knife', '#cbd5e1', '#ffffff', '#334155', '#38bdf8', '#1e293b') },
  cosmetic: 'smoke',
  speed: 1.12, spin: 1.35, hp: 0.84, damage: 0.78,
  strong: ['lancer', 'archer'],
  weak: ['duelist', 'bulwark'],
  particle: 'shard',

  onHit({ engine, attacker, victim, amount }) {
    engine.applyStatus(victim, 'bleed', 6, { power: amount * 0.12, stacks: 2, sourceId: attacker.id });
    // Each landed hit flings a blade at a *different* enemy, so the template
    // scales with how crowded the arena is.
    const others = engine.enemiesOf(attacker).filter((b) => b !== victim);
    const target = others.length ? engine.rng.pick(others) : victim;
    engine.throwKnife(attacker, target, amount * 0.3);
  },

  passive: {
    name: 'Bandolier',
    desc: 'Throws a blade at a random enemy every 2.9 seconds, for free.',
    onTick(engine, ball, dt) {
      ball.knifeTimer = (ball.knifeTimer || 0) + dt;
      if (ball.knifeTimer < 2.9) return;
      ball.knifeTimer = 0;
      const foes = engine.enemiesOf(ball);
      if (foes.length) engine.throwKnife(ball, engine.rng.pick(foes), ball.baseDamage * 0.34);
    },
  },

  ult: {
    name: 'Blade Storm',
    chargePerHit: 9,
    chargePerSecond: 2.6,
    statLabel: (ball) => `Blades: ${(ball.baseDamage * 0.5).toFixed(0)} ×20`,
    cast(engine, owner) {
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        engine.spawnProjectile({
          x: owner.x, y: owner.y,
          vx: Math.cos(a) * 520, vy: Math.sin(a) * 520,
          ownerId: owner.id, teamId: owner.teamId,
          damage: owner.baseDamage * 0.5,
          radius: 5, life: 4, style: 'shard',
          color: owner.element.colors.light,
          statusId: 'bleed', statusPower: owner.baseDamage * 0.1,
          pierce: 1,
        });
      }
      engine.applyStatus(owner, 'swift', 6, { sourceId: owner.id });
      engine.particles.burst('shard', owner.x, owner.y, 70, 340, '#cbd5e1');
      engine.shake(13);
      engine.sfx('ult_knife');
    },
  },

  overload: {
    name: 'Endless Bandolier',
    desc: 'Throws three times as often, and the blades pierce.',
    apply(engine, ball) {
      ball.flags.rapidKnives = true;
      engine.applyStatus(ball, 'swift', 16, { sourceId: ball.id });
    },
  },
});

/* =============================================================== ARCHER */

Fighters.define({
  id: 'archer',
  family: 'arsenal',
  name: 'Archer',
  glyph: '🏹',
  blurb: 'The further away the target, the harder the arrow lands.',
  colors: { core: '#15803d', dark: '#052e16', light: '#86efac', accent: '#fde047', ink: '#ffffff', trail: '#22c55e' },
  weapon: { id: 'bow', name: 'Farshot', palette: wpal('archer', '#a16207', '#fde047', '#3f2a06', '#86efac', '#3f2a12') },
  cosmetic: 'leaves',
  hp: 0.92, damage: 0.8, speed: 1.05, spin: 0.9,
  strong: ['alchemist', 'bombardier'],
  weak: ['knifethrower', 'lancer'],
  particle: 'leaf',

  // Melee is the Archer's weakness by design — the bow is for range.
  onHit({ engine, attacker, victim }) {
    engine.knockback(victim, attacker, 240);
    engine.applyStatus(victim, 'chill', 2, { sourceId: attacker.id });
  },

  passive: {
    name: 'Longshot',
    desc: 'Looses an arrow every 1.55s at the furthest enemy; damage grows with distance.',
    onTick(engine, ball, dt) {
      ball.arrowTimer = (ball.arrowTimer || 0) + dt;
      if (ball.arrowTimer < 1.55) return;
      ball.arrowTimer = 0;
      const foes = engine.enemiesOf(ball);
      if (!foes.length) return;
      let far = foes[0], fd = engine.dist(ball, far);
      for (const f of foes) { const d = engine.dist(ball, f); if (d > fd) { fd = d; far = f; } }
      const span = Math.hypot(engine.arena.w, engine.arena.h);
      const scale = 0.85 + (fd / span) * 1.7;
      const dx = far.x - ball.x, dy = far.y - ball.y;
      const d = Math.hypot(dx, dy) || 1;
      engine.spawnProjectile({
        x: ball.x, y: ball.y,
        vx: (dx / d) * 640, vy: (dy / d) * 640,
        ownerId: ball.id, teamId: ball.teamId,
        damage: ball.baseDamage * scale,
        radius: 8, life: 3.5, style: 'arrow',
        color: ball.element.colors.accent,
        homing: 90, seekId: far.id,
      });
      engine.sfx('bow');
    },
  },

  ult: {
    name: 'Arrow Rain',
    chargePerHit: 8,
    chargePerSecond: 2.4,
    statLabel: (ball) => `Volley: ${(ball.baseDamage * 0.6).toFixed(0)} ×16`,
    cast(engine, owner) {
      for (const foe of engine.enemiesOf(owner)) {
        for (let i = 0; i < 4; i++) {
          const a = engine.rng.next() * Math.PI * 2;
          engine.spawnProjectile({
            x: foe.x + Math.cos(a) * 260, y: foe.y + Math.sin(a) * 260,
            vx: -Math.cos(a) * 700, vy: -Math.sin(a) * 700,
            ownerId: owner.id, teamId: owner.teamId,
            damage: owner.baseDamage * 0.6,
            radius: 8, life: 2.5, style: 'arrow',
            color: owner.element.colors.accent,
            homing: 220, seekId: foe.id,
          });
        }
        engine.pillar(foe.x, foe.y, '#86efac');
      }
      engine.applyStatus(owner, 'haste', 6, { sourceId: owner.id });
      engine.shake(11);
      engine.sfx('ult_archer');
    },
  },

  overload: {
    name: 'Rapid Draw',
    desc: 'Fires constantly, at every enemy at once.',
    apply(engine, ball) {
      ball.flags.rapidArrows = true;
      engine.applyStatus(ball, 'haste', 16, { sourceId: ball.id });
    },
  },
});

/* ============================================================ ALCHEMIST */

Fighters.define({
  id: 'alchemist',
  family: 'arsenal',
  name: 'Alchemist',
  glyph: '⚗️',
  blurb: 'Leaves brews on the floor. Anyone who rolls over one gets the buff — including the enemy.',
  colors: { core: '#7c3aed', dark: '#2e1065', light: '#c4b5fd', accent: '#f0abfc', ink: '#ffffff', trail: '#a78bfa' },
  weapon: { id: 'vial', name: 'Brewglass', palette: wpal('alch', '#c4b5fd', '#ede9fe', '#4c1d95', '#f0abfc', '#3b2a1a') },
  cosmetic: 'bubbles',
  hp: 1.2, damage: 1.12, speed: 1.0,
  strong: ['bulwark', 'bombardier'],
  weak: ['archer', 'lancer'],
  particle: 'mote',

  onHit({ engine, attacker, victim, amount }) {
    engine.heal(attacker, amount * 0.11);
    engine.applyStatus(victim, 'corrode', 5, { sourceId: attacker.id });
  },

  passive: {
    name: 'Brewmaster',
    desc: 'Drops a potion every 7.5s. It buffs whoever touches it, so position matters.',
    onTick(engine, ball, dt) {
      ball.brewTimer = (ball.brewTimer || 0) + dt;
      if (ball.brewTimer < 7.5) return;
      ball.brewTimer = 0;
      engine.dropPotion(ball);
    },
  },

  ult: {
    name: 'Elixir Cascade',
    chargePerHit: 9,
    chargePerSecond: 2.3,
    statLabel: (ball) => `Brew heal: ${(ball.maxHp * 0.07).toFixed(0)}`,
    cast(engine, owner) {
      for (let i = 0; i < 4; i++) engine.dropPotion(owner, true);
      engine.heal(owner, owner.maxHp * 0.2);
      engine.applyStatus(owner, 'regen', 6, { power: owner.maxHp * 0.018, sourceId: owner.id });
      engine.applyStatus(owner, 'shield', 6, { sourceId: owner.id });
      engine.particles.burst('mote', owner.x, owner.y, 100, 300, '#c4b5fd');
      engine.flash('#c4b5fd', 0.26);
      engine.sfx('ult_alchemist');
    },
  },

  overload: {
    name: 'Master Brewer',
    desc: 'Its own brews only work for its team.',
    apply(engine, ball) {
      ball.flags.selfishBrews = true;
      engine.applyStatus(ball, 'regen', 18, { power: ball.maxHp * 0.02, sourceId: ball.id });
    },
  },
});

/* =========================================================== BOMBARDIER */

Fighters.define({
  id: 'bombardier',
  family: 'arsenal',
  name: 'Bombardier',
  glyph: '🧨',
  blurb: 'Lobs flasks that shatter into poison. The pools only ever hurt its enemies.',
  colors: { core: '#ca8a04', dark: '#422006', light: '#fde047', accent: '#84cc16', ink: '#1a1400', trail: '#eab308' },
  weapon: { id: 'flask', name: 'Shattercharge', palette: wpal('bomb', '#a3b18a', '#fde047', '#4a5a3a', '#84cc16', '#3a2a18') },
  cosmetic: 'drip',
  hp: 0.88, damage: 0.76, speed: 1.02,
  strong: ['bulwark', 'lancer'],
  weak: ['duelist', 'archer'],
  particle: 'toxin',

  onHit({ engine, attacker, victim, amount }) {
    engine.applyStatus(victim, 'poison', 6, { power: amount * 0.12, sourceId: attacker.id });
    // Not on every hit — otherwise contact damage and pool attrition stack
    // from the same swing and nothing else can keep pace.
    if (engine.rng.chance(0.3)) engine.throwFlask(attacker, victim);
  },

  passive: {
    name: 'Volatile',
    desc: 'Every wall bounce drops a flask. It shatters into a pool that poisons enemies.',
    // Bouncing is something the orb does constantly and cannot control, which
    // makes this a steady drip of hazards rather than a burst.
    onBounce(engine, ball) {
      if (engine.rng.chance(0.17)) engine.dropFlask(ball);
    },
  },

  ult: {
    name: 'Saturation',
    chargePerHit: 8,
    chargePerSecond: 2.5,
    statLabel: (ball) => `Pool DPS: ${(ball.baseDamage * 0.5).toFixed(1)}`,
    cast(engine, owner) {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const d = 90 + engine.rng.next() * 220;
        engine.spawnHazard({
          x: owner.x + Math.cos(a) * d, y: owner.y + Math.sin(a) * d,
          radius: 62, life: 10, kind: 'poison',
          ownerId: owner.id, teamId: owner.teamId, affects: 'enemies',
          color: owner.element.colors.accent,
          dps: owner.baseDamage * 0.36,
        });
      }
      for (const foe of engine.enemiesOf(owner)) {
        engine.applyStatus(foe, 'poison', 10, { power: owner.baseDamage * 0.25, stacks: 4, sourceId: owner.id });
      }
      engine.weather('miasma', 8);
      engine.particles.burst('toxin', owner.x, owner.y, 120, 330, '#84cc16');
      engine.sfx('ult_bombardier');
    },
  },

  overload: {
    name: 'Cluster Charge',
    desc: 'Every flask splits into three.',
    apply(engine, ball) {
      ball.flags.clusterFlasks = true;
    },
  },
});

/* ============================================================== BULWARK */

Fighters.define({
  id: 'bulwark',
  family: 'arsenal',
  name: 'Bulwark',
  glyph: '🛡️',
  blurb: 'Never loses a clash. Parries reflect the blow straight back.',
  colors: { core: '#334155', dark: '#020617', light: '#94a3b8', accent: '#f59e0b', ink: '#ffffff', trail: '#64748b' },
  weapon: { id: 'shield', name: 'Aegis', palette: wpal('bulwark', '#94a3b8', '#e2e8f0', '#1e293b', '#f59e0b', '#292524') },
  cosmetic: 'plating',
  hp: 0.96, damage: 0.86, speed: 0.82, spin: 0.78,
  strong: ['duelist', 'knifethrower', 'archer'],
  weak: ['alchemist', 'bombardier'],
  particle: 'shard',

  onHit({ engine, attacker, victim, amount }) {
    engine.knockback(victim, attacker, 380);
    if (engine.rng.chance(0.16)) engine.applyStatus(victim, 'stun', 0.6, { sourceId: attacker.id });
    engine.shake(5);
  },

  // A clash is a win condition rather than a neutral exchange.
  onParry(engine, ball, other) {
    engine.damage(other, ball.baseDamage * 0.5, { sourceId: ball.id, kind: 'parry', knockback: 300 });
    engine.announce(ball, 'BLOCKED', ball.element.colors.accent, 0.8);
  },

  passive: {
    name: 'Guard',
    desc: 'Takes 10% less damage and always wins a weapon clash.',
    onTick(engine, ball) {
      ball.mods.dmgTakenMul *= 0.9;
      ball.mods.knockbackResist = 0.6;
      ball.mods.parryWins = true;
    },
  },

  ult: {
    name: 'Shield Wall',
    chargePerHit: 10,
    chargePerSecond: 2,
    statLabel: (ball) => `Reflect: ${(ball.baseDamage * 1.4).toFixed(0)}`,
    cast(engine, owner) {
      engine.applyStatus(owner, 'shield', 8, { sourceId: owner.id });
      engine.applyStatus(owner, 'thorns', 8, { sourceId: owner.id });
      engine.applyStatus(owner, 'ccimmune', 8, { sourceId: owner.id });
      engine.shockwave(owner.x, owner.y, 300, 620, { damage: owner.baseDamage * 1.4, sourceId: owner.id });
      for (const foe of engine.enemiesOf(owner)) {
        if (engine.dist(owner, foe) < 300) engine.applyStatus(foe, 'stun', 1, { sourceId: owner.id });
      }
      engine.particles.burst('shard', owner.x, owner.y, 90, 340, '#e2e8f0');
      engine.shake(20);
      engine.sfx('ult_bulwark');
    },
  },

  overload: {
    name: 'Immovable',
    desc: 'Permanent guard, and knockback simply does not apply.',
    apply(engine, ball) {
      ball.flags.immovable = true;
      engine.applyStatus(ball, 'shield', 18, { sourceId: ball.id });
      engine.applyStatus(ball, 'thorns', 18, { sourceId: ball.id });
    },
  },
});
