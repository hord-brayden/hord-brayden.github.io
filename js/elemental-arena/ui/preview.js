/* Animated orb previews.
 *
 * Every fighter card and every team slot shows a real orb swinging its real
 * weapon, drawn with the same baked sprites the arena uses. That is the whole
 * point of the roster builder: you pick a fighter by looking at it, not by
 * reading its name off a dropdown.
 *
 * All previews share a single requestAnimationFrame loop, and the loop only
 * runs while previews are actually on screen — an IntersectionObserver parks
 * anything scrolled out of view, so a long roster list costs nothing.
 */

import { bakeWeapon, Weapons } from '../content/weapons.js';
import { Themes } from '../render/themes.js';

const TAU = Math.PI * 2;

const live = new Set();
let raf = 0;
let observer = null;

function ensureObserver() {
  if (observer || typeof IntersectionObserver === 'undefined') return;
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const p = e.target._preview;
      if (p) p.visible = e.isIntersecting;
    }
  }, { rootMargin: '80px' });
}

function tick(now) {
  raf = 0;
  let any = false;
  for (const p of live) {
    if (!p.canvas.isConnected) { live.delete(p); continue; }
    if (!p.visible) continue;
    any = true;
    paint(p, now / 1000);
  }
  if (live.size) raf = requestAnimationFrame(tick);
  return any;
}

function start() {
  if (!raf && live.size) raf = requestAnimationFrame(tick);
}

/**
 * Attach a live preview to a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {object} fighter  fighter definition
 * @param {object} opts     { loadout, themeId, spin, showWeapon }
 */
export function attachPreview(canvas, fighter, opts = {}) {
  ensureObserver();
  const p = {
    canvas,
    ctx: canvas.getContext('2d'),
    fighter,
    loadout: opts.loadout || null,
    themeId: opts.themeId || 'pixel',
    spin: opts.spin ?? 1,
    visible: true,
    phase: Math.random() * TAU,
  };
  canvas._preview = p;
  live.add(p);
  if (observer) observer.observe(canvas);
  sizeCanvas(p);
  paint(p, performance.now() / 1000);
  start();
  return p;
}

export function updatePreview(canvas, patch) {
  const p = canvas._preview;
  if (!p) return;
  Object.assign(p, patch);
  sizeCanvas(p);
  paint(p, performance.now() / 1000);
}

export function detachPreview(canvas) {
  const p = canvas._preview;
  if (!p) return;
  live.delete(p);
  if (observer) observer.unobserve(canvas);
  canvas._preview = null;
}

function sizeCanvas(p) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = p.canvas.getBoundingClientRect();
  // A preview attached while its panel is still hidden measures 0, so fall
  // back to a sane box rather than propagating zeroes into the sprite baker.
  const w = Math.max(24, Math.round(rect.width || p.canvas.clientWidth || 64));
  const h = Math.max(24, Math.round(rect.height || p.canvas.clientHeight || 64));

  // These are recorded before the early-out on purpose: skipping them when the
  // backing store already matched left cssW undefined, which turned every
  // downstream size into NaN and baked a zero-width canvas.
  p.cssW = w; p.cssH = h; p.dpr = dpr;

  if (p.canvas.width === Math.round(w * dpr) && p.canvas.height === Math.round(h * dpr)) return;
  p.canvas.width = Math.round(w * dpr);
  p.canvas.height = Math.round(h * dpr);
}

function paint(p, t) {
  const { ctx, fighter } = p;
  if (!p.cssW) sizeCanvas(p);
  const w = p.cssW, h = p.cssH;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 2 || h < 2) return;
  ctx.setTransform(p.dpr, 0, 0, p.dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const theme = Themes.get(p.themeId) || Themes.get('pixel');
  const c = fighter.colors;

  // The orb is sized so the orb plus its swung weapon fits the box.
  const r = Math.min(w, h) * 0.26;
  const cx = w / 2, cy = h / 2;
  const angle = p.phase + t * 1.5 * p.spin;

  const weaponId = (p.loadout && p.loadout.weaponId && Weapons.has(p.loadout.weaponId))
    ? p.loadout.weaponId : fighter.weapon.id;
  const def = Weapons.require(weaponId);

  const tether = fighter.tether + (p.loadout && p.loadout.perk === 'reach' ? 1.5 : 0);
  const gripDist = r * (1 + tether);
  const len = r * 1.55 * (def.w / 30);

  // Weapon first so the orb overlaps its grip, same order as the arena.
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const gx = cx + cos * gripDist, gy = cy + sin * gripDist;

  if (gripDist - r > 2) {
    ctx.fillStyle = theme.chainColor;
    const gap = gripDist - r;
    const beads = Math.max(2, Math.round(gap / 5));
    for (let i = 0; i <= beads; i++) {
      const k = i / beads;
      ctx.beginPath();
      ctx.arc(cx + cos * (r * 0.7 + gap * k), cy + sin * (r * 0.7 + gap * k), 1.8, 0, TAU);
      ctx.fill();
    }
  }

  const px = Math.max(1, Math.min(5, Math.round(len / def.w)));
  const sprite = bakeWeapon(weaponId, fighter.weapon.palette, px,
    theme.pixelate ? theme.outline : null);
  const k = len / (def.w * px);
  ctx.save();
  ctx.translate(gx, gy);
  ctx.rotate(angle);
  ctx.scale(k, k);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, -sprite.anchorX, -sprite.anchorY);
  ctx.imageSmoothingEnabled = true;
  ctx.restore();

  // Orb.
  ctx.save();
  ctx.translate(cx, cy);
  if (theme.glow) { ctx.shadowColor = c.core; ctx.shadowBlur = 16; }
  ctx.fillStyle = theme.ballFill(ctx, { element: fighter }, r);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  theme.decorateBall(ctx, { element: fighter }, r);
  ctx.strokeStyle = theme.outline;
  ctx.lineWidth = Math.max(1.5, theme.outlineWidth * (r / 24));
  ctx.beginPath();
  ctx.arc(0, 0, r - ctx.lineWidth / 2, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** Re-measure every preview, e.g. after a layout change. */
export function refreshPreviews() {
  for (const p of live) { sizeCanvas(p); paint(p, performance.now() / 1000); }
  start();
}
