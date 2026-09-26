/* Enchantments — the proc layer that sits on top of a weapon.
 *
 * A weapon ability says what that weapon always does. An enchantment says what
 * it *sometimes* does. Every enchantment is a rarity, a chance, and an effect,
 * and the description states the real number because the player is being asked
 * to price it against a flat stat upgrade.
 *
 * Three shapes, and an enchantment may use more than one:
 *   damageMul  — the proc simply hits harder
 *   onProc     — the proc does something else entirely
 *   onEquip    — a permanent, always-on cost or quirk (this is where the
 *                trade-offs live: half of these make you worse at something)
 *
 * Gold-affecting enchantments write to engine.bonusGold / ball.goldMul, which
 * the campaign reads when it settles the stage. They do nothing in a sandbox
 * match, which is fine — there is no purse to fill.
 */

import { Registry } from '../core/registry.js';

export const Enchantments = new Registry('enchantment', {
  defaults: { rarity: 'uncommon', chanceBonus: 0, glyph: '✦', tags: [] },
  required: ['name', 'desc'],
});

/* Vines are their own small sub-system because three enchantments and two
 * upgrades all want them: a patch of creeper that snares whoever stands in it
 * and chews through them slowly. */
function sproutVines(engine, x, y, owner, { radius = 62, life = 6, dps = 0.22, count = 1 } = {}) {
  for (let i = 0; i < count; i++) {
    const jitter = count > 1 ? radius * 1.1 : 0;
    engine.spawnHazard({
      x: x + engine.rng.range(-jitter, jitter),
      y: y + engine.rng.range(-jitter, jitter),
      radius, life, kind: 'vine',
      ownerId: owner.id, teamId: owner.teamId, affects: 'enemies',
      color: '#4f9d3a',
      status: 'chill',
      dps: owner.baseDamage * dps,
    });
  }
  engine.particles.burst('leaf', x, y, 16, 150, '#4f9d3a');
  engine.sfx('vine');
}

Enchantments.defineAll([
  /* ====================================================== uncommon */
  {
    id: 'keen',
    name: 'Keen',
    rarity: 'uncommon',
    glyph: '⟩',
    short: 'KEEN',
    color: '#4ade80',
    desc: '20% chance to hit for 90% extra damage.',
    damageMul: 1.9,
  },
  {
    id: 'leeching',
    name: 'Leeching',
    rarity: 'uncommon',
    glyph: '◈',
    short: 'LEECH',
    color: '#a855f7',
    desc: '20% chance to heal you for 35% of the hit.',
    onProc({ engine, attacker, amount }) {
      engine.heal(attacker, amount * 0.35);
    },
  },
  {
    id: 'staggering',
    name: 'Staggering',
    rarity: 'uncommon',
    glyph: '✷',
    short: 'STAGGER',
    color: '#fbbf24',
    desc: '20% chance to stun for 0.7s.',
    onProc({ engine, victim, attacker }) {
      engine.applyStatus(victim, 'stun', 0.7, { sourceId: attacker.id });
    },
  },

  /* ========================================================== rare */
  {
    id: 'vinebound',
    name: 'Vinebound',
    rarity: 'rare',
    glyph: '❦',
    short: 'VINES',
    color: '#4f9d3a',
    desc: '28% chance to burst vines under the target — a snaring patch that chills and eats 22% of your damage a second for 6s.',
    onProc({ engine, attacker, victim }) {
      sproutVines(engine, victim.x, victim.y, attacker);
      engine.applyStatus(victim, 'chill', 3, { sourceId: attacker.id });
    },
  },
  {
    id: 'sundering',
    name: 'Sundering',
    rarity: 'rare',
    glyph: '⊘',
    short: 'SUNDER',
    color: '#f97316',
    desc: '20% chance to ignore armour and every resistance the target has.',
    chanceBonus: -0.08,
    onProc() { /* handled inline — the proc sets ignoreArmor on the hit */ },
    ignoreArmor: true,
  },
  {
    id: 'voidmark',
    name: 'Voidmark',
    rarity: 'rare',
    glyph: '◉',
    short: 'MARKED',
    color: '#8b5cf6',
    desc: '28% chance to mark the target: it takes 35% more damage from everything for 5s.',
    onProc({ engine, victim, attacker }) {
      engine.applyStatus(victim, 'voidmark', 5, { sourceId: attacker.id });
    },
  },
  {
    id: 'hoarfrost',
    name: 'Hoarfrost',
    rarity: 'rare',
    glyph: '❄',
    short: 'FROST',
    color: '#7dd3fc',
    desc: '28% chance to freeze for 1.3s. Frozen targets are easy to hit, so your damage drops 4% across the board.',
    onEquip(engine, ball) { ball.baseDamage *= 0.96; },
    onProc({ engine, victim, attacker }) {
      engine.applyStatus(victim, 'freeze', 1.3, { sourceId: attacker.id });
    },
  },

  /* ========================================================== epic */
  {
    id: 'thunderstruck',
    name: 'Thunderstruck',
    rarity: 'epic',
    glyph: '⚡',
    short: 'ARC',
    color: '#facc15',
    desc: '34% chance to arc for 45% of the hit to every other enemy within 260 units.',
    onProc({ engine, attacker, victim, amount }) {
      for (const foe of engine.enemiesOf(attacker)) {
        if (foe === victim || engine.dist(foe, victim) > 260) continue;
        engine.damage(foe, amount * 0.45, { sourceId: attacker.id, kind: 'chain' });
        engine.beam(victim, foe, '#facc15', 0.22);
      }
    },
  },
  {
    id: 'echoing',
    name: 'Echoing',
    rarity: 'epic',
    glyph: '≋',
    short: 'ECHO',
    color: '#22d3ee',
    desc: '34% chance the hit lands a second time for 70% damage a moment later.',
    onProc({ engine, attacker, victim, amount }) {
      engine.schedule(0.35, () => {
        if (victim.dead || attacker.dead) return;
        engine.damage(victim, amount * 0.7, { sourceId: attacker.id, kind: 'echo' });
        engine.particles.burst('spark', victim.x, victim.y, 12, 200, '#22d3ee');
      });
    },
  },
  {
    id: 'famine',
    name: 'Famine',
    rarity: 'epic',
    glyph: '☩',
    short: 'FAMINE',
    color: '#94a3b8',
    desc: '34% chance to stop the target healing at all for 7s and strip every buff it is running.',
    onProc({ engine, victim, attacker }) {
      engine.applyStatus(victim, 'famine', 7, { sourceId: attacker.id });
      for (const [id] of victim.statuses) {
        const def = engine.statusDef(id);
        if (def && def.beneficial) victim.statuses.delete(id);
      }
    },
  },
  {
    id: 'bramblewake',
    name: 'Bramblewake',
    rarity: 'epic',
    glyph: '⁂',
    short: 'BRAMBLE',
    color: '#4f9d3a',
    desc: '34% chance to leave three vine patches trailing behind you as you go.',
    onProc({ engine, attacker }) {
      sproutVines(engine, attacker.x, attacker.y, attacker, { count: 3, radius: 52, life: 7 });
    },
  },

  /* ===================================================== legendary */
  {
    id: 'starfall',
    name: 'Starfall',
    rarity: 'legendary',
    glyph: '★',
    short: 'STARFALL',
    color: '#fbbf24',
    desc: '42% chance to call down a meteor for 130% of the hit in a 110-unit blast.',
    onProc({ engine, attacker, victim, amount }) {
      engine.effects.push({ type: 'ring', x: victim.x, y: victim.y, r: 10,
        maxR: 110, age: 0, life: 0.45, color: '#fbbf24' });
      for (const foe of engine.enemiesOf(attacker)) {
        if (engine.dist(foe, victim) > 110) continue;
        engine.damage(foe, amount * 1.3, { sourceId: attacker.id, kind: 'blast' });
      }
      engine.particles.burst('spark', victim.x, victim.y, 40, 380, '#fbbf24');
      engine.shake(16);
      engine.flash('#fbbf24', 0.2);
    },
  },
  {
    id: 'kingsransom',
    name: "King's Ransom",
    rarity: 'legendary',
    glyph: '❖',
    short: 'RANSOM',
    color: '#fbbf24',
    tags: ['gold'],
    desc: '42% chance to knock 35 gold loose. Campaign only — there is nothing to collect in a sandbox fight.',
    onProc({ engine, attacker, victim }) {
      if (attacker.teamId !== 0) return;
      engine.bonusGold += 35;
      engine.announce(victim, '+35g', '#fbbf24', 0.8);
    },
  },
  {
    id: 'mirrorsplit',
    name: 'Mirrorsplit',
    rarity: 'legendary',
    glyph: '⧗',
    short: 'SPLIT',
    color: '#e879f9',
    desc: '42% chance to strike a second enemy anywhere in the arena for the full amount.',
    onProc({ engine, attacker, victim, amount }) {
      const others = engine.enemiesOf(attacker).filter((f) => f !== victim);
      if (!others.length) return;
      const foe = others[engine.rng.int(0, others.length - 1)];
      engine.damage(foe, amount, { sourceId: attacker.id, kind: 'weapon' });
      engine.beam(victim, foe, '#e879f9', 0.3);
    },
  },

  /* ======================================================== cursed */
  {
    id: 'gamblers',
    name: "Gambler's Mark",
    rarity: 'cursed',
    glyph: '⚄',
    short: 'JACKPOT',
    color: '#f43f5e',
    desc: '50% chance to hit for 300%. The other half of the time you hit for 55%. Over a long fight that is roughly break-even — it just is not steady.',
    damageMul: 3.0,
    onEquip(engine, ball) { ball.baseDamage *= 0.55; },
  },
  {
    id: 'bloodpact',
    name: 'Blood Pact',
    rarity: 'cursed',
    glyph: '☠',
    short: 'PACT',
    color: '#f43f5e',
    desc: '50% chance to hit for 200%, and every one of those costs you 9% of your maximum health.',
    damageMul: 2.0,
    onProc({ engine, attacker }) {
      engine.damage(attacker, attacker.maxHp * 0.09,
        { sourceId: attacker.id, kind: 'pact', ignoreArmor: true });
    },
  },
  {
    id: 'hexedcoin',
    name: 'Hexed Coin',
    rarity: 'cursed',
    glyph: '⊛',
    short: 'HEX',
    color: '#f43f5e',
    tags: ['gold'],
    desc: 'Double gold from every fight, and you deal 20% less damage for the rest of the run. Exactly the trade it sounds like.',
    goldMul: 2,
    onEquip(engine, ball) { ball.baseDamage *= 0.8; },
  },
  {
    id: 'overgrown',
    name: 'Overgrown',
    rarity: 'cursed',
    glyph: '❧',
    short: 'OVERGROWN',
    color: '#4f9d3a',
    desc: '50% chance to erupt vines across the whole arena. They do not care whose side you are on — you can stand in your own.',
    onProc({ engine, attacker }) {
      for (let i = 0; i < 5; i++) {
        engine.spawnHazard({
          x: engine.rng.range(engine.bounds.x0, engine.bounds.x1),
          y: engine.rng.range(engine.bounds.y0, engine.bounds.y1),
          radius: 58, life: 7, kind: 'vine',
          ownerId: attacker.id, teamId: attacker.teamId, affects: 'all',
          color: '#4f9d3a',
          status: 'chill',
          dps: attacker.baseDamage * 0.32,
        });
      }
      engine.sfx('vine');
      engine.announceCentre('OVERGROWN', '#4f9d3a');
    },
  },
]);

export function enchantment(id) {
  return id ? Enchantments.get(id) : null;
}
