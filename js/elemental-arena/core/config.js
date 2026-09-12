/* Match configuration, persistence, and the shareable-URL codec.
 *
 * A match is fully described by this object. Combined with the seeded RNG
 * that means a config plus a seed is a complete, reproducible fight — which
 * is exactly what gets packed into the URL hash so a link replays the same
 * match on someone else's machine.
 *
 * The codec is deliberately terse (single-letter keys, templates as registry
 * indices, loadouts omitted entirely when they sit at defaults) so links stay
 * short enough to paste into a message.
 */

import { Fighters } from '../content/roster.js';
import { Modes } from '../modes/index.js';
import { Powerups } from '../content/powerups.js';
import { Perks, defaultLoadout, normalizeLoadout, BUILD_STATS } from '../content/loadouts.js';
import { Chassis, Drives } from '../content/parts.js';
import { Weapons } from '../content/weapons.js';
import { randomSeedPhrase } from './rng.js';

const STORE_KEY = 'elementalArena.settings.v2';

export function defaultConfig() {
  return {
    modeId: 'duel',
    seed: randomSeedPhrase(),
    themeId: 'pixel',

    roster: [
      { fighterId: 'fire', teamId: 0, count: 1, loadout: defaultLoadout() },
      { fighterId: 'ice', teamId: 1, count: 1, loadout: defaultLoadout() },
    ],

    // Arena size is tuned against orb size rather than chosen for its own
    // sake. A fighter threatens its radius plus the length of its weapon —
    // roughly 2.5 radii — and the arena has to stay small enough that two
    // threat circles overlap often, or the orbs never meet and the fight
    // stalls. Weapons are held against the orb now rather than swinging out
    // on a long chain, so this is tighter than it used to be.
    arenaW: 620,
    arenaH: 620,
    baseHp: 100,
    baseDamage: 7,
    ballRadius: 40,
    ballSpeed: 395,
    gameSpeed: 1,
    timeLimit: 0,

    powerupsEnabled: true,
    powerupInterval: 9,
    powerupFirstDelay: 6,
    maxPickups: 4,
    powerupIds: [],        // empty = every powerup is in the pool

    tileSize: 26,
    territoryRespawn: true,

    // Presentation only — never read by the simulation.
    sound: true,
    volume: 0.45,
    particles: true,
    screenShake: true,
    showStats: true,
  };
}

function normalizeRosterEntry(e) {
  return {
    fighterId: e.fighterId,
    teamId: Number.isInteger(e.teamId) ? Math.max(0, Math.min(7, e.teamId)) : 0,
    count: Math.max(1, Math.min(8, Number(e.count) || 1)),
    loadout: normalizeLoadout(e.loadout),
  };
}

/** Merge stored/URL values over the defaults, dropping anything unknown. */
export function normalizeConfig(raw) {
  const base = defaultConfig();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base };

  for (const key of Object.keys(base)) {
    if (!(key in raw)) continue;
    const v = raw[key];
    if (key === 'roster') continue;
    if (typeof v === typeof base[key]) out[key] = v;
    else if (Array.isArray(base[key]) && Array.isArray(v)) out[key] = v;
  }

  if (!Modes.has(out.modeId)) out.modeId = base.modeId;

  if (Array.isArray(raw.roster) && raw.roster.length) {
    const roster = raw.roster
      // Accept the pre-arsenal `elementId` spelling so saved settings and
      // links shared before the arsenal pack existed keep working.
      .map((e) => (e && !e.fighterId && e.elementId ? { ...e, fighterId: e.elementId } : e))
      .filter((e) => e && Fighters.has(e.fighterId))
      .map(normalizeRosterEntry);
    if (roster.length) out.roster = roster;
  }

  out.powerupIds = (Array.isArray(out.powerupIds) ? out.powerupIds : [])
    .filter((id) => Powerups.has(id));

  // Numeric guards — a hand-edited URL should not be able to hang the sim.
  out.baseHp = clamp(out.baseHp, 10, 2000);
  out.baseDamage = clamp(out.baseDamage, 0.5, 200);
  out.ballRadius = clamp(out.ballRadius, 8, 90);
  out.ballSpeed = clamp(out.ballSpeed, 40, 1200);
  out.gameSpeed = clamp(out.gameSpeed, 0.25, 4);
  out.arenaW = clamp(out.arenaW, 300, 2000);
  out.arenaH = clamp(out.arenaH, 300, 2000);
  out.timeLimit = clamp(out.timeLimit, 0, 900);
  out.powerupInterval = clamp(out.powerupInterval, 1, 120);
  out.maxPickups = clamp(out.maxPickups, 1, 20);
  out.tileSize = clamp(out.tileSize, 8, 80);
  out.volume = clamp(out.volume, 0, 1);
  out.seed = String(out.seed || randomSeedPhrase()).slice(0, 64);

  return out;
}

function clamp(v, lo, hi) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
}

/* ------------------------------------------------------- persistence */

export function saveConfig(cfg) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
  } catch (e) { /* private mode, quota, blocked storage — not worth failing over */ }
}

export function loadConfig() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    return normalizeConfig(JSON.parse(raw));
  } catch (e) {
    return null;
  }
}

/* -------------------------------------------------------- URL codec */

/** A loadout at defaults encodes as 0, which keeps the common link short. */
function loadoutToWire(l) {
  const d = defaultLoadout();
  const untouched = BUILD_STATS.every((s) => l[s.id] === d[s.id])
    && l.perk === d.perk && !l.weaponId
    && l.chassisId === d.chassisId && l.driveId === d.driveId;
  if (untouched) return 0;
  return [l.weaponId || 0, Perks.ids.indexOf(l.perk), l.hp, l.dmg, l.spd,
          Chassis.ids.indexOf(l.chassisId), Drives.ids.indexOf(l.driveId)];
}

function loadoutFromWire(w) {
  if (!w || !Array.isArray(w)) return defaultLoadout();
  // Positions 5 and 6 post-date the first share links, so they are optional
  // and fall back to the stock parts rather than invalidating an old URL.
  const [weaponId, perkIdx, hp, dmg, spd, chassisIdx, driveIdx] = w;
  return normalizeLoadout({
    weaponId: weaponId && Weapons.has(weaponId) ? weaponId : null,
    perk: Perks.ids[perkIdx] || 'none',
    chassisId: Chassis.ids[chassisIdx] || 'standard',
    driveId: Drives.ids[driveIdx] || 'orbit',
    hp, dmg, spd,
  });
}

/** Compact wire form: single-letter keys, templates as registry indices. */
function toWire(cfg) {
  const ids = Fighters.ids;
  return {
    v: 2,
    m: cfg.modeId,
    s: cfg.seed,
    t: cfg.themeId,
    r: cfg.roster.map((e) => [ids.indexOf(e.fighterId), e.teamId, e.count, loadoutToWire(e.loadout)]),
    a: [cfg.arenaW, cfg.arenaH],
    n: [cfg.baseHp, cfg.baseDamage, cfg.ballRadius, cfg.ballSpeed, cfg.gameSpeed, cfg.timeLimit],
    p: cfg.powerupsEnabled ? [cfg.powerupInterval, cfg.maxPickups, cfg.powerupIds] : 0,
    g: [cfg.tileSize, cfg.territoryRespawn ? 1 : 0],
  };
}

function fromWire(w) {
  const ids = Fighters.ids;
  const cfg = {
    modeId: w.m,
    seed: w.s,
    themeId: w.t,
    roster: (w.r || []).map(([i, team, count, load]) => ({
      fighterId: ids[i] || ids[0], teamId: team, count, loadout: loadoutFromWire(load),
    })),
  };
  if (Array.isArray(w.a)) { cfg.arenaW = w.a[0]; cfg.arenaH = w.a[1]; }
  if (Array.isArray(w.n)) {
    [cfg.baseHp, cfg.baseDamage, cfg.ballRadius, cfg.ballSpeed, cfg.gameSpeed, cfg.timeLimit] = w.n;
  }
  if (w.p === 0) {
    cfg.powerupsEnabled = false;
  } else if (Array.isArray(w.p)) {
    cfg.powerupsEnabled = true;
    cfg.powerupInterval = w.p[0];
    cfg.maxPickups = w.p[1];
    cfg.powerupIds = w.p[2] || [];
  }
  if (Array.isArray(w.g)) { cfg.tileSize = w.g[0]; cfg.territoryRespawn = !!w.g[1]; }
  return cfg;
}

/** URL-safe base64 of the compact JSON. */
export function encodeConfig(cfg) {
  const json = JSON.stringify(toWire(cfg));
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeConfig(token) {
  try {
    let b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return normalizeConfig(fromWire(JSON.parse(json)));
  } catch (e) {
    return null;
  }
}

export function shareUrl(cfg) {
  const url = new URL(window.location.href);
  url.hash = `m=${encodeConfig(cfg)}`;
  return url.toString();
}

export function configFromLocation() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash.startsWith('m=')) return null;
  return decodeConfig(hash.slice(2));
}
