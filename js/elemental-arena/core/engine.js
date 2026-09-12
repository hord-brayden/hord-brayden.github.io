/* The simulation.
 *
 * Deterministic, fixed-timestep, and completely headless — the engine never
 * touches the DOM or a canvas. Rendering reads engine state; it never writes
 * it. That separation is what lets the same match run identically under two
 * different visual themes, and what would let a match be replayed from a
 * seed on a server one day.
 *
 * Timestep is fixed at SIM_HZ regardless of display refresh, so a 144Hz
 * monitor and a 60Hz monitor produce byte-identical fights. Frames render
 * interpolated between the last two simulation states.
 */

import { Rng } from './rng.js';
import { Particles } from './particles.js';
import { Statuses, baseModifiers } from '../content/statuses.js';
import { Elements, effectiveness } from '../content/elements.js';
import { Powerups } from '../content/powerups.js';
import { Weapons } from '../content/weapons.js';

export const SIM_HZ = 120;
const SIM_DT = 1 / SIM_HZ;
const MAX_STEPS_PER_FRAME = 6;   // spiral-of-death guard after a tab stall

let nextId = 1;

/* ============================================================== fighter */

export class Ball {
  constructor(engine, { elementId, teamId, x, y, hp, damage, radius, speed }) {
    const el = Elements.require(elementId);
    this.id = nextId++;
    this.element = el;
    this.elementId = elementId;
    this.teamId = teamId;

    this.x = x; this.y = y;
    this.px = x; this.py = y;          // previous state, for render interpolation

    const a = engine.rng.next() * Math.PI * 2;
    this.targetSpeed = speed * el.speed;
    this.vx = Math.cos(a) * this.targetSpeed;
    this.vy = Math.sin(a) * this.targetSpeed;

    this.baseRadius = radius;
    this.radius = radius;
    this.baseMaxHp = hp * el.hp;
    this.maxHp = this.baseMaxHp;
    this.hp = this.maxHp;
    this.baseDamage = damage * el.damage;

    this.statuses = new Map();
    this.mods = baseModifiers();
    this.permMods = {};
    this.flags = {};

    this.ultCharge = 0;
    this.ultMax = 100;
    this.ultCount = 0;

    this.spinDir = engine.rng.chance(0.5) ? 1 : -1;
    // Chain length drives the encounter rate more than anything else: the
    // weapon sweeps a circle of this radius, so the area a fighter threatens
    // grows with its square. Three ball-radii is where two fighters meet
    // often enough to stay interesting without the arena turning into soup.
    this.chainLength = radius * 3.1 * el.reach;
    this.weapons = [];
    this.addWeapon(engine);

    this.dead = false;
    this.deathTime = 0;
    this.damageDealt = 0;
    this.hitsLanded = 0;
    this.kills = 0;
    this.hitFlash = 0;
    this.charge = 0;
    this.plating = 0;
  }

  addWeapon(engine) {
    if (this.weapons.length >= 4) return;
    // Extra arms are spaced evenly so a twin-armed ball sweeps a full circle.
    const share = (Math.PI * 2) / (this.weapons.length + 1);
    const def = Weapons.require(this.element.weapon.id);
    const w = {
      angle: this.weapons.length * share,
      hx: this.x, hy: this.y,
      hvx: 0, hvy: 0,
      lastHit: new Map(),
      hitScale: def.hitRadius,
      heavy: def.heavy,
    };
    const a = w.angle;
    w.hx = this.x + Math.cos(a) * this.chainLength;
    w.hy = this.y + Math.sin(a) * this.chainLength;
    this.weapons.push(w);
    if (engine) engine.announce(this, 'TWIN ARMS', this.element.colors.light);
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

    this.arena = { w: config.arenaW || 900, h: config.arenaH || 900 };
    this.balls = [];
    this.projectiles = [];
    this.pickups = [];
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

    this.listeners = new Map();
    this.mode = null;
    this.pickupTimer = config.powerupFirstDelay ?? 6;
    this.stats = { hits: 0, kills: 0, ults: 0, pickups: 0, bounces: 0 };
  }

  /* ---------------------------------------------------------- lifecycle */

  setMode(mode) {
    this.mode = mode;
    mode.init(this);
    return this;
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
    this.updateProjectiles(dt);
    this.updateFields(dt);
    this.updatePickups(dt);
    this.updateUlts(dt);
    this.updateFlags(dt);

    this.ambient(dt);
    this.particles.update(dt);
    this.decayScreenEffects(dt);
    this.decayTransients(dt);

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
      m.evasion = 0; m.knockbackResist = 0;

      for (const [id, inst] of ball.statuses) {
        const def = Statuses.get(id);
        if (def && def.modify) def.modify(m, inst, ball);
      }
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
    // After any hard stop, the victim gets a grace window during which no
    // further hard stop can land.
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
        this.emit('bounce', ball);
        if (this.mode && this.mode.onBounce) this.mode.onBounce(this, ball);
      }

      if (ball.hitFlash > 0) ball.hitFlash -= dt * 4;
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
   * The flail. Each weapon head is a free point mass held at a fixed distance
   * from its ball by a hard constraint, driven tangentially so it orbits, and
   * coupled to the ball's own motion so it trails convincingly when the ball
   * changes direction. That coupling is the whole trick — a weapon pinned to
   * a rotating transform looks like clip art; one that lags and whips looks
   * alive.
   */
  updateWeapons(dt) {
    for (const ball of this.balls) {
      if (ball.dead) continue;
      const reach = ball.chainLength * ball.mods.reachMul;
      const drive = 2600 * ball.element.spin * ball.mods.spinMul * ball.spinDir
        * (1 + (ball.spinBoost || 0) * 0.2);
      if (ball.spinBoost) ball.spinBoost = Math.max(0, ball.spinBoost - dt * 2);

      for (const w of ball.weapons) {
        let dx = w.hx - ball.x, dy = w.hy - ball.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.001) { dx = reach; dy = 0; d = reach; }
        const nx = dx / d, ny = dy / d;

        // Tangential drive + coupling to the ball's velocity.
        w.hvx += -ny * drive * dt + (ball.vx - w.hvx) * 2.2 * dt;
        w.hvy += nx * drive * dt + (ball.vy - w.hvy) * 2.2 * dt;

        // Cap tangential speed so a stacked haste buff cannot spin the
        // weapon fast enough to tunnel through targets between steps.
        const maxTan = reach * 26;
        const sp = Math.hypot(w.hvx, w.hvy);
        if (sp > maxTan) { w.hvx *= maxTan / sp; w.hvy *= maxTan / sp; }

        w.hx += w.hvx * dt;
        w.hy += w.hvy * dt;

        // Hard distance constraint, then strip the radial velocity so the
        // chain never stretches or pumps energy into the system.
        dx = w.hx - ball.x; dy = w.hy - ball.y;
        d = Math.hypot(dx, dy) || 0.001;
        const ux = dx / d, uy = dy / d;
        w.hx = ball.x + ux * reach;
        w.hy = ball.y + uy * reach;
        const radial = w.hvx * ux + w.hvy * uy;
        w.hvx -= radial * ux;
        w.hvy -= radial * uy;
        w.angle = Math.atan2(uy, ux);

        this.checkWeaponHits(ball, w, reach);
      }
    }
  }

  checkWeaponHits(owner, w, reach) {
    const hitR = reach * w.hitScale + 6;
    for (const target of this.balls) {
      if (target.dead || target.teamId === owner.teamId) continue;
      const dx = target.x - w.hx, dy = target.y - w.hy;
      const rr = hitR + target.radius;
      if (dx * dx + dy * dy > rr * rr) continue;

      // One hit per target per swing. Without this a slow orbit would grind
      // a target down at the simulation rate rather than the swing rate.
      const last = w.lastHit.get(target.id) || -99;
      const cooldown = w.heavy ? 0.34 : 0.24;
      if (this.time - last < cooldown) continue;
      w.lastHit.set(target.id, this.time);

      this.landWeaponHit(owner, target, w);
    }
  }

  landWeaponHit(attacker, victim, w) {
    let amount = attacker.baseDamage * attacker.mods.dmgMul;
    amount *= effectiveness(attacker.element, victim.element);
    const passive = attacker.element.passive;
    if (passive && passive.damageBonus) {
      amount *= passive.damageBonus(this, attacker, victim);
    }
    if (w.heavy) amount *= 1.15;

    const dealt = this.damage(victim, amount, {
      sourceId: attacker.id,
      kind: 'weapon',
      knockback: w.heavy ? 200 : 90,
      fromX: w.hx, fromY: w.hy,
    });
    if (dealt <= 0) return;   // evaded

    attacker.hitsLanded++;
    this.stats.hits++;

    if (attacker.element.onHit) {
      attacker.element.onHit({ engine: this, attacker, victim, amount: dealt });
    }
    if (passive && passive.onHitExtra) passive.onHitExtra(this, attacker, victim);

    // Element-specific powerup behaviours that key off landing a hit.
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
    if (!ignoreArmor) dealt *= target.mods.dmgTakenMul;
    dealt = Math.max(0, dealt);

    target.hp -= dealt;
    target.hitFlash = 1;

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

    for (const [id, inst] of target.statuses) {
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
        ball.ultCharge + (ball.element.ult.chargePerSecond || 2) * dt);
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

  /**
   * Idle element flavour — embers off Fire, frost off Ice, and a trail behind
   * anything moving fast. Drawn from the cosmetic RNG so turning particles off
   * cannot desync a match, and rate-limited by speed so a still arena stays
   * calm instead of fogging up.
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
      // A faint wake off the weapon head sells how fast it is actually moving.
      for (const w of ball.weapons) {
        const wsp = Math.hypot(w.hvx, w.hvy);
        if (wsp > 320 && this.cosmeticRng.chance(dt * 14)) {
          this.particles.spawn(style, w.hx, w.hy,
            this.cosmeticRng.range(-30, 30), this.cosmeticRng.range(-30, 30),
            ball.element.colors.light);
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
      dead: false,
    });
  }

  updateProjectiles(dt) {
    const { w, h } = this.arena;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.age += dt;
      if (p.age >= p.life || p.dead) { this.projectiles.splice(i, 1); continue; }

      if (p.homing && p.seekId) {
        const t = this.byId(p.seekId);
        if (t && !t.dead) {
          const dx = t.x - p.x, dy = t.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          p.vx += (dx / d) * p.homing * dt;
          p.vy += (dy / d) * p.homing * dt;
          const sp = Math.hypot(p.vx, p.vy);
          const cap = p.homing * 1.6;
          if (sp > cap) { p.vx *= cap / sp; p.vy *= cap / sp; }
        }
      }

      p.px = p.x; p.py = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

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
        if (p.pierce > 0) p.pierce--; else p.dead = true;
        break;
      }
    }
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

  /** A named callout that rides above a ball — 'FROZEN', 'INFERNAL RAGE'. */
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
