/* Stage modifiers.
 *
 * A modifier is a rule the whole arena plays under for one encounter. They
 * exist to stop a run settling into one answer: a build that beats everything
 * in open ground still has to survive a cramped room, and a build that leans
 * on regeneration has to survive a stage where nothing heals.
 *
 * `config(cfg)` returns a patch merged over the match config before the fight
 * starts. `onStart(engine)` runs once the board exists, for anything that has
 * to touch live fighters.
 *
 * To add one: put it in MODIFIERS. The encounter roller picks from the keys.
 */

export const MODIFIERS = {
  cramped: {
    name: 'Cramped',
    desc: 'A much smaller arena. Nothing gets to disengage.',
    config: (cfg) => ({ arenaW: Math.round(cfg.arenaW * 0.76), arenaH: Math.round(cfg.arenaH * 0.76) }),
  },
  cavernous: {
    name: 'Cavernous',
    desc: 'A wide arena. Reach and ranged damage decide this one.',
    config: (cfg) => ({ arenaW: Math.round(cfg.arenaW * 1.3), arenaH: Math.round(cfg.arenaH * 1.3) }),
  },
  frantic: {
    name: 'Frantic',
    desc: 'Everything moves 30% faster.',
    config: (cfg) => ({ ballSpeed: Math.round(cfg.ballSpeed * 1.3) }),
  },
  bountiful: {
    name: 'Bountiful',
    desc: 'Powerups drop constantly. Whoever reaches them first.',
    config: () => ({ powerupInterval: 4, maxPickups: 6 }),
  },
  barren: {
    name: 'Barren',
    desc: 'No powerups at all. Your build is all you have.',
    config: () => ({ powerupsEnabled: false }),
  },
  brittle: {
    name: 'Brittle',
    desc: 'Everyone hits harder and dies faster.',
    config: (cfg) => ({ baseDamage: cfg.baseDamage * 1.45 }),
  },
  sudden: {
    name: 'Sudden Death',
    desc: 'Nothing heals. Regeneration and lifesteal do nothing here.',
    onStart(engine) {
      for (const ball of engine.balls) ball.mods.healMul = 0;
      // heal() reads mods each step, so the flag has to be sticky.
      engine.noHealing = true;
    },
  },
  swarming: {
    name: 'Static Charge',
    desc: 'Every wall bounce shocks whoever is closest.',
    onStart(engine) {
      engine.on('bounce', (ball) => {
        const foes = engine.enemiesOf(ball);
        if (!foes.length) return;
        let best = foes[0], bd = engine.dist(ball, best);
        for (const f of foes) { const d = engine.dist(ball, f); if (d < bd) { bd = d; best = f; } }
        engine.damage(best, ball.baseDamage * 0.18, { sourceId: ball.id, kind: 'chain', silent: true });
        engine.beam(ball, best, '#fff59a', 0.14);
      });
    },
  },
};

export const MODIFIER_IDS = Object.keys(MODIFIERS);

export function rollModifier(rng) {
  return rng.pick(MODIFIER_IDS);
}
