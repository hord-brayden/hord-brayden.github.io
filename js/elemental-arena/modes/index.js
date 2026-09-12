/* Game modes.
 *
 * A mode owns spawning, win conditions and whatever extra state it needs
 * (Territory's tile grid, Survival's wave clock). The engine calls into it
 * and knows nothing about which one is running.
 *
 * Mode interface — everything except id/name/init/checkEnd is optional:
 *   init(engine)                    spawn fighters, build mode state
 *   update(engine, dt)              per-step logic
 *   checkEnd(engine) -> result|null truthy result ends the match
 *   onBounce(engine, ball)          a ball hit a wall
 *   onBallContact(engine, a, b)     two balls touched
 *   hudLeft / hudRight (engine)     strings for the scoreboard strip
 *
 * To add a mode: define it here. The menu enumerates the registry.
 */

import { Registry } from '../core/registry.js';
import { Fighters } from '../content/roster.js';

export const Modes = new Registry('mode', {
  defaults: { supportsTeams: true, defaultFighters: 2, timeLimit: 0 },
  required: ['name', 'init', 'checkEnd'],
});

/* ------------------------------------------------------------ spawning */

/** Place fighters on a ring so nobody starts already overlapping. */
function ringSpawn(engine, count, index, inset = 0.32) {
  const { w, h } = engine.arena;
  const a = (index / count) * Math.PI * 2 - Math.PI / 2;
  return {
    x: w / 2 + Math.cos(a) * w * inset,
    y: h / 2 + Math.sin(a) * h * inset,
  };
}

/**
 * Turn the roster from the config into live fighters.
 * `roster` is [{ fighterId, teamId, count, loadout }].
 */
function spawnRoster(engine, roster) {
  const flat = [];
  roster.forEach((entry) => {
    for (let i = 0; i < (entry.count || 1); i++) {
      flat.push({ fighterId: entry.fighterId, teamId: entry.teamId, loadout: entry.loadout });
    }
  });

  const c = engine.config;
  flat.forEach((f, i) => {
    const pos = ringSpawn(engine, flat.length, i);
    engine.spawnBall({
      fighterId: f.fighterId,
      teamId: f.teamId,
      loadout: f.loadout,
      x: pos.x, y: pos.y,
      hp: c.baseHp,
      damage: c.baseDamage,
      radius: c.ballRadius,
      speed: c.ballSpeed,
    });
  });
}

/** Aggregate remaining health per team — the tiebreak when a clock expires. */
function teamHealth(engine) {
  const totals = new Map();
  for (const b of engine.balls) {
    if (b.dead) continue;
    totals.set(b.teamId, (totals.get(b.teamId) || 0) + b.hp);
  }
  return totals;
}

function livingTeams(engine) {
  const set = new Set();
  for (const b of engine.balls) if (!b.dead) set.add(b.teamId);
  return [...set];
}

/* ================================================================= DUEL */

Modes.define({
  id: 'duel',
  name: 'Duel',
  tagline: 'Last element standing.',
  desc: 'Fighters bounce, swing, and grind each other down. Ultimates fire on their own the moment a meter fills. The last team alive takes it.',
  defaultFighters: 2,

  init(engine) {
    spawnRoster(engine, engine.config.roster);
    this.clock = engine.config.timeLimit || 0;
  },

  update(engine, dt) {
    if (this.clock > 0) this.clock -= dt;
  },

  checkEnd(engine) {
    const teams = livingTeams(engine);
    if (teams.length <= 1) {
      return {
        reason: teams.length === 1 ? 'elimination' : 'mutual destruction',
        winnerTeam: teams.length === 1 ? teams[0] : null,
      };
    }
    if (engine.config.timeLimit && this.clock <= 0) {
      const totals = teamHealth(engine);
      let best = null, bestHp = -1;
      for (const [team, hp] of totals) if (hp > bestHp) { bestHp = hp; best = team; }
      return { reason: 'time — most health remaining', winnerTeam: best };
    }
    return null;
  },

  hudLeft(engine) {
    return `Hits: ${engine.stats.hits}`;
  },
  hudRight(engine) {
    return engine.config.timeLimit
      ? `Time: ${Math.max(0, this.clock).toFixed(0)}s`
      : `Bounces: ${engine.stats.bounces}`;
  },
});

/* ============================================================ TERRITORY */

Modes.define({
  id: 'territory',
  name: 'Territory',
  tagline: 'Paint the board. Most tiles wins.',
  desc: 'Every tile a fighter rolls over flips to their colour. Fighters still fight — a kill sidelines that colour while it respawns, and the board swings fast.',
  defaultFighters: 4,
  timeLimit: 90,

  init(engine) {
    spawnRoster(engine, engine.config.roster);

    const tile = engine.config.tileSize || 26;
    this.tile = tile;
    this.cols = Math.max(4, Math.ceil(engine.arena.w / tile));
    this.rows = Math.max(4, Math.ceil(engine.arena.h / tile));
    // 0 = unclaimed, otherwise team id + 1.
    this.grid = new Uint8Array(this.cols * this.rows);
    this.dirty = [];             // indices the renderer has yet to repaint
    this.counts = new Map();
    this.clock = engine.config.timeLimit || this.timeLimit;
    this.respawnQueue = [];
    this.version = 0;

    // Seed each team's home corner so the board starts readable rather than
    // as a blank sheet that takes ten seconds to mean anything.
    for (const ball of engine.balls) this.paintAt(engine, ball, ball.radius * 2.4);

    engine.on('kill', ({ ball }) => {
      if (!engine.config.territoryRespawn) return;
      this.respawnQueue.push({ ball, at: engine.time + 4 });
    });
  },

  paintAt(engine, ball, radius) {
    const team = ball.teamId + 1;
    const t = this.tile;
    const minC = Math.max(0, Math.floor((ball.x - radius) / t));
    const maxC = Math.min(this.cols - 1, Math.floor((ball.x + radius) / t));
    const minR = Math.max(0, Math.floor((ball.y - radius) / t));
    const maxR = Math.min(this.rows - 1, Math.floor((ball.y + radius) / t));
    const r2 = radius * radius;

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const cx = c * t + t / 2, cy = r * t + t / 2;
        const dx = cx - ball.x, dy = cy - ball.y;
        if (dx * dx + dy * dy > r2) continue;
        const i = r * this.cols + c;
        if (this.grid[i] === team) continue;
        this.grid[i] = team;
        this.dirty.push(i);
        this.version++;
        if (engine.cosmeticRng.chance(0.12)) {
          engine.particles.spawn('paint', cx, cy,
            engine.cosmeticRng.range(-40, 40), engine.cosmeticRng.range(-40, 40),
            ball.element.colors.light);
        }
      }
    }
  },

  update(engine, dt) {
    this.clock -= dt;
    for (const ball of engine.balls) {
      if (ball.dead) continue;
      this.paintAt(engine, ball, ball.radius);
      // The weapon paints too, which is what makes reach matter here.
      for (const w of ball.weapons) {
        this.paintAt(engine, { x: w.hx, y: w.hy, teamId: ball.teamId, element: ball.element },
          this.tile * 0.8);
      }
    }

    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      const entry = this.respawnQueue[i];
      if (engine.time < entry.at) continue;
      this.respawnQueue.splice(i, 1);
      const b = entry.ball;
      b.dead = false;
      b.hp = b.maxHp;
      b.statuses.clear();
      b.x = engine.rng.range(60, engine.arena.w - 60);
      b.y = engine.rng.range(60, engine.arena.h - 60);
      const a = engine.rng.next() * Math.PI * 2;
      b.vx = Math.cos(a) * b.targetSpeed;
      b.vy = Math.sin(a) * b.targetSpeed;
      engine.particles.burst(b.element.particle || 'mote', b.x, b.y, 40, 260, b.element.colors.core);
      engine.announce(b, 'RESPAWN', b.element.colors.light);
    }

    this.recount();
  },

  recount() {
    this.counts.clear();
    const g = this.grid;
    for (let i = 0; i < g.length; i++) {
      const v = g[i];
      if (!v) continue;
      this.counts.set(v - 1, (this.counts.get(v - 1) || 0) + 1);
    }
  },

  leader() {
    let best = null, bestN = -1;
    for (const [team, n] of this.counts) if (n > bestN) { bestN = n; best = team; }
    return { team: best, count: bestN, total: this.grid.length };
  },

  checkEnd(engine) {
    const { team, count, total } = this.leader();
    if (count === total && total > 0) {
      return { reason: 'total domination', winnerTeam: team };
    }
    if (this.clock <= 0) {
      const pct = total ? Math.round((count / total) * 100) : 0;
      return { reason: `time — ${pct}% of the board`, winnerTeam: team };
    }
    if (!engine.config.territoryRespawn) {
      const teams = livingTeams(engine);
      if (teams.length <= 1) {
        return { reason: 'elimination', winnerTeam: teams[0] ?? team };
      }
    }
    return null;
  },

  hudLeft() {
    const { count, total } = this.leader();
    return `Lead: ${total ? Math.round((count / total) * 100) : 0}%`;
  },
  hudRight() {
    return `Time: ${Math.max(0, this.clock).toFixed(0)}s`;
  },
});

/* ============================================================= SURVIVAL */

Modes.define({
  id: 'survival',
  name: 'Survival',
  tagline: 'Hold out against endless waves.',
  desc: 'Your roster fights as one team against waves that arrive faster and hit harder forever. There is no winning — only how long, and how many.',
  defaultFighters: 1,
  supportsTeams: false,

  init(engine) {
    // The whole configured roster fights as team 0 regardless of assignment.
    spawnRoster(engine, engine.config.roster.map((r) => ({ ...r, teamId: 0 })));
    this.wave = 0;
    this.nextWaveAt = 3;
    this.survived = 0;
    this.enemyPool = Fighters.ids.filter(
      (id) => !engine.config.roster.some((r) => r.fighterId === id)
    );
    if (!this.enemyPool.length) this.enemyPool = Fighters.ids.slice();
  },

  update(engine, dt) {
    this.survived = engine.time;
    if (engine.time < this.nextWaveAt) return;

    this.wave++;
    // Waves arrive faster and hit harder, with a floor so it stays playable
    // long enough to be worth watching.
    const gap = Math.max(5, 15 - this.wave * 0.8);
    this.nextWaveAt = engine.time + gap;

    const size = Math.min(5, 1 + Math.floor(this.wave / 2));
    const scale = 1 + this.wave * 0.16;
    const c = engine.config;

    for (let i = 0; i < size; i++) {
      const fighterId = engine.rng.pick(this.enemyPool);
      // Spawn at the edge, away from wherever the defenders currently are.
      const edge = engine.rng.int(0, 3);
      const { w, h } = engine.arena;
      const pad = c.ballRadius + 6;
      const pos = edge === 0 ? { x: engine.rng.range(pad, w - pad), y: pad }
        : edge === 1 ? { x: w - pad, y: engine.rng.range(pad, h - pad) }
        : edge === 2 ? { x: engine.rng.range(pad, w - pad), y: h - pad }
        : { x: pad, y: engine.rng.range(pad, h - pad) };

      const ball = engine.spawnBall({
        fighterId,
        teamId: 1,
        x: pos.x, y: pos.y,
        hp: c.baseHp * 0.65 * scale,
        damage: c.baseDamage * 0.7 * scale,
        radius: c.ballRadius * 0.88,
        speed: c.ballSpeed * 1.05,
      });
      engine.particles.burst(ball.element.particle || 'dust', ball.x, ball.y, 30, 220,
        ball.element.colors.core);
    }

    engine.flash('#ffffff', 0.18);
    engine.emit('wave', this.wave);

    // Sweep out corpses so the array does not grow without bound in a long run.
    if (engine.balls.length > 60) {
      engine.balls = engine.balls.filter((b) => !b.dead || engine.time - b.deathTime < 2);
    }
  },

  checkEnd(engine) {
    const defenders = engine.balls.some((b) => !b.dead && b.teamId === 0);
    if (defenders) return null;
    return {
      reason: `survived ${this.survived.toFixed(1)}s · wave ${this.wave}`,
      winnerTeam: 1,
      score: { time: this.survived, wave: this.wave, kills: engine.stats.kills },
    };
  },

  hudLeft() { return `Wave: ${this.wave}`; },
  hudRight() { return `Survived: ${this.survived.toFixed(1)}s`; },
});
