/* The simulation.
 *
 * Deterministic, fixed-timestep, and completely headless — the engine never
 * touches the DOM or a canvas. Rendering reads engine state; it never writes
 * it. That separation is what lets the same match run identically under two
 * different visual themes, and what lets the balance harness run thousands of
 * matches with no browser painting at all.
 *
 * Timestep is fixed at SIM_HZ regardless of display refresh, so a 144Hz
 * monitor and a 60Hz monitor produce byte-identical fights. Frames render
 * interpolated between the last two simulation states.
 *
 * Weapon model: a weapon is a *segment*, not a point. It runs from a grip —
 * held against the orb's surface by default — outward along the swing angle.
 * The angle comes from a pendulum bob simulated at the weapon's tip, which is
 * what makes the swing lag and whip instead of looking pinned to a rotating
 * transform. Hit tests are segment-versus-circle, and two enemy weapon
 * segments overlapping is a parry rather than a hit.
 */

import { Rng } from './rng.js';
import { Particles } from './particles.js';
import { Statuses, baseModifiers } from '../content/statuses.js';
import { Fighters, effectiveness } from '../content/roster.js';
import { Powerups } from '../content/powerups.js';
import { Weapons } from '../content/weapons.js';
import { Perks, defaultLoadout, normalizeLoadout, buildMultiplier } from '../content/loadouts.js';
import { Chassis, Drives } from '../content/parts.js';
import { weaponAbility } from '../content/weapon-abilities.js';

export const SIM_HZ = 120;
const SIM_DT = 1 / SIM_HZ;
const MAX_STEPS_PER_FRAME = 6;   // spiral-of-death guard after a tab stall

/* A weapon 30 art-pixels wide is this many orb radii long in the world.
 * Geometry and rendering both derive from it, so the sprite you see is
 * exactly the segment that gets hit-tested. */
const WEAPON_LENGTH_PER_RADIUS = 2.15;
const WEAPON_REF_WIDTH = 30;

/*
 * Weapon size is a trade, not a ranking.
 *
 * Reach drives hit *rate* more than any other number — a longer blade sweeps a
 * bigger circle, so it simply meets more orbs. Left raw, that made the
 * shortest weapon in the roster strictly worse than the longest, and every
 * template carrying a dagger sat at the bottom of the win table regardless of
 * what its kit did.
 *
 * So the drawn length is compressed toward the mean, and the leftover
 * difference is paid back as damage and recovery: a long weapon hits harder
 * and recovers slower, a short one hits softer and recovers faster.
 */
const LENGTH_COMPRESSION = 0.5;   // 0 = all weapons identical, 1 = raw art size

function compressedRatio(raw) {
  return 0.9 + (raw - 0.9) * LENGTH_COMPRESSION;
}

/** Longer weapons hit harder. */
function weaponDamageScale(raw) {
  return 0.86 + raw * 0.24;
}

/** Longer weapons take longer to come back around. */
function weaponCooldownScale(raw) {
  return 0.74 + raw * 0.32;
}

let nextId = 1;

/* ------------------------------------------------------------- geometry */

/** Shortest distance from point C to segment AB. */
function segPointDist(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((cx - ax) * dx + (cy - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + dx * t, py = ay + dy * t;
  return Math.hypot(cx - px, cy - py);
}

/** Shortest distance between segments AB and CD. Zero when they cross. */
function segSegDist(ax, ay, bx, by, cx, cy, dx2, dy2) {
  const r1x = bx - ax, r1y = by - ay;
  const r2x = dx2 - cx, r2y = dy2 - cy;
  const denom = r1x * r2y - r1y * r2x;
  if (Math.abs(denom) > 1e-9) {
    const t = ((cx - ax) * r2y - (cy - ay) * r2x) / denom;
    const u = ((cx - ax) * r1y - (cy - ay) * r1x) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(
    segPointDist(ax, ay, bx, by, cx, cy),
    segPointDist(ax, ay, bx, by, dx2, dy2),
    segPointDist(cx, cy, dx2, dy2, ax, ay),
    segPointDist(cx, cy, dx2, dy2, bx, by)
  );
}

/* ============================================================== fighter */

export class Ball {
  constructor(engine, opts) {
    const { fighterId, teamId, x, y, hp, damage, radius, speed } = opts;
    const el = Fighters.require(fighterId);
    const loadout = normalizeLoadout(opts.loadout || defaultLoadout());

    this.id = nextId++;
    this.element = el;           // kept as `element` — every hook reads it
    this.elementId = fighterId;
    this.fighterId = fighterId;
    this.teamId = teamId;
    this.loadout = loadout;

    this.x = x; this.y = y;
    this.px = x; this.py = y;          // previous state, for render interpolation

    // Chassis and drive are pure modifier bundles folded in at construction.
    // Nothing reads them again after this, which is what keeps a combination
    // space of nineteen cores by twenty-three weapons by six by six free of
    // per-frame cost.
    const chassis = Chassis.get(loadout.chassisId) || Chassis.get('standard');
    const drive = Drives.get(loadout.driveId) || Drives.get('orbit');
    this.chassis = chassis;
    this.drive = drive;

    const a = engine.rng.next() * Math.PI * 2;
    this.targetSpeed = speed * el.speed * buildMultiplier(loadout, 'spd')
      * chassis.speedMul * drive.speedMul;
    this.vx = Math.cos(a) * this.targetSpeed;
    this.vy = Math.sin(a) * this.targetSpeed;

    this.baseRadius = radius * chassis.radiusMul;
    this.radius = this.baseRadius;
    this.baseMaxHp = hp * el.hp * buildMultiplier(loadout, 'hp') * chassis.hpMul;
    this.maxHp = this.baseMaxHp;
    this.hp = this.maxHp;
    this.baseDamage = damage * el.damage * buildMultiplier(loadout, 'dmg')
      * chassis.damageMul * drive.damageMul;
    this.startHp = opts.startHp;   // campaign carries damage between stages

    this.statuses = new Map();
    this.mods = baseModifiers();
    this.permMods = {};
    this.flags = {};

    this.ultCharge = 0;
    this.ultMax = 100;
    this.ultCount = 0;
    this.ultRate = chassis.ultRate;
    this.spinScale = chassis.spinMul * drive.spinMul;
    this.cooldownScale = drive.cooldownMul;
    this.chassisEvasion = chassis.evasion;
    this.chassisKnockbackResist = chassis.knockbackResist;
    this.chassisDmgTakenMul = chassis.dmgTakenMul;

    this.spinDir = engine.rng.chance(0.5) ? 1 : -1;
    // How far the grip sits beyond the orb's surface, in radii. Zero — the
    // default — means the weapon is held against the orb. Reach is something
    // a template or a powerup grants, never the baseline.
    this.tetherBonus = drive.tetherBonus;
    this.weaponId = loadout.weaponId && Weapons.has(loadout.weaponId)
      ? loadout.weaponId : el.weapon.id;

    this.weapons = [];
    this.addWeapon(engine, true);

    /* A campaign profile layers a run's accumulated upgrades on top of the
     * template. It is deliberately separate from `loadout`: a loadout is
     * something you author in the Forge and share in a URL, a profile is
     * something a run earns. Applied by Engine.applyProfile once the ball
     * exists, so an upgrade can read the finished stats. */
    this.profile = opts.profile || null;
    this.resists = null;       // { burn: 0.3, all: 0.1, ... }
    this.ccResist = 0;         // fraction shaved off control durations
    this.crit = null;          // { chance, mult }

    this.dead = false;
    this.deathTime = 0;
    this.damageDealt = 0;
    this.hitsLanded = 0;
    this.parries = 0;
    this.kills = 0;
    this.hitFlash = 0;
    this.parryFlash = 0;
    this.charge = 0;
    this.plating = 0;
  }

  /** @param {boolean} silent suppress the callout (used during setup) */
  addWeapon(engine, silent = false) {
    if (this.weapons.length >= 4) return;
    const def = Weapons.require(this.weaponId);
    // Extra arms are spaced evenly so a twin-armed orb sweeps a full circle.
    const share = (Math.PI * 2) / (this.weapons.length + 1);
    const angle = this.weapons.length * share;
    const w = {
      angle,
      bx: this.x + Math.cos(angle), by: this.y + Math.sin(angle),   // pendulum bob
      bvx: 0, bvy: 0,
      gripX: this.x, gripY: this.y,
      tipX: this.x, tipY: this.y,
      length: 1, half: 1,
      lastHit: new Map(),
      lastParry: -99,
      ability: weaponAbility(this.weaponId),
      rawRatio: def.w / WEAPON_REF_WIDTH,
      widthRatio: compressedRatio(def.w / WEAPON_REF_WIDTH),
      dmgScale: weaponDamageScale(def.w / WEAPON_REF_WIDTH),
      cdScale: weaponCooldownScale(def.w / WEAPON_REF_WIDTH),
      thickRatio: (def.h * def.hitRadius) / def.w,
      heavy: def.heavy,
    };
    this.weapons.push(w);
    // Re-space the existing arms so two weapons sit opposite, three at 120°.
    const n = this.weapons.length;
    this.weapons.forEach((weapon, i) => { weapon.angle = (i / n) * Math.PI * 2; });
    if (engine && !silent) engine.announce(this, 'TWIN ARMS', this.element.colors.light);
  }

  /**
   * Distance from orb centre to the weapon grip.
   *
   * The baseline sits slightly *inside* the shell rather than exactly on it,
   * so the grip is visually swallowed by the orb and the weapon reads as part
   * of the piece instead of a sprite floating alongside it.
   */
  gripDistance() {
    const tether = this.element.tether + (this.tetherBonus || 0);
    return this.radius * (0.82 + tether * this.mods.reachMul);
  }

  /** World-space length of the weapon blade itself. */
  weaponLength(w) {
    return this.radius * WEAPON_LENGTH_PER_RADIUS * w.widthRatio * this.mods.reachMul;
  }

  get hpRatio() { return Math.max(0, this.hp / this.maxHp); }
  get ultRatio() { return Math.min(1, this.ultCharge / this.ultMax); }
  get alive() { return !this.dead; }
}

/* =============================================================== engine */

export class Engine {
  constructor(config) {
    this.config = config;
    this.rng = new Rng(config.seed);
    this.cosmeticRng = this.rng.fork('cosmetic');

    this.arena = { w: config.arenaW || 560, h: config.arenaH || 560 };
    this.balls = [];
    this.projectiles = [];
    this.pickups = [];
    this.hazards = [];       // potion brews, poison pools
    this.turrets = [];       // deployed by weapons like the wrench
    this.effects = [];       // transient visuals: beams, pillars, rings
    this.texts = [];         // floating combat text
    this.fields = [];        // vortices and other timed force fields

    this.particles = new Particles(config.particleCap || 4000);
    this.particles.rng = this.cosmeticRng;

    this.time = 0;
    this.frame = 0;
    this.over = false;
    this.result = null;
    this.accumulator = 0;
    this.hitStop = 0;
    this.shakeAmount = 0;
    this.flashColor = null;
    this.flashAlpha = 0;
    this.weatherKind = null;
    this.weatherUntil = 0;
    this.speedScale = config.gameSpeed || 1;

    // A campaign stage that runs long ends in sudden death rather than on a
    // timer: the next clean hit wins, so a stalemate is still a gamble.
    this.suddenDeathAt = config.suddenDeathAt || 0;
    this.suddenDeath = false;

    this.listeners = new Map();
    this.mode = null;
    this.pickupTimer = config.powerupFirstDelay ?? 6;
    this.stats = { hits: 0, kills: 0, ults: 0, pickups: 0, bounces: 0, parries: 0 };
  }

  /* ---------------------------------------------------------- lifecycle */

  setMode(mode) {
    this.mode = mode;
    mode.init(this);
    // Perks and profiles are applied once every fighter exists, so either may
    // safely look at the rest of the board.
    for (const ball of this.balls) {
      this.applyProfile(ball);
      this.applyPerk(ball);
    }
    if (this.onReady) this.onReady(this);
    return this;
  }

  applyPerk(ball) {
    const ability = weaponAbility(ball.weaponId);
    if (ability && ability.onSpawn) ability.onSpawn(ball, this);

    const start = ball.chassis && ball.chassis.startStatus;
    if (start) this.applyStatus(ball, start.id, start.duration, { sourceId: ball.id });
    const perk = Perks.get(ball.loadout.perk);
    if (perk && perk.apply) perk.apply(this, ball);
  }

  /**
   * Fold a campaign profile into a freshly built ball.
   *
   * Multipliers are applied to the *base* values rather than the live ones so
   * the order upgrades were bought in cannot change the result — a run that
   * buys armour then health ends up identical to one that buys them the other
   * way round.
   */
  applyProfile(ball) {
    const p = ball.profile;
    if (!p) return;

    if (p.maxHpMul) { ball.baseMaxHp *= p.maxHpMul; ball.maxHp = ball.baseMaxHp; ball.hp = ball.maxHp; }
    if (p.damageMul) ball.baseDamage *= p.damageMul;
    if (p.speedMul) ball.targetSpeed *= p.speedMul;
    if (p.radiusMul) { ball.baseRadius *= p.radiusMul; ball.radius = ball.baseRadius; }
    if (p.reachBonus) ball.tetherBonus = (ball.tetherBonus || 0) + p.reachBonus;
    if (p.spinMul) ball.spinScale = (ball.spinScale || 1) * p.spinMul;
    if (p.ultRate) ball.ultRate = p.ultRate;
    if (p.resists) ball.resists = { ...p.resists };
    if (p.ccResist) ball.ccResist = p.ccResist;
    if (p.crit) ball.crit = { ...p.crit };
    if (p.flags) Object.assign(ball.flags, p.flags);

    for (let i = 1; i < (p.extraWeapons || 0) + 1; i++) ball.addWeapon(this, true);
    for (const id of p.perks || []) {
      const perk = Perks.get(id);
      if (perk && perk.apply) perk.apply(this, ball);
    }

    // A campaign orb carries its wounds between stages.
    if (Number.isFinite(ball.startHp)) {
      ball.hp = Math.max(1, Math.min(ball.maxHp, ball.startHp));
    }
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
    return this;
  }

  emit(event, payload) {
    const list = this.listeners.get(event);
    if (!list) return;
    for (let i = 0; i < list.length; i++) list[i](payload, this);
  }

  spawnBall(opts) {
    const b = new Ball(this, opts);
    this.balls.push(b);
    return b;
  }

  byId(id) {
    for (let i = 0; i < this.balls.length; i++) if (this.balls[i].id === id) return this.balls[i];
    return null;
  }

  statusDef(id) { return Statuses.get(id); }

  enemiesOf(ball) {
    const out = [];
    for (const b of this.balls) if (b.teamId !== ball.teamId && !b.dead) out.push(b);
    return out;
  }

  alliesOf(ball) {
    const out = [];
    for (const b of this.balls) if (b.teamId === ball.teamId && b !== ball && !b.dead) out.push(b);
    return out;
  }

  get livingBalls() {
    const out = [];
    for (const b of this.balls) if (!b.dead) out.push(b);
    return out;
  }

  dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  /* ------------------------------------------------------------ stepping */

  /**
   * Advance by real elapsed seconds. Runs zero or more fixed sim steps and
   * returns the interpolation alpha the renderer should use.
   */
  advance(elapsed) {
    if (this.over && this.effects.length === 0) {
      this.particles.update(elapsed);
      return 1;
    }
    this.accumulator += Math.min(elapsed, 0.25) * this.speedScale;
    let steps = 0;
    while (this.accumulator >= SIM_DT && steps < MAX_STEPS_PER_FRAME) {
      this.step(SIM_DT);
      this.accumulator -= SIM_DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accumulator = 0;   // drop the backlog
    return this.accumulator / SIM_DT;
  }

  step(dt) {
    // Hit-stop: a few frames of frozen time on a big hit. Cheap, and it is
    // most of why impacts feel like they land rather than merely overlap.
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      this.particles.update(dt * 0.25);
      this.decayScreenEffects(dt);
      return;
    }

    this.time += dt;
    this.frame++;

    this.recomputeModifiers(dt);
    this.tickStatuses(dt);
    this.integrateBalls(dt);
    this.resolveBallCollisions();
    this.updateWeapons(dt);
    this.resolveParries();
    this.resolveWeaponHits();
    this.updateProjectiles(dt);
    this.updateTurrets(dt);
    this.updateHazards(dt);
    this.updateFields(dt);
    this.updatePickups(dt);
    this.updateUlts(dt);
    this.updateFlags(dt);

    this.ambient(dt);
    this.particles.update(dt);
    this.decayScreenEffects(dt);
    this.decayTransients(dt);

    if (this.suddenDeathAt && !this.suddenDeath && this.time >= this.suddenDeathAt) {
      this.suddenDeath = true;
      this.flash('#ff2d1f', 0.45);
      this.shake(18);
      this.weather('suddendeath', 9999);
      this.sfx('suddendeath');
      this.emit('suddendeath', this);
    }

    if (this.mode) this.mode.update(this, dt);
    if (!this.over && this.mode) {
      const res = this.mode.checkEnd(this);
      if (res) this.finish(res);
    }
  }

  finish(result) {
    this.over = true;
    this.result = result;
    this.emit('end', result);
  }

  /* --------------------------------------------------------- modifiers */

  /** Rebuild every ball's derived stat bundle from scratch each step.
   *  Recomputing beats incremental bookkeeping here: it is O(balls × statuses)
   *  on a dozen balls, and it makes buff removal impossible to get wrong. */
  recomputeModifiers(dt) {
    for (const ball of this.balls) {
      if (ball.dead) continue;
      const m = ball.mods;
      m.speedMul = 1; m.spinMul = 1; m.dmgMul = 1; m.dmgTakenMul = 1;
      m.healMul = 1; m.sizeMul = 1; m.reachMul = 1; m.lifesteal = 0;
      m.burnMul = 1; m.freezeMul = 1; m.shockMul = 1;
      m.ccImmune = false; m.canUlt = true;
      m.evasion = 0; m.knockbackResist = 0; m.parryWins = !!ball.shieldBash;

      for (const [id, inst] of ball.statuses) {
        const def = Statuses.get(id);
        if (def && def.modify) def.modify(m, inst, ball);
      }

      if (ball.chassisDmgTakenMul) m.dmgTakenMul *= ball.chassisDmgTakenMul;
      if (ball.chassisEvasion) m.evasion = Math.max(m.evasion, ball.chassisEvasion);
      if (ball.chassisKnockbackResist) {
        m.knockbackResist = Math.max(m.knockbackResist, ball.chassisKnockbackResist);
      }

      // Loadout perks that behave like permanent passives.
      if (ball.flags.plated) { m.dmgTakenMul *= 0.75; m.speedMul *= 0.88; }
      if (ball.flags.berserk && ball.hp / ball.maxHp < 0.5) m.dmgMul *= 1.5;
      if (ball.flags.immovable) m.knockbackResist = 1;

      const passive = ball.element.passive;
      if (passive && passive.onTick) passive.onTick(this, ball, dt);

      ball.radius = ball.baseRadius * m.sizeMul;
    }
  }

  tickStatuses(dt) {
    for (const ball of this.balls) {
      if (ball.dead) continue;
      for (const [id, inst] of ball.statuses) {
        if (this.time >= inst.until) {
          ball.statuses.delete(id);
          const def = Statuses.get(id);
          if (def && def.onExpire) def.onExpire(this, ball, inst);
          continue;
        }
        const def = Statuses.get(id);
        if (def && def.onTick) def.onTick(this, ball, inst, dt);
      }
    }
  }

  /**
   * Apply a status. Honours CC immunity, and respects the definition's
   * stacking rule so callers never have to think about it.
   */
  applyStatus(ball, id, duration, { power = 0, stacks = 1, sourceId = 0 } = {}) {
    if (!ball || ball.dead) return null;
    const def = Statuses.get(id);
    if (!def) return null;
    if (def.cc && ball.mods.ccImmune) {
      this.announce(ball, 'IMMUNE', '#ffffff', 0.8);
      return null;
    }

    // Diminishing returns on hard crowd control. Without this, one lucky
    // freeze leads to another — a stunned fighter cannot swing, so it cannot
    // break the chain, and the match is decided by whoever landed CC first.
    if (ball.ccResist) duration *= Math.max(0.15, 1 - ball.ccResist);

    if (def.hardCC) {
      if (this.time < (ball.ccImmuneUntil || 0)) {
        this.announce(ball, 'RESIST', '#ffffff', 0.8);
        return null;
      }
      ball.ccImmuneUntil = this.time + duration + 2.5;
    }

    const existing = ball.statuses.get(id);
    if (existing) {
      if (def.stackMode === 'stack') {
        existing.stacks = Math.min(def.maxStacks, existing.stacks + stacks);
      } else if (def.stackMode === 'extend') {
        existing.until += duration;
      }
      existing.until = Math.max(existing.until, this.time + duration);
      if (power > existing.power) existing.power = power;
      return existing;
    }

    const inst = {
      id,
      until: this.time + duration,
      appliedAt: this.time,
      stacks: Math.min(def.maxStacks, stacks),
      power,
      sourceId,
    };
    ball.statuses.set(id, inst);
    if (def.onApply) def.onApply(this, ball, inst);
    return inst;
  }

  /* ---------------------------------------------------------- movement */

  integrateBalls(dt) {
    const { w, h } = this.arena;
    for (const ball of this.balls) {
      if (ball.dead) continue;
      ball.px = ball.x; ball.py = ball.y;

      // Speed governor. Left alone, elastic collisions slowly redistribute
      // energy and half the field ends up crawling. Nudging each ball back
      // toward its target speed keeps the fight lively forever without
      // making collisions feel fake.
      const want = ball.targetSpeed * ball.mods.speedMul;
      const sp = Math.hypot(ball.vx, ball.vy) || 0.0001;
      const corrected = sp + (want - sp) * Math.min(1, dt * 3.5);
      const k = corrected / sp;
      ball.vx *= k; ball.vy *= k;

      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      const r = ball.radius;
      let bounced = false;
      if (ball.x - r < 0)      { ball.x = r;     ball.vx = Math.abs(ball.vx); bounced = true; }
      else if (ball.x + r > w) { ball.x = w - r; ball.vx = -Math.abs(ball.vx); bounced = true; }
      if (ball.y - r < 0)      { ball.y = r;     ball.vy = Math.abs(ball.vy); bounced = true; }
      else if (ball.y + r > h) { ball.y = h - r; ball.vy = -Math.abs(ball.vy); bounced = true; }

      if (bounced) {
        this.stats.bounces++;
        // A little randomness on each bounce keeps balls from settling into
        // a boring periodic orbit, which a perfectly elastic box will do.
        const jitter = this.rng.range(-0.12, 0.12);
        const c = Math.cos(jitter), s = Math.sin(jitter);
        const vx = ball.vx, vy = ball.vy;
        ball.vx = vx * c - vy * s;
        ball.vy = vx * s + vy * c;
        this.particles.spray('dust', ball.x, ball.y, ball.vx, ball.vy, 3, 90, 0.9,
          ball.element.colors.trail);
        const passive = ball.element.passive;
        if (passive && passive.onBounce) passive.onBounce(this, ball);
        this.sfx('bounce', { coreId: ball.fighterId, size: ball.radius / 40 });
        this.emit('bounce', ball);
        if (this.mode && this.mode.onBounce) this.mode.onBounce(this, ball);
      }

      if (ball.hitFlash > 0) ball.hitFlash -= dt * 4;
      if (ball.parryFlash > 0) ball.parryFlash -= dt * 3;
    }
  }

  /** Equal-mass elastic response, plus positional correction so balls
   *  never tunnel into each other at high speed. */
  resolveBallCollisions() {
    const balls = this.balls;
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.dead) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.dead) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rsum = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rsum * rsum || d2 === 0) continue;

        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        const overlap = rsum - d;

        // Mass proxies off radius so a Colossal ball shoves a Swift one.
        const ma = a.radius * a.radius, mb = b.radius * b.radius;
        const total = ma + mb;
        a.x -= nx * overlap * (mb / total);
        a.y -= ny * overlap * (mb / total);
        b.x += nx * overlap * (ma / total);
        b.y += ny * overlap * (ma / total);

        const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
        const sep = rvx * nx + rvy * ny;
        if (sep > 0) continue;   // already separating
        const imp = (2 * sep) / total;
        a.vx += imp * mb * nx; a.vy += imp * mb * ny;
        b.vx -= imp * ma * nx; b.vy -= imp * ma * ny;

        this.particles.burst('dust', a.x + nx * a.radius, a.y + ny * a.radius, 4, 110);
        if (this.mode && this.mode.onBallContact) this.mode.onBallContact(this, a, b);
      }
    }
  }

  /* ----------------------------------------------------------- weapons */

  /**
   * Swing every weapon.
   *
   * The tip is a free point mass held at a fixed distance from its orb by a
   * hard constraint, driven tangentially so it orbits, and coupled to the
   * orb's own motion so it trails when the orb changes direction. That
   * coupling is the whole trick — a weapon pinned to a rotating transform
   * looks like clip art; one that lags and whips looks alive.
   */
  updateWeapons(dt) {
    for (const ball of this.balls) {
      if (ball.dead) continue;
      const grip = ball.gripDistance();
      const drive = 2400 * ball.element.spin * (ball.spinScale || 1) * ball.mods.spinMul * ball.spinDir
        * (1 + (ball.spinBoost || 0) * 0.2);
      if (ball.spinBoost) ball.spinBoost = Math.max(0, ball.spinBoost - dt * 2);

      for (const w of ball.weapons) {
        const len = ball.weaponLength(w);
        const reach = grip + len;          // the bob rides at the weapon tip

        let dx = w.bx - ball.x, dy = w.by - ball.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.001) { dx = Math.cos(w.angle) * reach; dy = Math.sin(w.angle) * reach; d = reach; }
        const nx = dx / d, ny = dy / d;

        // Tangential drive + coupling to the orb's velocity.
        w.bvx += -ny * drive * dt + (ball.vx - w.bvx) * 2.2 * dt;
        w.bvy += nx * drive * dt + (ball.vy - w.bvy) * 2.2 * dt;

        // Cap tangential speed so stacked haste cannot spin the weapon fast
        // enough to sweep past a target between two simulation steps.
        const maxTan = reach * 26;
        const sp = Math.hypot(w.bvx, w.bvy);
        if (sp > maxTan) { w.bvx *= maxTan / sp; w.bvy *= maxTan / sp; }

        w.bx += w.bvx * dt;
        w.by += w.bvy * dt;

        // Hard distance constraint, then strip radial velocity so the arm
        // never stretches or pumps energy into the system.
        dx = w.bx - ball.x; dy = w.by - ball.y;
        d = Math.hypot(dx, dy) || 0.001;
        const ux = dx / d, uy = dy / d;
        w.bx = ball.x + ux * reach;
        w.by = ball.y + uy * reach;
        const radial = w.bvx * ux + w.bvy * uy;
        w.bvx -= radial * ux;
        w.bvy -= radial * uy;

        w.angle = Math.atan2(uy, ux);
        w.length = len;
        w.half = Math.max(3, len * w.thickRatio);
        w.gripX = ball.x + ux * grip;
        w.gripY = ball.y + uy * grip;
        w.tipX = w.bx;
        w.tipY = w.by;
      }
    }
  }

  /**
   * Weapon versus weapon. Two enemy weapons crossing is a parry: neither
   * lands, both rebound, and each side's onParry fires. This is what stops
   * the fight from being a pure race of who swings into whom first.
   */
  resolveParries() {
    const balls = this.balls;
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.dead) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.dead || b.teamId === a.teamId) continue;

        for (const wa of a.weapons) {
          for (const wb of b.weapons) {
            if (this.time - wa.lastParry < 0.28 || this.time - wb.lastParry < 0.28) continue;
            const gap = segSegDist(wa.gripX, wa.gripY, wa.tipX, wa.tipY,
                                   wb.gripX, wb.gripY, wb.tipX, wb.tipY);
            if (gap > wa.half + wb.half) continue;

            wa.lastParry = this.time;
            wb.lastParry = this.time;
            this.doParry(a, wa, b, wb);
          }
        }
      }
    }
  }

  doParry(a, wa, b, wb) {
    const cx = (wa.tipX + wb.tipX) / 2;
    const cy = (wa.tipY + wb.tipY) / 2;

    // Whoever "wins" the clash keeps their swing; the loser is knocked back
    // and briefly cannot land a hit. If neither wins, both rebound.
    const aWins = a.mods.parryWins && !b.mods.parryWins;
    const bWins = b.mods.parryWins && !a.mods.parryWins;

    const rebound = (ball, w, hard) => {
      w.bvx *= -0.75; w.bvy *= -0.75;
      ball.spinDir *= hard ? -1 : 1;
      // A clash briefly locks the weapon out, so a parry actually costs tempo.
      for (const [k] of w.lastHit) w.lastHit.set(k, this.time - 0.1);
      ball.parryFlash = 1;
      ball.parries++;
    };

    if (!aWins) rebound(a, wa, !bWins);
    if (!bWins) rebound(b, wb, !aWins);
    if (aWins) this.knockback(b, a, 260);
    if (bWins) this.knockback(a, b, 260);

    this.stats.parries++;
    this.particles.burst('spark', cx, cy, 16, 260, '#ffffff');
    this.particles.burst('spark', cx, cy, 8, 160, a.element.colors.light);
    this.effects.push({
      type: 'clash', x: cx, y: cy, age: 0, life: 0.42,
      color: a.element.colors.light,
      spin: this.cosmeticRng.range(0, Math.PI),
    });
    this.particles.burst('shard', cx, cy, 10, 300, b.element.colors.light);
    // A clash freezes time a touch longer than a hit — it is the single most
    // satisfying thing that happens without anyone losing health.
    this.hitStop = Math.max(this.hitStop, 0.055);
    this.shake(9);
    this.sfx('parry', { aWeaponId: a.weaponId, bWeaponId: b.weaponId });

    for (const [ball, w] of [[a, wa], [b, wb]]) {
      if (!ball.drive || !ball.drive.reversesOnParry) continue;
      ball.spinDir *= -1;
      this.applyStatus(ball, 'focus', 1.4, { sourceId: ball.id });
    }

    if (a.element.onParry) a.element.onParry(this, a, b);
    if (b.element.onParry) b.element.onParry(this, b, a);
    this.emit('parry', { a, b, x: cx, y: cy });
  }

  resolveWeaponHits() {
    for (const owner of this.balls) {
      if (owner.dead) continue;
      for (const w of owner.weapons) {
        // A weapon that just clashed is momentarily out of the fight.
        if (this.time - w.lastParry < 0.18) continue;
        for (const target of this.balls) {
          if (target.dead || target.teamId === owner.teamId) continue;
          const gap = segPointDist(w.gripX, w.gripY, w.tipX, w.tipY, target.x, target.y);
          if (gap > w.half + target.radius) continue;

          // One hit per target per swing. Without this a slow orbit would
          // grind a target down at the simulation rate, not the swing rate.
          const last = w.lastHit.get(target.id) || -99;
          const cooldown = (w.heavy ? 0.34 : 0.24) * w.cdScale * (owner.cooldownScale || 1);
          if (this.time - last < cooldown) continue;
          w.lastHit.set(target.id, this.time);

          this.landWeaponHit(owner, target, w);
        }
      }
    }
  }

  landWeaponHit(attacker, victim, w) {
    let amount = attacker.baseDamage * attacker.mods.dmgMul;
    amount *= effectiveness(attacker.element, victim.element);
    // Tempo is the sword's ability: it stacks up as you land hits and is
    // wiped the moment you take one.
    if (attacker.tempo) amount *= 1 + attacker.tempo * 0.06;
    if (w.ability && w.ability.bonus) amount *= w.ability.bonus({ engine: this, attacker, victim });
    const passive = attacker.element.passive;
    if (passive && passive.damageBonus) {
      amount *= passive.damageBonus(this, attacker, victim);
    }
    amount *= w.dmgScale;
    if (w.heavy) amount *= 1.12;

    let crit = false;
    if (attacker.crit && this.rng.chance(attacker.crit.chance)) {
      amount *= attacker.crit.mult;
      crit = true;
    }

    const dealt = this.damage(victim, amount, {
      sourceId: attacker.id,
      kind: 'weapon',
      knockback: w.heavy ? 200 : 90,
      fromX: w.tipX, fromY: w.tipY,
      pierce: w.ability ? (w.ability.pierce || 0) : 0,
    });
    if (dealt <= 0) return;   // evaded

    if (crit) {
      this.announce(victim, 'CRIT', '#ffd93d', 0.7);
      this.particles.burst('spark', victim.x, victim.y, 14, 260, '#ffd93d');
      this.shake(6);
    }

    attacker.hitsLanded++;
    this.stats.hits++;

    if (attacker.element.onHit) {
      attacker.element.onHit({ engine: this, attacker, victim, amount: dealt });
    }
    if (w.ability && w.ability.onHit) {
      w.ability.onHit({ engine: this, attacker, victim, amount: dealt, weapon: w });
    }
    if (passive && passive.onHitExtra) passive.onHitExtra(this, attacker, victim);

    // Powerup behaviours that key off landing a hit.
    if (attacker.flags.wildfire) {
      for (const foe of this.enemiesOf(attacker)) {
        if (foe !== victim && this.dist(foe, victim) < 200) {
          this.applyStatus(foe, 'burn', 4, { power: dealt * 0.18, stacks: 2, sourceId: attacker.id });
        }
      }
    }
    if (attacker.flags.deepFreeze && this.rng.chance(0.4)) {
      this.applyStatus(victim, 'freeze', 1.1, { sourceId: attacker.id });
    }

    attacker.ultCharge = Math.min(attacker.ultMax,
      attacker.ultCharge + (attacker.element.ult.chargePerHit || 8));
    victim.ultCharge = Math.min(victim.ultMax, victim.ultCharge + 3);

    this.hitStop = Math.min(0.05, 0.012 + dealt * 0.0009);
    this.shake(Math.min(9, 2 + dealt * 0.13));
    this.sfx('hit', {
      weaponId: attacker.weaponId,
      coreId: attacker.fighterId,
      power: Math.min(1, dealt / 26),
    });
    if (crit) this.sfx('crit');
    this.emit('hit', { attacker, victim, amount: dealt });
  }

  /* ------------------------------------------------------------ damage */

  /**
   * The single funnel for every point of damage in the game. Returns the
   * amount actually dealt — 0 means it was evaded or the target was already
   * out, which callers use to skip their on-hit effects.
   */
  damage(target, amount, opts = {}) {
    if (!target || target.dead || amount <= 0) return 0;
    const { sourceId = 0, kind = 'generic', ignoreArmor = false, silent = false } = opts;

    if (kind === 'weapon' && target.mods.evasion > 0 && this.rng.chance(target.mods.evasion)) {
      this.announce(target, 'MISS', '#cbd5e1', 0.7);
      return 0;
    }

    let dealt = amount;
    if (!ignoreArmor) {
      // A piercing weapon shrinks the target's reduction rather than skipping
      // it, so armour still matters — it just matters less.
      const armour = opts.pierce
        ? 1 - (1 - target.mods.dmgTakenMul) * (1 - opts.pierce)
        : target.mods.dmgTakenMul;
      dealt *= armour;
    }

    // Campaign resistances are keyed by damage kind, so a run can specialise
    // against the thing that keeps killing it rather than buying generic bulk.
    // The floor is what stops that specialisation becoming immunity: stacked
    // with a run's health upgrades, anything deeper than this made late builds
    // unkillable and the score stopped meaning anything.
    if (target.resists) {
      const r = (target.resists[kind] || 0) + (target.resists.all || 0);
      if (r) dealt *= Math.max(0.4, 1 - r);
    }
    dealt = Math.max(0, dealt);

    if (kind === 'weapon') target.tempo = 0;

    target.hp -= dealt;
    target.hitFlash = 1;

    // Sudden death: past the campaign's clock, the next clean hit ends it.
    if (this.suddenDeath && target.hp > 0
        && (kind === 'weapon' || kind === 'projectile' || kind === 'ult')) {
      target.hp = 0;
      this.announce(target, 'SUDDEN DEATH', '#ff2d1f', 2);
      this.flash('#ff2d1f', 0.5);
      this.shake(26);
    }

    if (opts.knockback) {
      const src = this.byId(sourceId);
      const fx = opts.fromX ?? (src ? src.x : target.x);
      const fy = opts.fromY ?? (src ? src.y : target.y);
      this.knockback(target, { x: fx, y: fy }, opts.knockback);
    }

    const attacker = sourceId ? this.byId(sourceId) : null;
    if (attacker && attacker !== target) {
      attacker.damageDealt += dealt;
      if (attacker.mods.lifesteal > 0 && kind !== 'thorns') {
        this.heal(attacker, dealt * attacker.mods.lifesteal);
      }
      if (kind === 'weapon' || kind === 'ult') {
        attacker.ultCharge = Math.min(attacker.ultMax, attacker.ultCharge + dealt * 0.05);
      }
    }

    for (const [id] of target.statuses) {
      const def = Statuses.get(id);
      if (def && def.onHitTaken) def.onHitTaken(this, target, { amount: dealt, kind, sourceId });
    }
    const vp = target.element.passive;
    if (vp && vp.onDamaged) vp.onDamaged(this, target);

    if (!silent && dealt >= 0.6) {
      this.floatText(target.x, target.y - target.radius - 6, Math.round(dealt),
        kind === 'true' ? '#f0a8ff' : kind === 'ult' ? '#ffffff' : target.element.colors.dark);
    }

    if (target.hp <= 0) this.kill(target, attacker);
    return dealt;
  }

  heal(ball, amount) {
    if (!ball || ball.dead || amount <= 0) return;
    if (this.noHealing) return;   // the Sudden Death stage modifier
    if (ball.curseUntil && this.time < ball.curseUntil) amount *= 0.4;
    const healed = Math.min(amount * ball.mods.healMul, ball.maxHp - ball.hp);
    if (healed <= 0) return;
    ball.hp += healed;
    if (healed > 1.5) {
      this.particles.emit('mote', ball.x, ball.y, ball.radius, 2, '#4ade80');
    }
  }

  kill(ball, killer) {
    if (ball.dead) return;
    ball.dead = true;
    ball.hp = 0;
    ball.deathTime = this.time;
    if (killer && killer !== ball) killer.kills++;
    this.stats.kills++;

    this.particles.burst(ball.element.particle || 'dust', ball.x, ball.y, 70, 420,
      ball.element.colors.core);
    this.particles.burst('dust', ball.x, ball.y, 40, 260, ball.element.colors.light);
    this.effects.push({ type: 'ring', x: ball.x, y: ball.y, r: ball.radius,
      maxR: ball.radius * 7, age: 0, life: 0.6, color: ball.element.colors.core });
    this.shake(20);
    this.flash(ball.element.colors.core, 0.25);
    this.sfx('death');
    this.emit('kill', { ball, killer });
  }

  knockback(target, from, force) {
    if (!target || target.dead) return;
    const dx = target.x - from.x, dy = target.y - from.y;
    const d = Math.hypot(dx, dy) || 1;
    const scale = force * (1 - (target.mods.knockbackResist || 0));
    target.vx += (dx / d) * scale;
    target.vy += (dy / d) * scale;
  }

  /* ------------------------------------------------------------- ults */

  updateUlts(dt) {
    for (const ball of this.balls) {
      if (ball.dead) continue;
      ball.ultCharge = Math.min(ball.ultMax,
        ball.ultCharge + (ball.element.ult.chargePerSecond || 2) * (ball.ultRate || 1) * dt);
      if (ball.ultCharge >= ball.ultMax && ball.mods.canUlt) {
        ball.ultCharge = 0;
        ball.ultCount++;
        this.announce(ball, ball.element.ult.name.toUpperCase(), ball.element.colors.core, 1.8);
        ball.element.ult.cast(this, ball);
        this.stats.ults++;
        this.emit('ult', ball);
      }
    }
  }

  /* ------------------------------------------- arsenal-pack behaviours */

  /** A thrown blade that homes loosely on its mark. */
  throwKnife(owner, target, damage) {
    const dx = target.x - owner.x, dy = target.y - owner.y;
    const d = Math.hypot(dx, dy) || 1;
    this.spawnProjectile({
      x: owner.x, y: owner.y,
      vx: (dx / d) * 560, vy: (dy / d) * 560,
      ownerId: owner.id, teamId: owner.teamId,
      damage, radius: 5, life: 3, style: 'shard',
      color: owner.element.colors.light,
      statusId: 'bleed', statusPower: damage * 0.2,
      homing: owner.flags.rapidKnives ? 180 : 90, seekId: target.id,
      pierce: owner.flags.rapidKnives ? 1 : 0,
    });
    this.sfx('throw');
  }

  /** A flask arcing toward a target, shattering into a pool where it lands. */
  throwFlask(owner, target) {
    const dx = target.x - owner.x, dy = target.y - owner.y;
    const d = Math.hypot(dx, dy) || 1;
    this.spawnProjectile({
      x: owner.x, y: owner.y,
      vx: (dx / d) * 340, vy: (dy / d) * 340,
      ownerId: owner.id, teamId: owner.teamId,
      damage: owner.baseDamage * 0.3,
      radius: 8, life: 2.2, style: 'flask',
      color: owner.element.colors.accent,
      shatter: true,
    });
  }

  /** Drop a flask straight onto the floor where the orb currently is. */
  dropFlask(owner) {
    const n = owner.flags.clusterFlasks ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const jitter = n > 1 ? 46 : 0;
      this.spawnHazard({
        x: owner.x + this.rng.range(-jitter, jitter),
        y: owner.y + this.rng.range(-jitter, jitter),
        radius: 48, life: 5, kind: 'poison',
        ownerId: owner.id, teamId: owner.teamId, affects: 'enemies',
        color: owner.element.colors.accent,
        dps: owner.baseDamage * 0.3,
      });
    }
    this.particles.burst('toxin', owner.x, owner.y, 14, 140, owner.element.colors.accent);
    this.sfx('shatter');
  }

  /**
   * Drop a brew. It buffs whoever rolls over it — which by default includes
   * the enemy, and is the Alchemist's whole risk/reward.
   */
  dropPotion(owner, fromUlt = false) {
    const pad = 40;
    const jitter = fromUlt ? 210 : 150;
    this.spawnHazard({
      x: Math.max(pad, Math.min(this.arena.w - pad, owner.x + this.rng.range(-jitter, jitter))),
      y: Math.max(pad, Math.min(this.arena.h - pad, owner.y + this.rng.range(-jitter, jitter))),
      radius: 34, life: 14, kind: 'potion',
      ownerId: owner.id, teamId: owner.teamId,
      affects: owner.flags.selfishBrews ? 'allies' : 'all',
      color: owner.element.colors.light,
      once: true,
      armAt: this.time + 1.1,
      heal: owner.maxHp * 0.07,
    });
  }

  /* ---------------------------------------------------------- turrets */

  /**
   * A deployed turret: a small stationary emplacement that shoots at whoever
   * is nearest. Weapons that build things are the most legible specials in
   * the game — you can see the thing on the board — so they get a real
   * entity rather than a hidden stat.
   */
  spawnTurret({ x, y, ownerId, teamId, damage, life = 12, interval = 1.1, color }) {
    if (this.turrets.length > 24) this.turrets.shift();
    this.turrets.push({
      x, y, ownerId, teamId, damage, life, age: 0,
      interval, cooldown: interval * 0.4,
      angle: 0, radius: 13, color: color || '#f0a020',
    });
    this.particles.burst('shard', x, y, 16, 180, color || '#f0a020');
    this.sfx('deploy');
  }

  updateTurrets(dt) {
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const t = this.turrets[i];
      t.age += dt;
      if (t.age >= t.life) {
        this.particles.burst('shard', t.x, t.y, 12, 150, t.color);
        this.turrets.splice(i, 1);
        continue;
      }

      const foes = this.balls.filter((b) => !b.dead && b.teamId !== t.teamId);
      if (!foes.length) continue;
      let best = foes[0], bd = Math.hypot(best.x - t.x, best.y - t.y);
      for (const f of foes) {
        const d = Math.hypot(f.x - t.x, f.y - t.y);
        if (d < bd) { bd = d; best = f; }
      }
      t.angle = Math.atan2(best.y - t.y, best.x - t.x);

      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      t.cooldown = t.interval;
      this.spawnProjectile({
        x: t.x, y: t.y,
        vx: Math.cos(t.angle) * 520, vy: Math.sin(t.angle) * 520,
        ownerId: t.ownerId, teamId: t.teamId,
        damage: t.damage, radius: 5, life: 2.5, style: 'shard',
        color: t.color, homing: 120, seekId: best.id,
      });
      this.sfx('turret');
    }
  }

  /* ---------------------------------------------------------- hazards */

  spawnHazard(h) {
    this.hazards.push({
      x: h.x, y: h.y, radius: h.radius, life: h.life, age: 0,
      kind: h.kind || 'poison',
      ownerId: h.ownerId, teamId: h.teamId,
      affects: h.affects || 'enemies',
      color: h.color || '#ffffff',
      armAt: h.armAt || 0,
      dps: h.dps || 0,
      heal: h.heal || 0,
      once: !!h.once,
      touched: null,
      dead: false,
    });
  }

  hazardAffects(hz, ball) {
    if (hz.affects === 'all') return true;
    if (hz.affects === 'enemies') return ball.teamId !== hz.teamId;
    return ball.teamId === hz.teamId;
  }

  updateHazards(dt) {
    // Pools do not stack. Standing where three flasks happen to have landed
    // used to deal triple damage, which made a hazard template beat everything
    // by carpeting the floor rather than by fighting. Only the strongest pool
    // covering an orb applies.
    const worst = this._hazardDamage || (this._hazardDamage = new Map());
    worst.clear();

    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const hz = this.hazards[i];
      hz.age += dt;
      if (hz.age >= hz.life || hz.dead) { this.hazards.splice(i, 1); continue; }

      if (this.cosmeticRng.chance(dt * 18)) {
        this.particles.emit(hz.kind === 'potion' ? 'mote' : 'toxin',
          hz.x, hz.y, hz.radius * 0.85, 1, hz.color);
      }

      for (const ball of this.balls) {
        if (ball.dead || !this.hazardAffects(hz, ball)) continue;
        const rr = hz.radius + ball.radius;
        const dx = ball.x - hz.x, dy = ball.y - hz.y;
        if (dx * dx + dy * dy > rr * rr) continue;

        if (hz.once) {
          // A brew needs a moment to settle before anyone can drink it, so
          // the brewer cannot simply stand on its own output.
          if (hz.armAt && this.time < hz.armAt) continue;
          this.grantBrew(hz, ball);
          hz.dead = true;
          break;
        }
        if (hz.dps) {
          const cur = worst.get(ball);
          if (!cur || hz.dps > cur.dps) worst.set(ball, { dps: hz.dps, ownerId: hz.ownerId });
          if (!hz.touched) hz.touched = new Set();
          if (!hz.touched.has(ball.id)) {
            hz.touched.add(ball.id);
            this.applyStatus(ball, 'poison', 4, { power: hz.dps * 0.35, sourceId: hz.ownerId });
          }
        }
      }
    }

    for (const [ball, hit] of worst) {
      this.damage(ball, hit.dps * dt, { sourceId: hit.ownerId, kind: 'hazard', silent: true });
    }
  }

  /**
   * A potion's payoff: heal plus one random short buff. The brewer's own side
   * gets more out of it — without that edge the Alchemist is just handing free
   * buffs to whoever rolls past, which is a losing proposition.
   */
  grantBrew(hz, ball) {
    const friendly = ball.teamId === hz.teamId;
    const scale = friendly ? 1.3 : 0.6;
    this.heal(ball, hz.heal * scale);
    const buff = this.rng.pick(['haste', 'shield', 'enrage', 'swift', 'regen']);
    this.applyStatus(ball, buff, friendly ? 6 : 4, { power: ball.maxHp * 0.015, sourceId: hz.ownerId });
    this.announce(ball, 'BREW', hz.color, 1.1);
    this.particles.burst('mote', hz.x, hz.y, 26, 200, hz.color);
    this.sfx('pickup');
  }

  /* ------------------------------------------------- flagged behaviours */

  /** Powerup-granted behaviours that need a heartbeat rather than a hook. */
  updateFlags(dt) {
    for (const ball of this.balls) {
      if (ball.dead) continue;

      if (ball.flags.tesla) {
        ball.teslaTimer = (ball.teslaTimer || 0) + dt;
        if (ball.teslaTimer > 0.7) {
          ball.teslaTimer = 0;
          const foes = this.enemiesOf(ball);
          if (foes.length) {
            let best = foes[0], bd = this.dist(ball, best);
            for (const f of foes) { const d = this.dist(ball, f); if (d < bd) { bd = d; best = f; } }
            this.damage(best, ball.baseDamage * 0.4 * best.mods.shockMul,
              { sourceId: ball.id, kind: 'chain' });
            this.beam(ball, best, '#fff59a', 0.18);
          }
        }
      }

      if (ball.flags.autoBolt) {
        ball.boltTimer = (ball.boltTimer || 0) + dt;
        if (ball.boltTimer > 1.1) {
          ball.boltTimer = 0;
          const foes = this.enemiesOf(ball);
          if (foes.length) {
            const t = this.rng.pick(foes);
            this.spawnProjectile({
              x: ball.x, y: ball.y, vx: 0, vy: 0,
              ownerId: ball.id, teamId: ball.teamId,
              damage: ball.baseDamage * 0.55, radius: 7, life: 5, style: 'orb',
              color: ball.element.colors.light, homing: 300, seekId: t.id,
            });
          }
        }
      }

      if (ball.flags.rapidKnives) {
        ball.rapidTimer = (ball.rapidTimer || 0) + dt;
        if (ball.rapidTimer > 0.45) {
          ball.rapidTimer = 0;
          const foes = this.enemiesOf(ball);
          if (foes.length) this.throwKnife(ball, this.rng.pick(foes), ball.baseDamage * 0.35);
        }
      }

      if (ball.flags.rapidArrows) {
        ball.rapidArrowTimer = (ball.rapidArrowTimer || 0) + dt;
        if (ball.rapidArrowTimer > 0.6) {
          ball.rapidArrowTimer = 0;
          for (const foe of this.enemiesOf(ball)) {
            const dx = foe.x - ball.x, dy = foe.y - ball.y;
            const d = Math.hypot(dx, dy) || 1;
            this.spawnProjectile({
              x: ball.x, y: ball.y,
              vx: (dx / d) * 660, vy: (dy / d) * 660,
              ownerId: ball.id, teamId: ball.teamId,
              damage: ball.baseDamage * 0.5, radius: 6, life: 3, style: 'arrow',
              color: ball.element.colors.accent, homing: 200, seekId: foe.id,
            });
          }
        }
      }

      if (ball.flags.wake || ball.flags.debrisTrail) {
        const style = ball.flags.wake ? 'droplet' : 'rubble';
        if (this.cosmeticRng.chance(dt * 26)) {
          this.particles.emit(style, ball.x, ball.y, ball.radius, 1, ball.element.colors.trail);
        }
        for (const foe of this.enemiesOf(ball)) {
          if (this.dist(ball, foe) < ball.radius + foe.radius + 14) {
            if (ball.flags.wake) this.applyStatus(foe, 'wet', 3, { sourceId: ball.id });
            else this.damage(foe, ball.baseDamage * 0.35 * dt * 10, { sourceId: ball.id, kind: 'trail', silent: true });
          }
        }
      }

      if (ball.flags.contagion) {
        for (const foe of this.enemiesOf(ball)) {
          const p = foe.statuses.get('poison');
          if (!p) continue;
          for (const other of this.enemiesOf(ball)) {
            if (other === foe) continue;
            if (this.dist(foe, other) < foe.radius + other.radius + 20) {
              this.applyStatus(other, 'poison', 5, { power: p.power, sourceId: ball.id });
            }
          }
        }
      }
    }
  }

  /* ------------------------------------------------------ projectiles */

  spawnProjectile(p) {
    this.projectiles.push({
      x: p.x, y: p.y, px: p.x, py: p.y,
      vx: p.vx, vy: p.vy,
      ownerId: p.ownerId, teamId: p.teamId,
      damage: p.damage, radius: p.radius || 5,
      life: p.life || 3, age: 0,
      style: p.style || 'orb', color: p.color || '#ffffff',
      homing: p.homing || 0, seekId: p.seekId || 0,
      statusId: p.statusId || null, statusPower: p.statusPower || 0,
      pierce: p.pierce || 0,
      shatter: !!p.shatter,
      angle: Math.atan2(p.vy, p.vx),
      dead: false,
    });
  }

  updateProjectiles(dt) {
    const { w, h } = this.arena;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt;
      if (p.age >= p.life || p.dead) {
        if (p.shatter && !p.dead) this.shatterFlask(p);
        this.projectiles.splice(i, 1);
        continue;
      }

      if (p.homing && p.seekId) {
        const t = this.byId(p.seekId);
        if (t && !t.dead) {
          const dx = t.x - p.x, dy = t.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          p.vx += (dx / d) * p.homing * dt;
          p.vy += (dy / d) * p.homing * dt;
          const sp = Math.hypot(p.vx, p.vy);
          const cap = Math.max(p.homing * 1.6, 420);
          if (sp > cap) { p.vx *= cap / sp; p.vy *= cap / sp; }
        }
      }

      p.px = p.x; p.py = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle = Math.atan2(p.vy, p.vx);

      if (p.x < 0 || p.x > w) { p.vx *= -1; p.x = Math.max(0, Math.min(w, p.x)); }
      if (p.y < 0 || p.y > h) { p.vy *= -1; p.y = Math.max(0, Math.min(h, p.y)); }

      for (const b of this.balls) {
        if (b.dead || b.teamId === p.teamId) continue;
        const rr = p.radius + b.radius;
        const dx = b.x - p.x, dy = b.y - p.y;
        if (dx * dx + dy * dy > rr * rr) continue;
        this.damage(b, p.damage, { sourceId: p.ownerId, kind: 'projectile', knockback: 60 });
        if (p.statusId) {
          this.applyStatus(b, p.statusId, 5, { power: p.statusPower, sourceId: p.ownerId });
        }
        this.particles.burst('spark', p.x, p.y, 6, 160, p.color);
        if (p.shatter) { this.shatterFlask(p); p.dead = true; }
        else if (p.pierce > 0) p.pierce--;
        else p.dead = true;
        break;
      }
    }
  }

  shatterFlask(p) {
    const owner = this.byId(p.ownerId);
    this.spawnHazard({
      x: p.x, y: p.y, radius: 52, life: 4.5, kind: 'poison',
      ownerId: p.ownerId, teamId: p.teamId, affects: 'enemies',
      color: p.color,
      dps: (owner ? owner.baseDamage : 6) * 0.2,
    });
    this.particles.burst('toxin', p.x, p.y, 22, 200, p.color);
    this.sfx('shatter');
  }

  /* ----------------------------------------------------------- fields */

  /** A timed radial force. Positive force pulls inward, negative pushes out. */
  vortex(x, y, radius, force, duration, sourceId) {
    this.fields.push({ type: 'vortex', x, y, radius, force, age: 0, life: duration, sourceId });
  }

  updateFields(dt) {
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i];
      f.age += dt;
      if (f.age >= f.life) { this.fields.splice(i, 1); continue; }
      const falloff = 1 - f.age / f.life;
      for (const b of this.balls) {
        if (b.dead) continue;
        const dx = f.x - b.x, dy = f.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d > f.radius) continue;
        const pull = f.force * falloff * (1 - d / f.radius) * dt;
        b.vx += (dx / d) * pull;
        b.vy += (dy / d) * pull;
      }
      if (this.cosmeticRng.chance(dt * 40)) {
        this.particles.emit('dust', f.x, f.y, f.radius * 0.8, 1);
      }
    }
  }

  /** Instant radial impulse with optional damage falloff. */
  shockwave(x, y, radius, force, { damage = 0, sourceId = 0, exclude = null } = {}) {
    const src = sourceId ? this.byId(sourceId) : null;
    for (const b of this.balls) {
      if (b.dead || b === exclude) continue;
      if (src && b.teamId === src.teamId) continue;
      const dx = b.x - x, dy = b.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > radius) continue;
      const falloff = 1 - d / radius;
      b.vx += (dx / d) * force * falloff;
      b.vy += (dy / d) * force * falloff;
      if (damage > 0) {
        this.damage(b, damage * falloff, { sourceId, kind: 'blast' });
      }
    }
    this.effects.push({ type: 'ring', x, y, r: 8, maxR: radius, age: 0, life: 0.45,
      color: src ? src.element.colors.light : '#ffffff' });
  }

  /* -------------------------------------------------- visual requests */

  beam(from, to, color, life) {
    this.effects.push({ type: 'beam', x1: from.x, y1: from.y, x2: to.x, y2: to.y,
      color, age: 0, life: life || 0.2 });
  }

  pillar(x, y, color) {
    this.effects.push({ type: 'pillar', x, y, color, age: 0, life: 0.45 });
  }

  floatText(x, y, text, color, life = 0.9) {
    if (this.texts.length > 60) this.texts.shift();
    this.texts.push({ x, y, text: String(text), color, age: 0, life,
      vy: -46, vx: this.cosmeticRng.range(-18, 18), big: false });
  }

  /** A named callout that rides above an orb — 'FROZEN', 'INFERNAL RAGE'. */
  announce(ball, text, color, life = 1.2) {
    this.texts.push({ x: ball.x, y: ball.y - ball.radius - 18, text, color,
      age: 0, life, vy: -26, vx: 0, big: true, followId: ball.id });
  }

  shake(amount) {
    this.shakeAmount = Math.min(30, Math.max(this.shakeAmount, amount));
  }

  flash(color, alpha) {
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, alpha);
  }

  weather(kind, duration) {
    this.weatherKind = kind;
    this.weatherUntil = this.time + duration;
  }

  sfx(name, opts) {
    this.emit('sfx', { name, opts });
  }

  decayScreenEffects(dt) {
    if (this.shakeAmount > 0) this.shakeAmount = Math.max(0, this.shakeAmount - dt * 55);
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.2);
    if (this.weatherKind && this.time > this.weatherUntil) this.weatherKind = null;
  }

  decayTransients(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.age += dt;
      if (e.age >= e.life) this.effects.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.age += dt;
      if (t.age >= t.life) { this.texts.splice(i, 1); continue; }
      if (t.followId) {
        const b = this.byId(t.followId);
        if (b) { t.x = b.x; t.y = b.y - b.radius - 18 - t.age * 26; continue; }
      }
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.vy += 40 * dt;
    }
  }

  /**
   * Idle flavour — embers off Fire, frost off Ice, sparks off a fast weapon.
   * Drawn from the cosmetic RNG so turning particles off cannot desync a
   * match, and rate-limited by speed so a still arena stays calm.
   */
  ambient(dt) {
    for (const ball of this.balls) {
      if (ball.dead) continue;
      const style = ball.element.particle;
      if (!style) continue;
      const speed = Math.hypot(ball.vx, ball.vy);
      const rate = 5 + (speed / ball.targetSpeed) * 6;
      if (this.cosmeticRng.chance(dt * rate)) {
        this.particles.emit(style, ball.x, ball.y, ball.radius * 0.9, 1,
          ball.element.colors.trail);
      }
      for (const w of ball.weapons) {
        const wsp = Math.hypot(w.bvx, w.bvy);
        if (wsp > 320 && this.cosmeticRng.chance(dt * 14)) {
          this.particles.spawn(style, w.tipX, w.tipY,
            this.cosmeticRng.range(-30, 30), this.cosmeticRng.range(-30, 30),
            ball.element.colors.light);
        }
      }
    }
  }

  /* ---------------------------------------------------------- pickups */

  updatePickups(dt) {
    if (!this.config.powerupsEnabled) return;

    this.pickupTimer -= dt;
    if (this.pickupTimer <= 0 && this.pickups.length < (this.config.maxPickups || 4)) {
      this.pickupTimer = this.config.powerupInterval || 9;
      this.spawnPickup();
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.age += dt;
      p.bob = Math.sin(p.age * 3.2) * 4;
      for (const b of this.balls) {
        if (b.dead) continue;
        const rr = b.radius + p.radius;
        const dx = b.x - p.x, dy = b.y - p.y;
        if (dx * dx + dy * dy > rr * rr) continue;
        this.claimPickup(p, b);
        this.pickups.splice(i, 1);
        break;
      }
    }
  }

  spawnPickup() {
    const pool = Powerups.all.filter((p) => this.balls.length >= p.minFighters);
    const allowed = this.config.powerupIds;
    const usable = allowed && allowed.length
      ? pool.filter((p) => allowed.includes(p.id))
      : pool;
    if (!usable.length) return;

    const def = this.rng.weighted(usable, (p) => p.weight);
    const pad = 60;
    this.pickups.push({
      def,
      x: this.rng.range(pad, this.arena.w - pad),
      y: this.rng.range(pad, this.arena.h - pad),
      radius: 17, age: 0, bob: 0,
    });
  }

  claimPickup(pickup, ball) {
    pickup.def.apply(this, ball);
    this.stats.pickups++;
    const label = pickup.def.labelFor ? pickup.def.labelFor(ball) : pickup.def.name;
    this.announce(ball, label.toUpperCase(), pickup.def.color, 1.5);
    this.particles.burst('mote', pickup.x, pickup.y, 26, 220, pickup.def.color);
    this.flash(pickup.def.color, 0.12);
    this.sfx('pickup');
    this.emit('pickup', { pickup, ball });
  }
}
