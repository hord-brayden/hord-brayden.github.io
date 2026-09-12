/* Canvas renderer.
 *
 * Reads engine state, writes pixels, and never the other way around.
 *
 * Performance notes, since this is the hot path:
 *  - Weapon sprites and ball discs are baked once into offscreen canvases
 *    and blitted, rather than re-drawn with path operations every frame.
 *  - Particles are bucketed by (colour, quantised alpha) so a frame with
 *    2,000 particles costs a few dozen fillStyle changes instead of 2,000.
 *  - The territory grid lives on its own canvas and only repaints tiles the
 *    mode marked dirty.
 *  - Positions are interpolated between simulation states, so the picture is
 *    smooth at any refresh rate even though the sim is locked to 120Hz.
 */

import { bakeWeapon, Weapons } from '../content/weapons.js';
import { Themes } from './themes.js';
import { STYLES } from '../core/particles.js';

const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas, engine, themeId = 'pixel') {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.engine = engine;
    this.setTheme(themeId);

    this.dpr = 1;
    this.scale = 1;
    this.width = 0;
    this.height = 0;

    this.ballCache = new Map();
    this.gridCanvas = null;
    this.gridCtx = null;

    // Particle batching. Reused across frames; only the lengths reset.
    this._buckets = new Map();
    this.showTrails = true;
    this.showParticles = true;
    this.reduceMotion = false;
  }

  setTheme(id) {
    this.theme = Themes.require(id);
    this.ballCache = new Map();
    this.gridCanvas = null;      // grid colours may differ per theme
    this.fittedTheme = null;     // border padding differs, so re-fit
    return this;
  }

  /**
   * Fit the canvas to its container.
   *
   * The arena's own coordinate space is fixed — it has to be, or the same
   * seed would play out differently on a laptop and a phone. So rather than
   * filling the container and letterboxing (which leaves dead bars that read
   * badly against the page, especially under the dark theme), the canvas is
   * sized to exactly the fitted arena and centred by the flex container.
   * There is no letterbox because there is no spare canvas.
   */
  resize(hostWidth, hostHeight) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const hw = Math.max(1, Math.floor(hostWidth));
    const hh = Math.max(1, Math.floor(hostHeight));
    if (this.hostW === hw && this.hostH === hh && this.dpr === dpr
        && this.fittedTheme === this.theme.id) return;

    this.hostW = hw; this.hostH = hh; this.dpr = dpr;
    this.fittedTheme = this.theme.id;

    const a = this.engine.arena;
    const pad = this.theme.arena.borderWidth + 2;
    this.scale = Math.max(0.05, Math.min((hw - pad * 2) / a.w, (hh - pad * 2) / a.h));

    const w = Math.round(a.w * this.scale + pad * 2);
    const h = Math.round(a.h * this.scale + pad * 2);
    this.width = w; this.height = h;
    this.offsetX = pad;
    this.offsetY = pad;

    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    this.ballCache.clear();
    this.gridCanvas = null;
  }

  /* ---------------------------------------------------------- baking */

  /** A ball disc, baked at a fixed logical size and scaled at draw time.
   *  Under the pixel theme the upscale is exactly what produces chunky
   *  pixels on a growing ball, which is the effect we want anyway. */
  ballSprite(ball) {
    const key = `${ball.elementId}|${this.theme.id}`;
    let c = this.ballCache.get(key);
    if (c) return c;

    const R = 48;                     // logical radius
    const pad = 6;
    const size = (R + pad) * 2;
    c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    g.translate(size / 2, size / 2);

    g.fillStyle = this.theme.ballFill(g, ball, R);
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.fill();

    this.theme.decorateBall(g, ball, R);

    g.strokeStyle = this.theme.outline;
    g.lineWidth = this.theme.outlineWidth * (R / 24);
    g.beginPath();
    g.arc(0, 0, R - g.lineWidth / 2, 0, TAU);
    g.stroke();

    c.logicalRadius = R + pad;
    this.ballCache.set(key, c);
    return c;
  }

  /**
   * Bake at whatever art-pixel size lands closest to the blade's on-screen
   * length, so upscaling stays chunky instead of blurring. `worldLength` is
   * the same number the engine hit-tests against, which is what keeps the
   * drawn weapon and its hitbox identical.
   */
  weaponSprite(ball, worldLength) {
    const def = Weapons.require(ball.weaponId);
    const wantDevice = Math.max(8, worldLength * this.scale);
    const px = Math.max(1, Math.min(6, Math.round(wantDevice / def.w)));
    const sprite = bakeWeapon(ball.weaponId, ball.element.weapon.palette, px,
      this.theme.pixelate ? this.theme.outline : null);
    sprite.artWidth = def.w * px;
    return sprite;
  }

  /* ------------------------------------------------------------ frame */

  render(alpha) {
    const ctx = this.ctx;
    const e = this.engine;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = this.theme.arena.page;
    ctx.fillRect(0, 0, this.width, this.height);

    // Screen shake is applied to the view transform, not to any entity.
    let sx = 0, sy = 0;
    if (e.shakeAmount > 0.2 && !this.reduceMotion) {
      sx = (Math.random() - 0.5) * e.shakeAmount;
      sy = (Math.random() - 0.5) * e.shakeAmount;
    }

    ctx.save();
    ctx.translate(this.offsetX + sx, this.offsetY + sy);
    ctx.scale(this.scale, this.scale);
    ctx.beginPath();
    ctx.rect(0, 0, e.arena.w, e.arena.h);
    ctx.clip();

    this.theme.background(ctx, e, e.arena.w, e.arena.h);
    this.drawTerritory(ctx);
    this.drawHazards(ctx);
    this.drawFields(ctx);
    this.drawPickups(ctx);
    if (this.showParticles) this.drawParticles(ctx);
    this.drawProjectiles(ctx, alpha);
    this.drawEffectsBelow(ctx);
    this.drawBalls(ctx, alpha);
    this.drawEffectsAbove(ctx);
    this.drawTexts(ctx);

    ctx.restore();

    // Arena frame, drawn outside the clip so the stroke is not halved.
    ctx.save();
    ctx.translate(this.offsetX + sx, this.offsetY + sy);
    ctx.strokeStyle = this.theme.arena.border;
    ctx.lineWidth = this.theme.arena.borderWidth;
    ctx.strokeRect(
      -this.theme.arena.borderWidth / 2,
      -this.theme.arena.borderWidth / 2,
      e.arena.w * this.scale + this.theme.arena.borderWidth,
      e.arena.h * this.scale + this.theme.arena.borderWidth
    );
    ctx.restore();

    this.drawWeather(ctx);

    if (e.flashAlpha > 0.004) {
      ctx.globalAlpha = Math.min(0.75, e.flashAlpha);
      ctx.fillStyle = e.flashColor || '#ffffff';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.globalAlpha = 1;
    }
  }

  /* -------------------------------------------------------- territory */

  drawTerritory(ctx) {
    const mode = this.engine.mode;
    if (!mode || mode.id !== 'territory' || !mode.grid) return;

    const a = this.engine.arena;
    if (!this.gridCanvas) {
      this.gridCanvas = document.createElement('canvas');
      this.gridCanvas.width = a.w;
      this.gridCanvas.height = a.h;
      this.gridCtx = this.gridCanvas.getContext('2d');
      this.gridCtx.clearRect(0, 0, a.w, a.h);
      // First build after a theme change repaints everything.
      mode.dirty.length = 0;
      for (let i = 0; i < mode.grid.length; i++) if (mode.grid[i]) mode.dirty.push(i);
    }

    const g = this.gridCtx;
    const t = mode.tile;
    const dirty = mode.dirty;
    if (dirty.length) {
      for (let k = 0; k < dirty.length; k++) {
        const i = dirty[k];
        const c = i % mode.cols, r = (i / mode.cols) | 0;
        const team = mode.grid[i];
        const x = c * t, y = r * t;
        g.clearRect(x, y, t, t);
        if (!team) continue;
        g.fillStyle = this.teamColor(team - 1);
        g.fillRect(x, y, t, t);
      }
      dirty.length = 0;
    }

    ctx.globalAlpha = this.theme.id === 'neon' ? 0.6 : 1;
    ctx.drawImage(this.gridCanvas, 0, 0);
    ctx.globalAlpha = 1;

    this.drawGridLines(ctx, mode);
    this.drawTerritoryBorders(ctx, mode);
  }

  /**
   * The lattice is drawn over the whole board, claimed or not, in one path.
   * Painting it per tile into the offscreen canvas made unclaimed ground read
   * as empty white space; drawing it across everything is what gives the board
   * its graph-paper look.
   */
  drawGridLines(ctx, mode) {
    const t = mode.tile;
    const w = mode.cols * t, h = mode.rows * t;
    ctx.strokeStyle = this.theme.gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= mode.cols; c++) {
      const x = Math.min(c * t, this.engine.arena.w) + 0.5;
      ctx.moveTo(x, 0); ctx.lineTo(x, Math.min(h, this.engine.arena.h));
    }
    for (let r = 0; r <= mode.rows; r++) {
      const y = Math.min(r * t, this.engine.arena.h) + 0.5;
      ctx.moveTo(0, y); ctx.lineTo(Math.min(w, this.engine.arena.w), y);
    }
    ctx.stroke();
  }

  /**
   * A heavy outline wherever a team's territory meets something that is not
   * its own. Only boundary edges are stroked, so a solid region reads as one
   * shape rather than a mosaic of bordered squares.
   */
  drawTerritoryBorders(ctx, mode) {
    const t = mode.tile;
    const { cols, rows, grid } = mode;
    ctx.strokeStyle = this.theme.outline;
    ctx.lineWidth = this.theme.pixelate ? 3 : 2;
    ctx.lineCap = 'square';
    ctx.beginPath();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = grid[r * cols + c];
        if (!v) continue;
        const x = c * t, y = r * t;
        if (r === 0 || grid[(r - 1) * cols + c] !== v) { ctx.moveTo(x, y); ctx.lineTo(x + t, y); }
        if (r === rows - 1 || grid[(r + 1) * cols + c] !== v) { ctx.moveTo(x, y + t); ctx.lineTo(x + t, y + t); }
        if (c === 0 || grid[r * cols + c - 1] !== v) { ctx.moveTo(x, y); ctx.lineTo(x, y + t); }
        if (c === cols - 1 || grid[r * cols + c + 1] !== v) { ctx.moveTo(x + t, y); ctx.lineTo(x + t, y + t); }
      }
    }
    ctx.stroke();
  }

  teamColor(teamId) {
    const ball = this.engine.balls.find((b) => b.teamId === teamId);
    return ball ? ball.element.colors.core : '#888888';
  }

  /* ------------------------------------------------------------ balls */

  drawBalls(ctx, alpha) {
    const e = this.engine;
    for (const ball of e.balls) {
      if (ball.dead) continue;
      const x = ball.px + (ball.x - ball.px) * alpha;
      const y = ball.py + (ball.y - ball.py) * alpha;
      this.drawChainAndWeapons(ctx, ball, x, y);
    }
    for (const ball of e.balls) {
      if (ball.dead) continue;
      const x = ball.px + (ball.x - ball.px) * alpha;
      const y = ball.py + (ball.y - ball.py) * alpha;
      this.drawBall(ctx, ball, x, y);
    }
  }

  drawBall(ctx, ball, x, y) {
    const r = ball.radius;
    const sprite = this.ballSprite(ball);

    ctx.save();
    ctx.translate(x, y);

    this.drawCosmetic(ctx, ball, r);

    if (this.theme.glow) {
      ctx.shadowColor = ball.element.colors.core;
      ctx.shadowBlur = 22;
    }
    const drawR = r * (sprite.logicalRadius / 48);
    ctx.imageSmoothingEnabled = !this.theme.pixelate;
    ctx.drawImage(sprite, -drawR, -drawR, drawR * 2, drawR * 2);
    ctx.shadowBlur = 0;
    ctx.imageSmoothingEnabled = true;

    if (ball.parryFlash > 0) {
      ctx.globalAlpha = Math.min(0.9, ball.parryFlash);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(3, r * 0.2);
      ctx.beginPath();
      ctx.arc(0, 0, r + ctx.lineWidth, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Damage flash — a white wash the moment a hit lands.
    if (ball.hitFlash > 0) {
      ctx.globalAlpha = Math.min(0.8, ball.hitFlash * 0.8);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    this.drawStatusRing(ctx, ball, r);
    this.drawHealthBar(ctx, ball, r);

    // HP, dead centre, the way the source art does it.
    const size = Math.max(11, Math.round(r * 0.95));
    ctx.font = this.theme.hpFont(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = this.theme.hpStrokeWidth;
    ctx.strokeStyle = this.theme.hpStroke;
    ctx.fillStyle = ball.element.colors.ink;
    const hpText = String(Math.max(0, Math.ceil(ball.hp)));
    ctx.strokeText(hpText, 0, 1);
    ctx.fillText(hpText, 0, 1);

    ctx.restore();

    this.drawStatusTags(ctx, ball, x, y, r);
  }

  /**
   * A slim health bar riding above the orb. The number inside says exactly how
   * much is left; the bar says how much is left *relative to this orb*, which
   * is the thing you actually read at a glance when four of them are moving.
   */
  drawHealthBar(ctx, ball, r) {
    const ratio = ball.hpRatio;
    const w = Math.max(18, r * 1.15);
    const h = Math.max(4, r * 0.14);
    const y = -r - h - Math.max(5, r * 0.22);

    ctx.fillStyle = this.theme.hpStroke;
    ctx.fillRect(-w / 2 - 1.5, y - 1.5, w + 3, h + 3);
    ctx.fillStyle = this.theme.pixelate ? '#ffffff' : 'rgba(255,255,255,0.22)';
    ctx.fillRect(-w / 2, y, w, h);
    ctx.fillStyle = ratio > 0.5 ? '#3fae4b' : ratio > 0.22 ? '#e0a020' : '#d13b2f';
    ctx.fillRect(-w / 2, y, w * ratio, h);
  }

  /** The thin arc around a ball showing its ultimate meter, plus coloured
   *  ticks for whatever statuses are riding on it. */
  drawStatusRing(ctx, ball, r) {
    const ratio = ball.ultRatio;
    if (ratio > 0.001) {
      ctx.strokeStyle = ball.element.colors.accent;
      ctx.lineWidth = Math.max(2, r * 0.13);
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.arc(0, 0, r + ctx.lineWidth, -Math.PI / 2, -Math.PI / 2 + TAU * ratio);
      ctx.stroke();
      if (ratio > 0.95) {
        ctx.globalAlpha = 0.5 + Math.sin(this.engine.time * 14) * 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    let i = 0;
    const total = ball.statuses.size;
    if (!total) return;
    for (const [id] of ball.statuses) {
      const def = this.engine.statusDef(id);
      if (!def) continue;
      const a = Math.PI / 2 + (i / total) * TAU;
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * (r + 8), Math.sin(a) * (r + 8), Math.max(2.2, r * 0.11), 0, TAU);
      ctx.fill();
      i++;
    }
  }

  /** A single most-important status name over the ball, like CC-IMMUNE in
   *  the source. Showing all of them at once turns into noise. */
  drawStatusTags(ctx, ball, x, y, r) {
    let pick = null;
    for (const [id] of ball.statuses) {
      const def = this.engine.statusDef(id);
      if (!def || !def.short) continue;
      if (!pick || (def.beneficial && !pick.beneficial)) pick = def;
    }
    if (!pick) return;
    const size = Math.max(9, Math.round(r * 0.42));
    ctx.font = this.theme.textFont(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = this.theme.hpStroke;
    ctx.fillStyle = pick.color;
    const top = y - r - Math.max(5, r * 0.22) - Math.max(4, r * 0.14) - 6;
    ctx.strokeText(pick.short, x, top);
    ctx.fillText(pick.short, x, top);
  }

  /* -------------------------------------------------------- cosmetics */

  /** Per-element flourishes. Purely decorative — never read by the sim. */
  drawCosmetic(ctx, ball, r) {
    const t = this.engine.time;
    const c = ball.element.colors;
    switch (ball.element.cosmetic) {
      case 'wings': {
        // Flapping wings, mirrored. The source's fire ball has these.
        const flap = Math.sin(t * 9) * 0.32;
        for (const dir of [-1, 1]) {
          ctx.save();
          ctx.scale(dir, 1);
          ctx.rotate(0.5 + flap);
          ctx.fillStyle = c.dark;
          ctx.beginPath();
          ctx.moveTo(r * 0.3, 0);
          ctx.lineTo(r * 1.9, -r * 0.5);
          ctx.lineTo(r * 1.6, r * 0.25);
          ctx.lineTo(r * 1.9, r * 0.55);
          ctx.lineTo(r * 0.4, r * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = c.light;
          ctx.beginPath();
          ctx.moveTo(r * 0.4, -r * 0.05);
          ctx.lineTo(r * 1.5, -r * 0.35);
          ctx.lineTo(r * 1.3, r * 0.2);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        break;
      }
      case 'halo': {
        ctx.strokeStyle = c.accent;
        ctx.lineWidth = Math.max(2, r * 0.14);
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.ellipse(0, -r * 1.35, r * 0.75, r * 0.26, 0, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'frost': case 'rocks': case 'plating': case 'runes': {
        // Orbiting chips, shared shape with per-element colour and count.
        const n = ball.element.cosmetic === 'runes' ? 3 : 5;
        const spin = ball.element.cosmetic === 'runes' ? -1.1 : 0.7;
        ctx.fillStyle = ball.element.cosmetic === 'runes' ? c.accent : c.light;
        for (let i = 0; i < n; i++) {
          const a = t * spin + (i / n) * TAU;
          const d = r * 1.42;
          const s = r * 0.2;
          ctx.save();
          ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
          ctx.rotate(a * 2);
          ctx.fillRect(-s / 2, -s / 2, s, s);
          ctx.restore();
        }
        break;
      }
      case 'sparks': {
        ctx.strokeStyle = c.accent;
        ctx.lineWidth = Math.max(1.5, r * 0.1);
        for (let i = 0; i < 3; i++) {
          const a = t * 5 + (i / 3) * TAU;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          ctx.lineTo(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5);
          ctx.stroke();
        }
        break;
      }
      case 'smoke': case 'swirl': case 'bubbles': case 'drip': case 'leaves': {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = c.trail;
        const n = 4;
        for (let i = 0; i < n; i++) {
          const a = t * (ball.element.cosmetic === 'swirl' ? 3.4 : 1.3) + (i / n) * TAU;
          const wob = Math.sin(t * 3 + i) * r * 0.15;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * (r * 1.3 + wob), Math.sin(a) * (r * 1.3 + wob), r * 0.24, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        break;
      }
      default: break;
    }
  }

  /* ---------------------------------------------------- chain + weapon */

  drawChainAndWeapons(ctx, ball, bx, by) {
    const gripDist = ball.gripDistance();
    for (const w of ball.weapons) {
      const len = w.length || ball.weaponLength(w);
      const sprite = this.weaponSprite(ball, len);
      const cos = Math.cos(w.angle), sin = Math.sin(w.angle);
      // Derive grip and tip from the interpolated orb centre rather than the
      // simulation's own copy, so the weapon never lags the orb by a frame.
      const gx = bx + cos * gripDist;
      const gy = by + sin * gripDist;

      // A chain is only drawn when there is actually a gap to span. By
      // default the weapon is held against the orb and there is nothing to
      // draw — reach is something a template or a powerup grants.
      const gap = gripDist - ball.radius;
      if (gap > 2) {
        if (this.theme.chainStyle === 'beads') {
          const beads = Math.max(2, Math.round(gap / 7));
          ctx.fillStyle = this.theme.chainColor;
          for (let i = 0; i <= beads; i++) {
            const t = i / beads;
            const px = bx + cos * (ball.radius * 0.7 + gap * t);
            const py = by + sin * (ball.radius * 0.7 + gap * t);
            ctx.beginPath();
            ctx.arc(px, py, 2.4, 0, TAU);
            ctx.fill();
          }
        } else {
          ctx.strokeStyle = this.theme.chainColor;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(bx + cos * ball.radius * 0.7, by + sin * ball.radius * 0.7);
          ctx.lineTo(gx, gy);
          ctx.stroke();
        }
      }

      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(w.angle);
      if (this.theme.glow) {
        ctx.shadowColor = ball.element.colors.light;
        ctx.shadowBlur = 14;
      }
      // Scale the baked sprite so its art width equals the blade length the
      // engine uses for hit tests — what you see is exactly what can hit you.
      const k = len / sprite.artWidth;
      ctx.scale(k, k);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite, -sprite.anchorX, -sprite.anchorY);
      ctx.imageSmoothingEnabled = true;
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  /* ------------------------------------------------------- projectiles */

  drawProjectiles(ctx, alpha) {
    for (const p of this.engine.projectiles) {
      const x = p.px + (p.x - p.px) * alpha;
      const y = p.py + (p.y - p.py) * alpha;
      ctx.fillStyle = p.color;
      if (this.theme.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 14; }
      if (p.style === 'arrow') {
        // Drawn along its heading so a volley reads as direction, not dots.
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.angle);
        ctx.fillRect(-p.radius * 2.4, -1.5, p.radius * 4, 3);
        ctx.beginPath();
        ctx.moveTo(p.radius * 2.4, 0);
        ctx.lineTo(p.radius * 0.8, -p.radius);
        ctx.lineTo(p.radius * 0.8, p.radius);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.style === 'flask') {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.engine.time * 7);
        ctx.fillRect(-p.radius, -p.radius, p.radius * 2, p.radius * 2);
        ctx.restore();
      } else if (p.style === 'shard' && this.theme.pixelate) {
        ctx.fillRect(x - p.radius, y - p.radius, p.radius * 2, p.radius * 2);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, p.radius, 0, TAU);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      if (this.theme.pixelate && p.style !== 'arrow') {
        ctx.strokeStyle = this.theme.outline;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, p.radius, 0, TAU);
        ctx.stroke();
      }
    }
  }

  /* ---------------------------------------------------------- pickups */

  drawPickups(ctx) {
    const t = this.engine.time;
    for (const p of this.engine.pickups) {
      const y = p.y + p.bob;
      const pulse = 1 + Math.sin(t * 4 + p.age) * 0.06;
      const r = p.radius * pulse;

      ctx.save();
      ctx.translate(p.x, y);
      if (this.theme.glow) { ctx.shadowColor = p.def.color; ctx.shadowBlur = 20; }
      ctx.fillStyle = p.def.color;
      ctx.beginPath();
      // A rotated square reads as a pickup diamond at any size.
      ctx.rotate(t * 0.9);
      ctx.rect(-r, -r, r * 2, r * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = this.theme.outline;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();

      ctx.font = this.theme.textFont(Math.round(p.radius * 1.1));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = this.theme.hpStroke;
      ctx.fillStyle = '#ffffff';
      ctx.strokeText(p.def.glyph, p.x, y + 1);
      ctx.fillText(p.def.glyph, p.x, y + 1);
    }
  }

  /* -------------------------------------------------------- particles */

  drawParticles(ctx) {
    const P = this.engine.particles;
    if (P.count === 0) return;

    const buckets = this._buckets;
    for (const arr of buckets.values()) arr.length = 0;

    const { alive, age, life, styleIdx, colorIdx } = P;
    for (let i = 0; i < P.cap; i++) {
      if (!alive[i]) continue;
      const def = P.styleList[styleIdx[i]];
      const t = age[i] / life[i];
      // Alpha is quantised to four steps so it can join a batch key.
      const a = def.fade === 'out' ? 1 - t : 1;
      const q = a >= 0.85 ? 3 : a >= 0.6 ? 2 : a >= 0.3 ? 1 : 0;
      const key = colorIdx[i] * 4 + q;
      let arr = buckets.get(key);
      if (!arr) { arr = []; buckets.set(key, arr); }
      arr.push(i);
    }

    const pixel = this.theme.particleShape === 'square';
    for (const [key, arr] of buckets) {
      if (!arr.length) continue;
      const ci = key >> 2;
      const q = key & 3;
      ctx.globalAlpha = [0.2, 0.45, 0.72, 1][q];
      ctx.fillStyle = P.colors[ci];
      if (this.theme.glow) { ctx.shadowColor = P.colors[ci]; ctx.shadowBlur = 8; }

      for (let k = 0; k < arr.length; k++) {
        const i = arr[k];
        const s = P.size[i];
        const def = P.styleList[P.styleIdx[i]];
        const shape = pixel ? 'square' : def.shape;
        if (shape === 'square') {
          ctx.fillRect(P.x[i] - s / 2, P.y[i] - s / 2, s, s);
        } else if (shape === 'streak') {
          const vx = P.vx[i], vy = P.vy[i];
          const m = Math.hypot(vx, vy) || 1;
          ctx.fillRect(P.x[i] - s / 2, P.y[i] - s / 2, s + (m / 40), s);
        } else {
          ctx.beginPath();
          ctx.arc(P.x[i], P.y[i], s / 2, 0, TAU);
          ctx.fill();
        }
      }
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------------- effects */

  /** Brews and poison pools. Drawn beneath the orbs so they read as floor. */
  drawHazards(ctx) {
    for (const hz of this.engine.hazards) {
      const t = hz.age / hz.life;
      const fade = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      const grow = hz.once ? 1 : Math.min(1, hz.age * 5);
      const r = hz.radius * grow;

      ctx.globalAlpha = fade * (hz.kind === 'potion' ? 0.5 : 0.34);
      ctx.fillStyle = hz.color;
      if (this.theme.glow) { ctx.shadowColor = hz.color; ctx.shadowBlur = 18; }
      ctx.beginPath();
      ctx.arc(hz.x, hz.y, r, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.globalAlpha = fade * 0.9;
      ctx.strokeStyle = hz.color;
      ctx.lineWidth = this.theme.pixelate ? 3 : 2;
      ctx.setLineDash(hz.once ? [] : [7, 5]);
      ctx.beginPath();
      ctx.arc(hz.x, hz.y, r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      // A brew is a single pickup, so it gets a mark; a pool does not.
      if (hz.once) {
        ctx.font = this.theme.textFont(16);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = this.theme.hpStroke;
        ctx.fillStyle = '#ffffff';
        ctx.strokeText('⚗', hz.x, hz.y + 1);
        ctx.fillText('⚗', hz.x, hz.y + 1);
      }
      ctx.globalAlpha = 1;
    }
  }

  drawFields(ctx) {
    for (const f of this.engine.fields) {
      const t = f.age / f.life;
      ctx.globalAlpha = (1 - t) * 0.2;
      ctx.strokeStyle = f.force > 0 ? '#7fc8ff' : '#a8ece0';
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const r = f.radius * (0.35 + i * 0.28) * (f.force > 0 ? 1 - t * 0.5 : 0.5 + t * 0.5);
        ctx.beginPath();
        ctx.arc(f.x, f.y, r, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  drawEffectsBelow(ctx) {
    for (const e of this.engine.effects) {
      if (e.type !== 'pillar') continue;
      const t = e.age / e.life;
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.fillStyle = e.color;
      const w = 34 * (1 - t * 0.4);
      ctx.fillRect(e.x - w / 2, 0, w, this.engine.arena.h);
      ctx.globalAlpha = 1;
    }
  }

  drawEffectsAbove(ctx) {
    for (const e of this.engine.effects) {
      const t = e.age / e.life;
      if (e.type === 'ring') {
        const r = e.r + (e.maxR - e.r) * (1 - (1 - t) * (1 - t));
        ctx.globalAlpha = (1 - t) * 0.85;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = Math.max(2, 9 * (1 - t));
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (e.type === 'beam') {
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 6 * (1 - t) + 1.5;
        ctx.lineCap = 'round';
        if (this.theme.glow) { ctx.shadowColor = e.color; ctx.shadowBlur = 18; }
        // A jagged path reads as an arc rather than a laser pointer.
        ctx.beginPath();
        ctx.moveTo(e.x1, e.y1);
        const segs = 5;
        for (let i = 1; i < segs; i++) {
          const p = i / segs;
          const nx = e.x1 + (e.x2 - e.x1) * p;
          const ny = e.y1 + (e.y2 - e.y1) * p;
          const jitter = 14 * Math.sin(p * Math.PI) * (i % 2 ? 1 : -1);
          const dx = e.y2 - e.y1, dy = e.x1 - e.x2;
          const m = Math.hypot(dx, dy) || 1;
          ctx.lineTo(nx + (dx / m) * jitter, ny + (dy / m) * jitter);
        }
        ctx.lineTo(e.x2, e.y2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
    }
  }

  drawTexts(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const t of this.engine.texts) {
      const p = t.age / t.life;
      ctx.globalAlpha = p > 0.65 ? 1 - (p - 0.65) / 0.35 : 1;
      const size = t.big ? 19 : 15;
      ctx.font = this.theme.textFont(size);
      ctx.lineWidth = t.big ? 5 : 4;
      ctx.strokeStyle = this.theme.hpStroke;
      ctx.fillStyle = t.color;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  /** Full-screen tint while an ultimate's weather is running. */
  drawWeather(ctx) {
    const kind = this.engine.weatherKind;
    if (!kind) return;
    const tint = {
      blizzard: 'rgba(150,220,255,0.16)',
      eclipse: 'rgba(40,0,60,0.32)',
      gale: 'rgba(160,240,225,0.12)',
      miasma: 'rgba(110,190,30,0.16)',
    }[kind];
    if (!tint) return;
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, this.width, this.height);
  }
}
