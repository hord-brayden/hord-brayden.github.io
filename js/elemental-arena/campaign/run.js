/* A campaign run.
 *
 * The loop is: choose an encounter, spend your gold in the workshop, watch the
 * battle resolve itself, bank the reward, repeat until your orb dies. Nothing
 * is driven during a battle — the player's entire agency is the build and the
 * path, which is the point.
 *
 * Two rules shape the difficulty:
 *  - Damage carries between stages. Health is a resource you spend, and
 *    repairs compete with upgrades for the same gold. That is the core
 *    tension of the economy.
 *  - Every encounter is meant to be slightly unfair. Enemy budget outgrows a
 *    "fair" fight on purpose, so surviving is about a build that answers what
 *    is actually in front of you, not about out-statting it.
 *
 * The run is deterministic from its seed: the same seed produces the same
 * encounters, the same shop hands and the same battles, which makes a score
 * meaningful and a run shareable.
 */

import { Rng, randomSeedPhrase } from '../core/rng.js';
import { Fighters } from '../content/roster.js';
import { emptyBuild, buildToProfile, rollOffers, upgradeCost, Upgrades } from './upgrades.js';
import { defaultLoadout, normalizeLoadout } from '../content/loadouts.js';
import { MODIFIERS, rollModifier } from './modifiers.js';
import { Chassis, Drives } from '../content/parts.js';
import { weaponStats, weaponLabel } from '../content/weapons.js';
import { weaponAbility } from '../content/weapon-abilities.js';
import { buildMultiplier } from '../content/loadouts.js';

/*
 * The campaign orb is almost always outnumbered, and action economy in this
 * simulation is brutal — two attackers land roughly twice the hits. A "fair"
 * stat line therefore loses every fight. These constants are what make one
 * orb a credible match for two or three, and they are the first dial to turn
 * if the curve feels wrong.
 */
const PLAYER_HP_BONUS = 2.6;
const PLAYER_DAMAGE_BONUS = 1.3;

const SAVE_KEY = 'elementalArena.campaign.v1';
const SCORE_KEY = 'elementalArena.scores.v1';

/** Encounter archetypes. Risk is priced in gold. */
export const ENCOUNTERS = [
  {
    id: 'skirmish', name: 'Skirmish', blurb: 'Two of them. Nothing clever.',
    enemies: 2, power: 0.86, gold: 1, risk: 'low',
  },
  {
    id: 'ambush', name: 'Ambush', blurb: 'Three at once, and they are quicker than you.',
    enemies: 3, power: 0.82, gold: 1.35, risk: 'medium',
  },
  {
    id: 'champion', name: 'Champion', blurb: 'One of them, built like a vault.',
    enemies: 1, power: 1.5, gold: 1.3, risk: 'medium',
  },
  {
    id: 'swarm', name: 'Swarm', blurb: 'Four. Individually flimsy. Collectively not.',
    enemies: 4, power: 0.66, gold: 1.6, risk: 'high',
  },
  {
    id: 'gauntlet', name: 'Gauntlet', blurb: 'Two heavies. No shortcuts here.',
    enemies: 2, power: 1.15, gold: 1.75, risk: 'high',
  },
];

export const RunState = {
  CHOOSING: 'choosing',   // picking the next encounter
  SHOP: 'shop',           // spending gold before the fight
  BATTLE: 'battle',       // watching it resolve
  DEAD: 'dead',           // run over
};

export class CampaignRun {
  constructor({ seed, fighterId, loadout } = {}) {
    this.seed = seed || randomSeedPhrase();
    this.rng = new Rng(`campaign:${this.seed}`);
    this.fighterId = fighterId || 'fire';
    // The starting assembly is chosen up front and persists for the whole run;
    // upgrades layer on top of it rather than replacing it.
    this.loadout = normalizeLoadout(loadout || defaultLoadout());

    this.stage = 0;
    this.gold = 55;
    this.score = 0;
    this.build = emptyBuild(this.fighterId);
    this.build.weaponId = this.loadout.weaponId;
    this.hp = null;            // null = full; set after the first battle
    this.state = RunState.CHOOSING;

    this.choices = [];
    this.encounter = null;
    this.offers = [];
    this.rerolls = 0;
    this.log = [];
    this.stats = { kills: 0, damage: 0, parries: 0, ults: 0, goldEarned: 0 };

    this.rollChoices();
  }

  /* ------------------------------------------------------------ pacing */

  /**
   * Difficulty curve.
   *
   * The linear term is the early ramp; the super-linear term is what stops a
   * run becoming immortal. Both matter: without the gentle start the first two
   * stages are a coin flip, and without the exponent a good build simply never
   * dies and the score stops meaning anything.
   */
  get threat() {
    return 0.72 + this.stage * 0.15 + Math.pow(this.stage, 1.5) * 0.021;
  }

  get isBoss() {
    return this.stage > 0 && this.stage % 5 === 0;
  }

  /* ---------------------------------------------------------- choosing */

  rollChoices() {
    this.state = RunState.CHOOSING;
    if (this.isBoss) {
      this.choices = [{
        ...ENCOUNTERS[2],
        id: 'boss', name: 'Warden', blurb: 'The stage boss. Bring an answer, not a hope.',
        enemies: 1, power: 2.1, gold: 2.6, risk: 'boss',
        modifier: rollModifier(this.rng),
        roster: this.rollEnemies(1, 2.1),
      }];
      return;
    }

    // The opening stage never offers the hardest encounters. A run that can
    // end on its first fight before the player has bought anything is a coin
    // flip, not a decision.
    const pool = this.stage === 0
      ? ENCOUNTERS.filter((e) => e.risk !== 'high')
      : ENCOUNTERS.slice();
    this.rng.shuffle(pool);
    this.choices = pool.slice(0, 3).map((e) => ({
      ...e,
      modifier: this.rng.chance(0.45) ? rollModifier(this.rng) : null,
      roster: this.rollEnemies(e.enemies, e.power),
    }));
  }

  /**
   * How many extra bodies an encounter gets for being late in the run.
   *
   * Every upgrade in the shop has a purchase cap, so a build is bounded — and
   * a bounded build beats any *single* scaled-up enemy eventually, however
   * large its numbers get. Action economy is the one pressure that keeps
   * growing, so the roster does too. This is what makes a run finite.
   */
  get extraEnemies() {
    return Math.min(4, Math.floor(this.stage / 6));
  }

  /** Pick the enemy templates for an encounter, with random variation. */
  rollEnemies(count, power) {
    const ids = Fighters.ids.filter((id) => id !== this.build.fighterId);
    const total = count + this.extraEnemies;
    const out = [];
    for (let i = 0; i < total; i++) {
      const id = this.rng.pick(ids);
      // Per-enemy jitter so two Skirmishes never feel identical.
      const variance = this.rng.range(0.85, 1.2);
      out.push({
        fighterId: id,
        power: power * variance,
        // Enemies get upgrades of their own as the run goes on.
        traits: this.rollEnemyTraits(),
      });
    }
    return out;
  }

  rollEnemyTraits() {
    const traits = [];
    const budget = Math.floor(this.stage / 3);
    const pool = ['tough', 'sharp', 'quick', 'reach', 'twin', 'crit', 'regen'];
    for (let i = 0; i < budget && i < 3; i++) {
      if (this.rng.chance(0.55)) traits.push(this.rng.pick(pool));
    }
    return traits;
  }

  choose(index) {
    const pick = this.choices[index];
    if (!pick) return;
    this.encounter = pick;
    this.openShop();
  }

  /* -------------------------------------------------------------- shop */

  openShop() {
    this.state = RunState.SHOP;
    this.rerolls = 0;
    this.offers = rollOffers(this.rng, this.build, this.stage, 3)
      .map((def) => ({ def, cost: upgradeCost(def, this.stage), bought: false }));
  }

  get rerollCost() {
    return 10 + this.rerolls * 8;
  }

  reroll() {
    if (this.gold < this.rerollCost) return false;
    this.gold -= this.rerollCost;
    this.rerolls++;
    this.offers = rollOffers(this.rng, this.build, this.stage, 3)
      .map((def) => ({ def, cost: upgradeCost(def, this.stage), bought: false }));
    return true;
  }

  buy(index) {
    const offer = this.offers[index];
    if (!offer || offer.bought || this.gold < offer.cost) return false;
    this.gold -= offer.cost;
    offer.bought = true;
    offer.def.apply(this.build);
    this.build.owned[offer.def.id] = (this.build.owned[offer.def.id] || 0) + 1;
    this.log.push(`Stage ${this.stage + 1}: bought ${offer.def.name}`);
    return true;
  }

  /** Repairs compete with upgrades for the same gold — that is the economy. */
  get repairCost() {
    const missing = this.missingHpFraction;
    if (missing <= 0.001) return 0;
    return Math.max(5, Math.round((18 + this.stage * 3) * missing / 5) * 5);
  }

  get missingHpFraction() {
    if (this.hp === null) return 0;
    const max = this.previewMaxHp();
    return Math.max(0, 1 - this.hp / max);
  }

  repair() {
    const cost = this.repairCost;
    if (cost <= 0 || this.gold < cost) return false;
    this.gold -= cost;
    this.hp = this.previewMaxHp();
    this.build.repairs++;
    return true;
  }

  /** What the orb's maximum health will be with the given build. */
  previewMaxHp(baseHp = 100, build = this.build) {
    const f = Fighters.get(build.fighterId);
    const chassisHp = (Chassis.get(this.loadout.chassisId) || { hpMul: 1 }).hpMul;
    const statHp = buildMultiplier(this.loadout, 'hp');
    return baseHp * (f ? f.hp : 1) * chassisHp * statHp
      * build.maxHpMul * PLAYER_HP_BONUS;
  }

  /** What one of its hits will be worth with the given build. */
  previewDamage(baseDamage = 7, build = this.build) {
    const f = Fighters.get(build.fighterId);
    const chassis = Chassis.get(this.loadout.chassisId) || { damageMul: 1 };
    const drive = Drives.get(this.loadout.driveId) || { damageMul: 1 };
    return baseDamage * (f ? f.damage : 1) * buildMultiplier(this.loadout, 'dmg')
      * chassis.damageMul * drive.damageMul * build.damageMul * PLAYER_DAMAGE_BONUS;
  }

  /**
   * Real numbers for one shop offer: what each figure is now, and what it
   * becomes if you buy it.
   *
   * Computed by cloning the build and actually applying the upgrade, rather
   * than by restating the description. That way it cannot drift out of sync
   * with what the upgrade does, and a card never has to say "+18% health"
   * without saying 18% of what.
   */
  previewUpgrade(def) {
    const clone = JSON.parse(JSON.stringify(this.build));
    try { def.apply(clone); } catch (e) { return []; }

    const rows = [];
    const pushNum = (label, before, after, unit = '') => {
      if (Math.abs(after - before) < 0.005) return;
      rows.push({
        label,
        before: Math.round(before * 10) / 10 + unit,
        after: Math.round(after * 10) / 10 + unit,
        up: after > before,
        pct: before ? Math.round(((after / before) - 1) * 100) : null,
      });
    };

    pushNum('Health', this.previewMaxHp(100, this.build), this.previewMaxHp(100, clone));
    pushNum('Damage / hit', this.previewDamage(7, this.build), this.previewDamage(7, clone));
    pushNum('Move speed', this.build.speedMul * 100, clone.speedMul * 100, '%');
    pushNum('Swing speed', this.build.spinMul * 100, clone.spinMul * 100, '%');
    pushNum('Orb size', this.build.radiusMul * 100, clone.radiusMul * 100, '%');
    pushNum('Ult charge', this.build.ultRate * 100, clone.ultRate * 100, '%');

    if (clone.reachBonus !== this.build.reachBonus) {
      rows.push({ label: 'Weapon reach', before: `${this.build.reachBonus.toFixed(2)}x`,
                  after: `${clone.reachBonus.toFixed(2)}x`, up: clone.reachBonus > this.build.reachBonus });
    }
    if (clone.extraWeapons !== this.build.extraWeapons) {
      rows.push({ label: 'Weapons held', before: `${this.build.extraWeapons + 1}`,
                  after: `${clone.extraWeapons + 1}`, up: true });
    }
    if (clone.ccResist !== this.build.ccResist) {
      rows.push({ label: 'Control resist', before: `${Math.round(this.build.ccResist * 100)}%`,
                  after: `${Math.round(clone.ccResist * 100)}%`, up: true });
    }
    const cb = this.build.crit, cc = clone.crit;
    if (JSON.stringify(cb) !== JSON.stringify(cc)) {
      rows.push({ label: 'Crit chance', before: cb ? `${Math.round(cb.chance * 100)}%` : '0%',
                  after: cc ? `${Math.round(cc.chance * 100)}%` : '0%', up: true });
      if (cb && cc && cb.mult !== cc.mult) {
        rows.push({ label: 'Crit damage', before: `${cb.mult.toFixed(1)}x`,
                    after: `${cc.mult.toFixed(1)}x`, up: cc.mult > cb.mult });
      }
    }
    for (const kind of new Set([...Object.keys(this.build.resists), ...Object.keys(clone.resists)])) {
      const b = this.build.resists[kind] || 0, a = clone.resists[kind] || 0;
      if (a === b) continue;
      const name = kind === 'all' ? 'All damage taken' : `${kind} damage taken`;
      rows.push({ label: name, before: `-${Math.round(b * 100)}%`, after: `-${Math.round(a * 100)}%`, up: true });
    }
    for (const perk of clone.perks) {
      if (!this.build.perks.includes(perk)) rows.push({ label: 'Gains', before: '—', after: perk, up: true });
    }
    if (clone.weaponId !== this.build.weaponId) {
      // A refit is the one upgrade whose whole value is in numbers the player
      // cannot see, so it gets the full comparison rather than two names.
      const f = Fighters.get(this.build.fighterId);
      const beforeId = this.build.weaponId || (f ? f.weapon.id : 'sword');
      const A = weaponStats(beforeId), B = weaponStats(clone.weaponId);
      rows.push({ label: 'Weapon', before: weaponLabel(beforeId),
                  after: weaponLabel(clone.weaponId), up: true, swap: true });
      const cmp = (label, a, b, fmt, higherIsBetter = true) => {
        if (Math.abs(a - b) < 0.005) return;
        rows.push({ label, before: fmt(a), after: fmt(b),
                    up: higherIsBetter ? b > a : b < a });
      };
      cmp('  reach', A.reachValue, B.reachValue, (v) => `${v.toFixed(2)}x`);
      cmp('  damage', A.damageValue, B.damageValue, (v) => `${Math.round(v * 100)}%`);
      cmp('  recovery', A.cooldownValue, B.cooldownValue, (v) => `${v.toFixed(2)}s`, false);
      const ab = weaponAbility(clone.weaponId);
      if (ab) rows.push({ label: '  special', before: '—', after: ab.name, up: true });
    }
    return rows;
  }

  /* ------------------------------------------------------------ battle */

  /**
   * Everything the app needs to launch the fight. The player is team 0; the
   * encounter's roster is team 1.
   */
  battleConfig(baseCfg) {
    const enc = this.encounter;
    const profile = buildToProfile(this.build);
    profile.maxHpMul *= PLAYER_HP_BONUS;
    profile.damageMul *= PLAYER_DAMAGE_BONUS;
    const roster = [{
      fighterId: this.build.fighterId,
      teamId: 0,
      count: 1,
      loadout: { ...this.loadout, weaponId: this.build.weaponId },
      profile,
      startHp: this.hp,
    }];

    const threat = this.threat;
    for (const e of enc.roster) {
      roster.push({
        fighterId: e.fighterId,
        teamId: 1,
        count: 1,
        loadout: { weaponId: null, perk: 'none', hp: 0, dmg: 0, spd: 0 },
        profile: enemyProfile(e, threat),
      });
    }

    const mod = enc.modifier ? MODIFIERS[enc.modifier] : null;
    const cfg = {
      ...baseCfg,
      modeId: 'duel',
      seed: `${this.seed}#${this.stage}`,
      roster,
      // No clock, and no sudden-death rule either. A stage that runs long
      // has its walls close in, which ends a stalemate by forcing the fight
      // rather than by declaring the next hit decisive.
      timeLimit: 300,
      shrinkStartAt: 42,
      shrinkRate: 8,
      powerupsEnabled: true,
      powerupInterval: 11,
      maxPickups: 3,
    };
    if (mod && mod.config) Object.assign(cfg, mod.config(cfg));
    return { cfg, modifier: mod };
  }

  /** Fold a finished battle into the run. Returns a summary for the UI. */
  resolve(engine) {
    const player = engine.balls.find((b) => b.teamId === 0);
    const enemiesLeft = engine.balls.some((b) => b.teamId !== 0 && !b.dead);
    // Surviving is not the same as clearing. A pure-turtle build could
    // otherwise coast to the time limit on health alone and advance forever,
    // which is how a run becomes immortal and the score stops meaning anything.
    const survived = !!player && !player.dead && !enemiesLeft;
    const timedOut = !!player && !player.dead && enemiesLeft;

    const enc = this.encounter;
    const dmg = player ? player.damageDealt : 0;
    const kills = player ? player.kills : 0;
    const parries = player ? player.parries : 0;

    // Reward is mostly for clearing; performance is a bonus, not the point.
    const clearGold = survived ? Math.round((35 + this.stage * 9) * enc.gold) : 0;
    const perfGold = Math.round(dmg * 0.12 + kills * 12 + parries * 1.5);
    const earned = survived ? clearGold + perfGold : 0;

    this.stats.damage += dmg;
    this.stats.kills += kills;
    this.stats.parries += parries;
    this.stats.ults += player ? player.ultCount : 0;

    if (survived) {
      this.gold += earned;
      this.stats.goldEarned += earned;
      this.hp = Math.max(1, player.hp);
      this.score += Math.round((100 + this.stage * 45) * enc.gold + dmg * 0.5 + kills * 25);
      this.stage++;
      this.log.push(`Stage ${this.stage}: cleared ${enc.name} (+${earned}g)`);
      this.encounter = null;
      this.rollChoices();
    } else {
      this.state = RunState.DEAD;
      this.log.push(timedOut
        ? `Ran out of time on stage ${this.stage + 1} against ${enc.name}`
        : `Fell on stage ${this.stage + 1} to ${enc.name}`);
      recordScore(this);
    }

    return { survived, timedOut, earned, clearGold, perfGold, dmg, kills, parries, stage: this.stage };
  }

  /* -------------------------------------------------------- persistence */

  toJSON() {
    return {
      seed: this.seed, stage: this.stage, gold: this.gold, score: this.score,
      build: this.build, loadout: this.loadout, hp: this.hp, state: this.state, stats: this.stats,
      log: this.log, rngState: this.rng.state,
      choices: this.choices, encounter: this.encounter,
      offers: this.offers.map((o) => ({ id: o.def.id, cost: o.cost, bought: o.bought })),
      rerolls: this.rerolls,
    };
  }

  static fromJSON(raw) {
    if (!raw || !raw.seed) return null;
    try {
      const run = new CampaignRun({
        seed: raw.seed, fighterId: raw.build?.fighterId, loadout: raw.loadout,
      });
      Object.assign(run, {
        stage: raw.stage ?? 0,
        gold: raw.gold ?? 55,
        score: raw.score ?? 0,
        build: raw.build || run.build,
        hp: raw.hp ?? null,
        state: raw.state || RunState.CHOOSING,
        stats: raw.stats || run.stats,
        log: raw.log || [],
        choices: raw.choices || [],
        encounter: raw.encounter || null,
        rerolls: raw.rerolls || 0,
      });
      run.rng.state = raw.rngState ?? run.rng.state;
      run.offers = (raw.offers || [])
        .map((o) => ({ def: Upgrades.get(o.id), cost: o.cost, bought: o.bought }))
        .filter((o) => o.def);
      if (!run.choices.length && run.state === RunState.CHOOSING) run.rollChoices();
      return run;
    } catch (e) {
      return null;
    }
  }
}

/** Enemy profiles are generated, so difficulty scales without hand-authoring. */
function enemyProfile(entry, threat) {
  const p = entry.power * threat;
  const profile = {
    // Health and damage scale on different curves on purpose. Player health
    // grows faster than player damage over a run, so enemy *damage* is the
    // side that has to keep pace, or late stages turn into unloseable slogs.
    maxHpMul: Math.pow(p, 0.88),
    damageMul: Math.pow(p, 0.84),
    speedMul: 1,
    radiusMul: entry.power > 1.5 ? 1.15 : 1,
    spinMul: 1,
    ultRate: 1,
    extraWeapons: 0,
    ccResist: 0,
    resists: {},
    perks: [],
    crit: null,
    flags: {},
  };
  for (const t of entry.traits || []) {
    if (t === 'tough') profile.maxHpMul *= 1.25;
    else if (t === 'sharp') profile.damageMul *= 1.2;
    else if (t === 'quick') { profile.speedMul *= 1.18; profile.spinMul *= 1.15; }
    else if (t === 'reach') profile.reachBonus = (profile.reachBonus || 0) + 0.8;
    else if (t === 'twin') profile.extraWeapons += 1;
    else if (t === 'crit') profile.crit = { chance: 0.18, mult: 1.7 };
    else if (t === 'regen') profile.perks.push('regen');
  }
  return profile;
}

/* ------------------------------------------------------------- scores */

export function loadScores() {
  try {
    const raw = localStorage.getItem(SCORE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

export function recordScore(run) {
  try {
    const list = loadScores();
    list.push({
      score: run.score,
      stage: run.stage,
      fighter: run.build.fighterId,
      seed: run.seed,
      kills: run.stats.kills,
      at: Date.now(),
    });
    list.sort((a, b) => b.score - a.score);
    localStorage.setItem(SCORE_KEY, JSON.stringify(list.slice(0, 25)));
  } catch (e) { /* storage blocked — a lost score is not worth an error */ }
}

export function clearScores() {
  try { localStorage.removeItem(SCORE_KEY); } catch (e) { /* ignore */ }
}

export function saveRun(run) {
  try {
    if (!run || run.state === RunState.DEAD) localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, JSON.stringify(run.toJSON()));
  } catch (e) { /* ignore */ }
}

export function loadRun() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? CampaignRun.fromJSON(JSON.parse(raw)) : null;
  } catch (e) {
    return null;
  }
}

export function clearRun() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}
