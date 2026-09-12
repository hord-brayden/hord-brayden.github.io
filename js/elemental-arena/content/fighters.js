/* The fighter registry and the helpers its packs share.
 *
 * A "fighter" is a template: everything that makes one orb feel different
 * from another. Templates are grouped into packs by `family` — the elemental
 * pack (Fire, Ice, Lightning …) and the arsenal pack (Lancer, Duelist,
 * Alchemist …) — and the roster builder presents them as separate tabs.
 *
 * This module deliberately holds no definitions. Packs import it and register
 * into it; consumers import `content/roster.js`, which pulls in every pack
 * first and then re-exports. That ordering is what keeps the two directions
 * from forming an import cycle.
 *
 * Fighter hooks, all optional:
 *   onHit({ engine, attacker, victim, amount })   signature effect on contact
 *   onParry(engine, ball, other)                  weapons clashed
 *   passive.onTick(engine, ball, dt)              always-on behaviour
 *   passive.damageBonus(engine, attacker, victim) multiplier on outgoing hits
 *   ult.cast(engine, owner)                       the meter payoff
 *   overload.apply(engine, ball)                  template-specific powerup
 */

import { Registry } from '../core/registry.js';

export const Fighters = new Registry('fighter', {
  defaults: {
    family: 'elemental',
    // Stat multipliers against the mode's baseline. Kept close to 1 —
    // identity should come from effects, not from raw number inflation.
    hp: 1, damage: 1, speed: 1, spin: 1, reach: 1,
    cosmetic: null,
    strong: [], weak: [],
    // How far the grip sits from the orb's surface, in orb radii. Zero means
    // the weapon is held against the orb, which is the default look; only a
    // powerup or a template built around reach should raise it.
    tether: 0,
  },
  required: ['name', 'glyph', 'colors', 'weapon', 'ult'],
});

/** Build a weapon palette, filling in the derived grip shades. */
export function wpal(key, mid, light, dark, accent, hilt) {
  return {
    key, mid, light, dark, accent,
    hilt,
    hiltLight: shade(hilt, 1.35),
    hiltDark: shade(hilt, 0.6),
  };
}

/** Multiply a #rrggbb by a factor, clamped. Cheap, good enough for shading. */
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/* ---------------------------------------------------------- presentation */

/* A template's core colour is chosen to read well inside the arena, which has
 * its own background. It does not automatically read well as HUD text on the
 * site's cream or near-black page — Light's pale gold on cream is effectively
 * invisible. These pick a variant with enough contrast for each page theme,
 * so the chrome stays legible without dulling the in-arena palette. */

/** Perceived brightness, 0 (black) to 1 (white). */
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

const uiCache = new Map();

/**
 * The colour to use for this template in page chrome.
 * @param {object} el      fighter definition
 * @param {boolean} onDark true when the page is in dark mode
 */
export function uiColor(el, onDark) {
  const key = `${el.id}|${onDark ? 'd' : 'l'}`;
  let v = uiCache.get(key);
  if (v) return v;
  const c = el.colors;
  v = onDark
    ? (luminance(c.core) < 0.22 ? c.light : c.core)   // too dark on near-black
    : (luminance(c.core) > 0.62 ? c.dark : c.core);   // too pale on cream
  uiCache.set(key, v);
  return v;
}

/* -------------------------------------------------------------- matchups */

/**
 * The matchup multiplier applied on top of raw damage.
 * Cross-family pairings are neutral unless a template names the other
 * explicitly, so the arsenal pack and the elemental pack mix cleanly.
 */
export function effectiveness(attacker, defender) {
  if (attacker.strong.includes(defender.id)) return 1.25;
  if (attacker.weak.includes(defender.id)) return 0.8;
  return 1;
}

/** Families, in the order the roster builder should show them. */
export const FAMILIES = [
  { id: 'elemental', name: 'Elemental', blurb: 'Twelve elements, each with a signature status effect and an ultimate.' },
  { id: 'arsenal', name: 'Arsenal', blurb: 'Weapon-first fighters built around reach, tempo, projectiles and ground hazards.' },
];

export function fightersInFamily(family) {
  return Fighters.filter((f) => f.family === family);
}
