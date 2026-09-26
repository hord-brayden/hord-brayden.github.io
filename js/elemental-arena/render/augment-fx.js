/* Augment visuals.
 *
 * The point of an augment is that you can see it. A Keen blade has a white
 * highlight travelling its length like light on a polished edge; a Searing
 * one is actually on fire. Level drives intensity, so Keen VII is obviously
 * more than Keen I without reading a number.
 *
 * Two families of effect, and they are drawn differently on purpose:
 *
 *   masked — has to sit *inside* the weapon's silhouette (polish, tint,
 *            frost). Composited through an offscreen buffer using the baked
 *            sprite as the mask, because there is no other way to clip to a
 *            sprite's alpha on a shared canvas.
 *   loose  — deliberately breaks the silhouette (flame, sparks, aura) and is
 *            drawn straight onto the arena. Fire that stops at the edge of
 *            the blade does not read as fire.
 *
 * Everything here is driven by clock time and the orb's id, never by the
 * simulation RNG. Cosmetics must not be able to change a seeded match.
 */

const TAU = Math.PI * 2;

/** Masked visuals, in draw order. Anything not listed is drawn loose. */
const MASKED = new Set(['sheen', 'edge', 'frost', 'venom', 'void', 'heft']);

/** Shell visuals that stand off the orb, and so are drawn beneath it. */
const UNDER = new Set(['spikes', 'ward', 'streak', 'crystal']);

export class AugmentFx {
  constructor() {
    // One reusable buffer for every masked effect on every weapon. Sized up
    // on demand and never shrunk, so steady state allocates nothing.
    this.buf = document.createElement('canvas');
    this.bctx = this.buf.getContext('2d');
  }

  /** Is there anything at all to draw for this orb? */
  static has(ball) {
    return !!ball.augments && Object.keys(ball.augments).length > 0;
  }

  /**
   * Weapon coatings, drawn in the weapon's own art-pixel space — the same
   * space the sprite was just drawn in, so everything lines up with the
   * silhouette and therefore with the hitbox.
   */
  weapon(ctx, ball, sprite, time, defs, glow) {
    const aug = ball.augments;
    if (!aug) return;
    const x0 = -sprite.anchorX, y0 = -sprite.anchorY;
    const w = sprite.width, h = sprite.height;
    const seed = ball.id * 2.399963;

    let masked = null;
    for (const [id, level] of Object.entries(aug)) {
      const def = defs.get(id);
      if (!def || def.slot !== 'weapon' || !def.visual) continue;
      if (MASKED.has(def.visual)) (masked || (masked = [])).push([def, level]);
    }

    if (masked) {
      const b = this.buf, bc = this.bctx;
      if (b.width < w || b.height < h) { b.width = Math.max(b.width, w); b.height = Math.max(b.height, h); }
      bc.clearRect(0, 0, b.width, b.height);
      bc.drawImage(sprite, 0, 0);
      // Everything after this lands only where the blade already is.
      bc.globalCompositeOperation = 'source-atop';
      for (const [def, level] of masked) this.maskedPass(bc, def, level, w, h, time, seed);
      bc.globalCompositeOperation = 'source-over';
      ctx.drawImage(b, x0, y0, w, h, x0, y0, w, h);
    }

    for (const [id, level] of Object.entries(aug)) {
      const def = defs.get(id);
      if (!def || def.slot !== 'weapon' || !def.visual || MASKED.has(def.visual)) continue;
      this.loosePass(ctx, def, level, x0, y0, w, h, time, seed, glow);
    }
  }

  maskedPass(bc, def, level, w, h, time, seed) {
    const lv = Math.min(8, level);
    switch (def.visual) {
      case 'sheen': {
        // A mirror finish: a hard white band travels the blade on a loop, with
        // a narrow hot core and a soft falloff either side. More levels make
        // it brighter, wider and more frequent — a polished edge, then a mirror.
        const period = 2.4 - Math.min(1.5, lv * 0.19);
        const t = ((time / period) + seed) % 1;
        // Travels well past both ends so it enters and leaves rather than
        // appearing and vanishing at the tip.
        const cx = -w * 0.45 + t * (w * 1.9);
        const band = w * (0.10 + lv * 0.012);
        const g = bc.createLinearGradient(cx - band, 0, cx + band, 0);
        const peak = Math.min(0.95, 0.30 + lv * 0.085);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.42, `rgba(255,255,255,${(peak * 0.45).toFixed(3)})`);
        g.addColorStop(0.5, `rgba(255,255,255,${peak.toFixed(3)})`);
        g.addColorStop(0.58, `rgba(255,255,255,${(peak * 0.45).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        bc.fillStyle = g;
        bc.fillRect(0, 0, w, h);
        break;
      }
      case 'edge': {
        // A hot line along the cutting edge — the top third of the sprite.
        const a = Math.min(0.8, 0.22 + lv * 0.07);
        const g = bc.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, `rgba(255,248,214,${a.toFixed(3)})`);
        g.addColorStop(0.34, 'rgba(255,248,214,0)');
        bc.fillStyle = g;
        bc.fillRect(0, 0, w, h);
        break;
      }
      case 'frost': {
        const a = Math.min(0.62, 0.16 + lv * 0.06);
        bc.fillStyle = `rgba(190,232,255,${a.toFixed(3)})`;
        bc.fillRect(0, 0, w, h);
        // Rime gathers toward the tip, where it would actually collect.
        const g = bc.createLinearGradient(w * 0.45, 0, w, 0);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(1, `rgba(255,255,255,${(a * 0.9).toFixed(3)})`);
        bc.fillStyle = g;
        bc.fillRect(0, 0, w, h);
        break;
      }
      case 'venom': {
        const a = Math.min(0.6, 0.16 + lv * 0.06);
        bc.fillStyle = `rgba(132,204,22,${a.toFixed(3)})`;
        bc.fillRect(0, 0, w, h);
        break;
      }
      case 'void': {
        const a = Math.min(0.72, 0.2 + lv * 0.07);
        bc.fillStyle = `rgba(30,8,46,${a.toFixed(3)})`;
        bc.fillRect(0, 0, w, h);
        // A violet rim crawls along it so the darkness still reads as a blade.
        const t = ((time * 0.35) + seed) % 1;
        const g = bc.createLinearGradient(t * w - w * 0.3, 0, t * w + w * 0.3, 0);
        g.addColorStop(0, 'rgba(168,85,247,0)');
        g.addColorStop(0.5, `rgba(168,85,247,${(a * 0.55).toFixed(3)})`);
        g.addColorStop(1, 'rgba(168,85,247,0)');
        bc.fillStyle = g;
        bc.fillRect(0, 0, w, h);
        break;
      }
      case 'heft': {
        // Counterweight bands across the haft — the inner third.
        bc.fillStyle = 'rgba(28,25,23,0.62)';
        const bands = Math.min(4, 1 + Math.floor(lv / 2));
        for (let i = 0; i < bands; i++) {
          bc.fillRect(w * (0.06 + i * 0.085), 0, Math.max(1, w * 0.035), h);
        }
        break;
      }
      default: break;
    }
  }

  loosePass(ctx, def, level, x0, y0, w, h, time, seed, glow) {
    const lv = Math.min(8, level);
    // Additive blending is right on the neon theme, where it makes fire and
    // current glow. On the pale arena it blows every colour out to white, so
    // fire stops looking like fire — there, blend normally and let the
    // saturated colours carry it.
    const blend = glow ? 'lighter' : 'source-over';
    switch (def.visual) {
      case 'flame': {
        // Tongues of fire along the blade, each on its own phase so the
        // silhouette flickers rather than pulsing as one block.
        const n = 3 + Math.min(6, lv);
        ctx.globalCompositeOperation = blend;
        for (let i = 0; i < n; i++) {
          const p = (i + 0.5) / n;
          const fx = x0 + w * (0.18 + p * 0.82);
          const phase = time * 7 + i * 1.9 + seed;
          const lick = (0.55 + 0.45 * Math.sin(phase)) * h * (0.7 + lv * 0.16);
          const wob = Math.cos(phase * 0.8) * h * 0.18;
          const grad = ctx.createLinearGradient(fx, y0 + h * 0.5, fx + wob, y0 + h * 0.5 - lick);
          grad.addColorStop(0, `rgba(255,196,60,${Math.min(0.95, 0.5 + lv * 0.06).toFixed(3)})`);
          grad.addColorStop(0.4, 'rgba(234,88,12,0.8)');
          grad.addColorStop(0.75, 'rgba(190,24,24,0.45)');
          grad.addColorStop(1, 'rgba(120,10,10,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(fx - h * 0.22, y0 + h * 0.62);
          ctx.quadraticCurveTo(fx + wob * 0.5, y0 + h * 0.5 - lick * 0.6,
                               fx + wob, y0 + h * 0.5 - lick);
          ctx.quadraticCurveTo(fx + wob * 0.5 + h * 0.12, y0 + h * 0.5 - lick * 0.5,
                               fx + h * 0.22, y0 + h * 0.62);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'shock': {
        // Current crawling the length of the weapon: a jagged polyline that
        // re-seeds every few frames rather than every frame, so it crackles
        // instead of buzzing.
        const step = Math.floor(time * 18);
        ctx.globalCompositeOperation = blend;
        const arcs = 1 + Math.min(3, Math.floor(lv / 2));
        for (let a = 0; a < arcs; a++) {
          ctx.strokeStyle = a === 0
            ? (glow ? 'rgba(255,255,255,0.9)' : 'rgba(250,204,21,0.95)')
            : (glow ? 'rgba(250,204,21,0.75)' : 'rgba(180,83,9,0.8)');
          ctx.lineWidth = Math.max(0.6, h * 0.07);
          ctx.beginPath();
          const segs = 6;
          for (let i = 0; i <= segs; i++) {
            const p = i / segs;
            const px = x0 + w * (0.15 + p * 0.85);
            // Deterministic hash: same inputs, same bolt.
            const nz = Math.sin((step * 12.9898) + i * 78.233 + a * 37.719 + seed) * 43758.5453;
            const py = y0 + h * 0.5 + ((nz - Math.floor(nz)) - 0.5) * h * (0.9 + lv * 0.1);
            i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          }
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'extend': {
        // Segmented extension at the grip, so Reaching is visible as hardware
        // rather than only as a longer sprite.
        const segs = Math.min(6, lv);
        ctx.fillStyle = 'rgba(148,163,184,0.85)';
        ctx.strokeStyle = 'rgba(15,23,42,0.6)';
        ctx.lineWidth = Math.max(0.5, h * 0.05);
        for (let i = 0; i < segs; i++) {
          const sx = x0 - (i + 1) * w * 0.045;
          ctx.fillRect(sx, y0 + h * 0.34, w * 0.035, h * 0.32);
          ctx.strokeRect(sx, y0 + h * 0.34, w * 0.035, h * 0.32);
        }
        break;
      }
      default: break;
    }
  }

  /**
   * Armour and core coatings, drawn in the orb's local space with the orb
   * centred on the origin and `r` its current radius.
   */
  shell(ctx, ball, r, time, defs, layer) {
    const aug = ball.augments;
    if (!aug) return;
    const seed = ball.id * 1.7320508;

    for (const [id, level] of Object.entries(aug)) {
      const def = defs.get(id);
      if (!def || !def.visual || def.slot === 'weapon') continue;
      if ((UNDER.has(def.visual) ? 'under' : 'over') !== layer) continue;
      const lv = Math.min(8, level);

      switch (def.visual) {
        case 'plated': {
          // Overlapping plates around the rim; more plates each level.
          const n = 5 + lv;
          const band = Math.max(2, r * (0.07 + lv * 0.008));
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + seed * 0.3;
            // Two strokes per plate: a dark seam with a lighter face, which
            // is what makes overlapping metal read as overlapping metal.
            ctx.strokeStyle = 'rgba(15,23,42,0.5)';
            ctx.lineWidth = band;
            ctx.beginPath();
            ctx.arc(0, 0, r - band * 0.5, a, a + TAU / n * 0.78);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(226,232,240,0.8)';
            ctx.lineWidth = band * 0.5;
            ctx.beginPath();
            ctx.arc(0, 0, r - band * 0.72, a + 0.04, a + TAU / n * 0.7);
            ctx.stroke();
          }
          break;
        }
        case 'ward': {
          // Runes on a slow orbit, pulsing together.
          const n = 3 + Math.min(5, lv);
          const pulse = 0.55 + 0.45 * Math.sin(time * 2.2 + seed);
          ctx.fillStyle = `rgba(129,140,248,${(0.35 + lv * 0.06) * pulse})`;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + time * 0.5 + seed;
            const rx = Math.cos(a) * r * 1.07, ry = Math.sin(a) * r * 1.07;
            ctx.save();
            ctx.translate(rx, ry);
            ctx.rotate(a);
            ctx.fillRect(-r * 0.035, -r * 0.1, r * 0.07, r * 0.2);
            ctx.restore();
          }
          break;
        }
        case 'molten': {
          // Cracks that breathe, as though something hot is behind the shell.
          const glow = 0.5 + 0.5 * Math.sin(time * 1.7 + seed);
          ctx.strokeStyle = `rgba(239,68,68,${(0.4 + lv * 0.07) * glow})`;
          ctx.lineWidth = Math.max(1.2, r * 0.045);
          const n = 3 + Math.min(5, lv);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + seed;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
            ctx.lineTo(Math.cos(a + 0.35) * r * 0.85, Math.sin(a + 0.35) * r * 0.85);
            ctx.stroke();
          }
          break;
        }
        case 'crystal': {
          // Facets standing off the shell.
          const n = 4 + Math.min(6, lv);
          ctx.fillStyle = `rgba(103,232,249,${Math.min(0.8, 0.35 + lv * 0.06)})`;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + seed * 0.7;
            const len = r * (0.09 + lv * 0.013);
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            ctx.lineTo(Math.cos(a + 0.18) * (r + len), Math.sin(a + 0.18) * (r + len));
            ctx.lineTo(Math.cos(a + 0.36) * r, Math.sin(a + 0.36) * r);
            ctx.closePath();
            ctx.fill();
          }
          break;
        }
        case 'spikes': {
          // Narrow and short. Earlier these were wide enough to read as
          // ribbons hanging off the orb rather than spines set into it.
          const n = 8 + Math.min(10, lv * 2);
          ctx.fillStyle = 'rgba(190,24,60,0.95)';
          const half = TAU / n * 0.16;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + seed * 0.5;
            const len = r * (0.07 + lv * 0.012);
            ctx.beginPath();
            ctx.moveTo(Math.cos(a - half) * r * 0.99, Math.sin(a - half) * r * 0.99);
            ctx.lineTo(Math.cos(a) * (r + len), Math.sin(a) * (r + len));
            ctx.lineTo(Math.cos(a + half) * r * 0.99, Math.sin(a + half) * r * 0.99);
            ctx.closePath();
            ctx.fill();
          }
          break;
        }
        case 'anchor': {
          ctx.strokeStyle = `rgba(161,98,7,${Math.min(0.9, 0.45 + lv * 0.06)})`;
          ctx.lineWidth = Math.max(2, r * (0.07 + lv * 0.008));
          for (let i = 0; i < 2; i++) {
            ctx.beginPath();
            ctx.arc(0, 0, r * (0.72 + i * 0.16), 0, TAU);
            ctx.stroke();
          }
          break;
        }
        case 'pulse': {
          // The charge ring: faster and brighter the more it is overcharged.
          const speed = 1.4 + lv * 0.35;
          const p = (time * speed + seed) % 1;
          ctx.strokeStyle = `rgba(253,224,71,${(1 - p) * Math.min(0.9, 0.4 + lv * 0.07)})`;
          ctx.lineWidth = Math.max(1.5, r * 0.06);
          ctx.beginPath();
          ctx.arc(0, 0, r * (0.25 + p * 0.7), 0, TAU);
          ctx.stroke();
          break;
        }
        case 'streak': {
          ctx.fillStyle = `rgba(34,211,238,${Math.min(0.5, 0.14 + lv * 0.04)})`;
          for (let i = 1; i <= Math.min(4, lv); i++) {
            ctx.beginPath();
            ctx.arc(-i * r * 0.2, 0, r * (1 - i * 0.16), 0, TAU);
            ctx.fill();
          }
          break;
        }
        case 'bloom': {
          const breathe = 0.5 + 0.5 * Math.sin(time * 1.3 + seed);
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.8);
          g.addColorStop(0, `rgba(74,222,128,${(0.2 + lv * 0.05) * breathe})`);
          g.addColorStop(1, 'rgba(74,222,128,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.8, 0, TAU);
          ctx.fill();
          break;
        }
        default: break;
      }
    }
  }
}
