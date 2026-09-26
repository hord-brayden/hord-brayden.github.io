/* Visual themes.
 *
 * A theme is a bundle of style parameters plus a few painters. The engine
 * state it draws is identical either way — swapping themes mid-match is
 * legal and instant, because a theme holds no simulation state.
 *
 * To add a theme: define one here with the same keys. The settings panel
 * enumerates the registry.
 */

import { Registry } from '../core/registry.js';

export const Themes = new Registry('theme', {
  defaults: { glow: 0, pixelate: false },
  required: ['name', 'arena', 'ballFill'],
});

/* ================================================================ PIXEL */

Themes.define({
  id: 'pixel',
  name: 'Pixel',
  desc: 'Chunky sprites, hard outlines, white arena. The original look.',
  pixelate: true,
  glow: 0,

  arena: {
    fill: '#ffffff',
    border: '#111111',
    borderWidth: 6,
    grid: null,
    page: '#f1ecdf',
  },
  outline: '#111111',
  outlineWidth: 3,
  gridLine: 'rgba(0,0,0,0.34)',
  floorLine: 'rgba(17,17,17,0.055)',
  floorMark: 'rgba(17,17,17,0.07)',
  vignette: 'rgba(24,21,19,0.13)',
  chainColor: '#1a1a1a',
  chainStyle: 'beads',
  hpFont: (size) => `700 ${size}px "JetBrains Mono", ui-monospace, monospace`,
  hpStroke: '#111111',
  hpStrokeWidth: 4,
  textFont: (size) => `800 ${size}px "JetBrains Mono", ui-monospace, monospace`,
  particleShape: 'square',
  trail: false,

  ballFill(ctx, ball, r) {
    return ball.element.colors.core;
  },

  /** A flat disc with a hard rim — no gradients, nothing soft. */
  decorateBall(ctx, ball, r) {
    const c = ball.element.colors;
    // Top-left highlight block, the way a pixel artist would light a sphere.
    ctx.fillStyle = c.light;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(-r * 0.3, -r * 0.32, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  },

  background(ctx, engine, w, h) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  },
});

/* ================================================================= NEON */

Themes.define({
  id: 'neon',
  name: 'Neon',
  desc: 'Dark arena, bloom, motion trails. Reads well on a big screen.',
  pixelate: false,
  glow: 1,

  arena: {
    fill: '#0a0a12',
    border: '#2a2a44',
    borderWidth: 2,
    grid: 'rgba(120,140,220,0.07)',
    gridSize: 48,
    page: '#05050a',
  },
  outline: 'rgba(255,255,255,0.85)',
  outlineWidth: 2,
  gridLine: 'rgba(150,170,240,0.18)',
  floorLine: 'rgba(150,170,240,0.05)',
  floorMark: 'rgba(150,170,240,0.1)',
  vignette: 'rgba(0,0,0,0.5)',
  chainColor: 'rgba(200,210,255,0.5)',
  chainStyle: 'line',
  hpFont: (size) => `700 ${size}px "Inter", system-ui, sans-serif`,
  hpStroke: 'rgba(0,0,0,0.85)',
  hpStrokeWidth: 3,
  textFont: (size) => `700 ${size}px "Inter", system-ui, sans-serif`,
  particleShape: 'glow',
  trail: true,

  ballFill(ctx, ball, r) {
    // A radial core so the sphere reads as lit from inside.
    const c = ball.element.colors;
    const g = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.1, 0, 0, r);
    g.addColorStop(0, c.light);
    g.addColorStop(0.55, c.core);
    g.addColorStop(1, c.dark);
    return g;
  },

  decorateBall(ctx, ball, r) {
    ctx.strokeStyle = ball.element.colors.light;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  },

  background(ctx, engine, w, h) {
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(120,140,220,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 48) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y <= h; y += 48) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
  },
});
