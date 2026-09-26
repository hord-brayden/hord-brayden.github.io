/* Procedural pixel-art weapons.
 *
 * Each silhouette is drawn once into a tiny offscreen canvas (a few dozen
 * logical pixels across) and then blown up with smoothing disabled. That
 * gives genuine chunky pixel art rather than a scaled-down photo of a sword,
 * and it costs one drawImage per weapon per frame at runtime.
 *
 * A silhouette draws into a normalised space with the GRIP at (0, h/2) and
 * the business end pointing along +X. The engine rotates around the grip,
 * so a weapon always swings the way a real one on a chain would.
 *
 * To add a weapon: Weapons.define({ id, w, h, draw(p, pal) }). Nothing else
 * changes — the element that references it picks it up by id.
 */

import { Registry } from '../core/registry.js';

export const Weapons = new Registry('weapon', {
  defaults: { w: 30, h: 18, hitRadius: 0.34, heavy: false },
  required: ['draw'],
});

/* ------------------------------------------------------------ pixel api */

/** Minimal drawing surface passed to every silhouette. Integer pixels only. */
function pixelApi(ctx, w, h) {
  return {
    w, h,
    cy: (h / 2) | 0,
    px(x, y, c) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      ctx.fillStyle = c;
      ctx.fillRect(x | 0, y | 0, 1, 1);
    },
    rect(x, y, rw, rh, c) {
      ctx.fillStyle = c;
      ctx.fillRect(x | 0, y | 0, rw | 0, rh | 0);
    },
    /** Bresenham, so diagonals stay crisp instead of anti-aliasing. */
    line(x0, y0, x1, y1, c) {
      x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
      const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
      const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        this.px(x0, y0, c);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    },
    /** A tapered blade: thick at `x0`, narrowing to a point at `x1`. */
    blade(x0, x1, halfStart, pal, { edgeTop = true } = {}) {
      const len = x1 - x0;
      for (let i = 0; i <= len; i++) {
        const t = i / len;
        const half = Math.max(0.5, halfStart * (1 - t * t * 0.85));
        const top = Math.round(this.cy - half);
        const bot = Math.round(this.cy + half);
        for (let y = top; y <= bot; y++) {
          // Light catches the upper edge, shadow pools along the lower one.
          let c = pal.mid;
          if (y === top && edgeTop) c = pal.light;
          else if (y === bot) c = pal.dark;
          else if (y < this.cy) c = pal.light;
          this.px(x0 + i, y, c);
        }
      }
    },
    /** Wraps the filled shape in a 1px outline — the look the source art uses. */
    outline(c) {
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
      const edges = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (solid(x, y)) continue;
          if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
            edges.push(x, y);
          }
        }
      }
      ctx.fillStyle = c;
      for (let i = 0; i < edges.length; i += 2) ctx.fillRect(edges[i], edges[i + 1], 1, 1);
    },
  };
}

/** Standard wrapped grip: the bit the chain attaches to. */
function grip(p, len, pal) {
  p.rect(0, p.cy - 1, len, 3, pal.hilt);
  p.rect(0, p.cy - 1, len, 1, pal.hiltLight);
  for (let x = 1; x < len; x += 2) p.px(x, p.cy + 1, pal.hiltDark);
}

/* ------------------------------------------------------------ blades */

Weapons.defineAll([
  {
    id: 'sword',
    w: 32, h: 16,
    draw(p, pal) {
      grip(p, 7, pal);
      p.rect(7, p.cy - 4, 2, 9, pal.hiltDark);   // crossguard
      p.rect(7, p.cy - 4, 2, 2, pal.accent);
      p.rect(7, p.cy + 3, 2, 2, pal.accent);
      p.blade(9, 31, 3.2, pal);
    },
  },
  {
    id: 'katana',
    w: 34, h: 14,
    draw(p, pal) {
      grip(p, 9, pal);
      p.rect(9, p.cy - 3, 1, 7, pal.accent);
      // Curved back gives the blade its silhouette; the edge stays straight.
      for (let i = 0; i < 24; i++) {
        const x = 10 + i;
        const lift = Math.round(Math.pow(i / 24, 1.7) * 3);
        const top = p.cy - 2 - lift;
        const bot = p.cy + 1 - lift - (i > 20 ? i - 20 : 0);
        for (let y = top; y <= bot; y++) {
          p.px(x, y, y === top ? pal.light : y === bot ? pal.dark : pal.mid);
        }
      }
    },
  },
  {
    id: 'dagger',
    w: 20, h: 12,
    hitRadius: 0.3,
    draw(p, pal) {
      grip(p, 5, pal);
      p.rect(5, p.cy - 2, 1, 5, pal.hiltDark);
      p.blade(6, 19, 2.2, pal);
    },
  },
  {
    id: 'greatsword',
    w: 38, h: 22,
    hitRadius: 0.42, heavy: true,
    draw(p, pal) {
      grip(p, 9, pal);
      p.rect(9, p.cy - 6, 3, 13, pal.hiltDark);
      p.rect(9, p.cy - 6, 3, 2, pal.accent);
      p.rect(9, p.cy + 5, 3, 2, pal.accent);
      p.blade(12, 37, 5, pal);
      p.line(14, p.cy, 33, p.cy, pal.accent);   // fuller
    },
  },
]);

/* ------------------------------------------------------------ hafted */

Weapons.defineAll([
  {
    id: 'axe',
    w: 32, h: 24,
    hitRadius: 0.42, heavy: true,
    draw(p, pal) {
      grip(p, 19, pal);
      p.rect(17, p.cy - 9, 3, 19, pal.hiltDark);        // haft collar
      // A bearded axe head: the bit sweeps out and down into a crescent,
      // which is the silhouette that reads as "axe". A flat rectangle does not.
      for (let i = 0; i < 11; i++) {
        const t = i / 10;
        // Top edge rises gently; bottom edge drops away into the beard.
        const top = Math.round(p.cy - 5 - t * 5);
        const bot = Math.round(p.cy + 5 + Math.sin(t * Math.PI * 0.85) * 7);
        for (let y = top; y <= bot; y++) {
          const edge = y === top || y === bot || i === 10;
          p.px(20 + i, y, edge ? pal.dark : t > 0.62 ? pal.light : pal.mid);
        }
      }
      // The cutting edge itself, bright along the outer curve.
      for (let i = 0; i < 11; i++) {
        const t = i / 10;
        const bot = Math.round(p.cy + 5 + Math.sin(t * Math.PI * 0.85) * 7);
        p.px(20 + i, bot - 1, pal.light);
      }
      p.rect(17, p.cy - 9, 3, 2, pal.accent);
      p.rect(17, p.cy + 7, 3, 2, pal.accent);
    },
  },
  {
    id: 'hammer',
    w: 28, h: 22,
    hitRadius: 0.44, heavy: true,
    draw(p, pal) {
      grip(p, 16, pal);
      p.rect(15, p.cy - 8, 12, 17, pal.mid);
      p.rect(15, p.cy - 8, 12, 3, pal.light);
      p.rect(15, p.cy + 6, 12, 3, pal.dark);
      p.rect(24, p.cy - 8, 3, 17, pal.accent);
      p.rect(18, p.cy - 4, 4, 4, pal.light);   // rivet highlight
    },
  },
  {
    id: 'spear',
    w: 38, h: 12,
    hitRadius: 0.28,
    draw(p, pal) {
      grip(p, 26, pal);
      p.rect(24, p.cy - 2, 2, 5, pal.accent);
      p.blade(26, 37, 3, pal);
    },
  },
  {
    id: 'trident',
    w: 34, h: 22,
    hitRadius: 0.38,
    draw(p, pal) {
      grip(p, 20, pal);
      p.rect(19, p.cy - 7, 3, 15, pal.mid);
      for (const off of [-7, 0, 7]) {
        const len = off === 0 ? 13 : 10;
        p.rect(22, p.cy + off - 1, len, 3, pal.mid);
        p.rect(22, p.cy + off - 1, len, 1, pal.light);
        p.rect(22 + len, p.cy + off - 1, 1, 3, pal.accent);
      }
    },
  },
  {
    id: 'scythe',
    w: 36, h: 28,
    hitRadius: 0.4, heavy: true,
    draw(p, pal) {
      grip(p, 21, pal);
      // The blade has to start *at* the haft, or it reads as two objects. A
      // socket joins them, then the blade sweeps forward and up in an arc
      // that thins toward the tip.
      p.rect(19, p.cy - 3, 5, 7, pal.hiltDark);          // socket
      p.rect(19, p.cy - 3, 5, 2, pal.accent);
      const cx = 21, cy = p.cy + 9, r = 17;
      for (let a = -Math.PI * 0.58; a <= -0.02; a += 0.012) {
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        // Thickness falls off toward the tip.
        const t = (a + Math.PI * 0.58) / (Math.PI * 0.56);
        const thick = Math.max(1, Math.round(3 * (1 - t * 0.7)));
        p.px(x, y, pal.light);
        for (let k = 1; k <= thick; k++) p.px(x, y + k, k === thick ? pal.dark : pal.mid);
      }
    },
  },
  {
    id: 'pitchfork',
    w: 34, h: 22,
    hitRadius: 0.32,
    draw(p, pal) {
      grip(p, 23, pal);
      p.rect(22, p.cy - 8, 3, 17, pal.hiltDark);         // ferrule
      p.rect(22, p.cy - 8, 3, 2, pal.accent);
      // Three tines, not four, and tapered to points — a comb has parallel
      // teeth, a pitchfork has spikes that splay.
      for (const off of [-6, 0, 6]) {
        const tipY = p.cy + Math.round(off * 1.25);
        for (let i = 0; i < 9; i++) {
          const x = 25 + i;
          const y = Math.round(p.cy + off + (tipY - (p.cy + off)) * (i / 8));
          p.px(x, y, pal.light);
          if (i < 6) p.px(x, y + 1, pal.mid);
          if (i < 3) p.px(x, y + 2, pal.dark);
        }
      }
    },
  },
  {
    id: 'club',
    w: 28, h: 22,
    hitRadius: 0.42, heavy: true,
    draw(p, pal) {
      grip(p, 8, pal);
      // A knobkerrie: a thin shaft that swells into a rounded head. The
      // previous version tapered straight out to a flat cap, which reads as
      // a wedge rather than as something you hit people with.
      for (let i = 0; i < 20; i++) {
        const x = 8 + i;
        const t = i / 19;
        let half;
        if (t < 0.45) half = 2 + t * 2;                       // shaft
        else {
          // Head: a circular lobe, so it ends round instead of flat.
          const u = (t - 0.45) / 0.55;
          half = 3 + Math.sqrt(Math.max(0, 1 - (u - 0.55) * (u - 0.55) / 0.3)) * 6;
        }
        half = Math.max(1, Math.round(half));
        for (let y = p.cy - half; y <= p.cy + half; y++) {
          const rim = y === p.cy - half || y === p.cy + half;
          p.px(x, y, rim ? pal.dark : y < p.cy - 2 ? pal.light : pal.mid);
        }
      }
      // Grain and knots so it reads as wood.
      for (const [kx, ky] of [[14, -3], [17, 2], [20, -4], [22, 3]]) p.px(kx, p.cy + ky, pal.dark);
      // Iron studs ringing the head.
      for (const ky of [-5, 0, 5]) p.px(23, p.cy + ky, pal.accent);
    },
  },
  {
    id: 'staff',
    w: 34, h: 22,
    hitRadius: 0.36,
    draw(p, pal) {
      grip(p, 24, pal);
      p.rect(23, p.cy - 1, 4, 3, pal.mid);
      // Orb at the head — the glow is the element's own colour.
      const cx = 29, cy = p.cy, r = 5;
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          const d = Math.hypot(x, y);
          if (d > r) continue;
          p.px(cx + x, cy + y, d > r - 1.2 ? pal.dark : d < r * 0.4 ? pal.light : pal.accent);
        }
      }
    },
  },
]);

/* ------------------------------------------------------------ exotic */

Weapons.defineAll([
  {
    id: 'shuriken',
    w: 22, h: 22,
    hitRadius: 0.46,
    draw(p, pal) {
      const c = 11;
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        const dx = Math.cos(a), dy = Math.sin(a);
        for (let r = 0; r < 10; r++) {
          const half = Math.max(0, 3 - Math.round(r * 0.32));
          for (let o = -half; o <= half; o++) {
            p.px(c + dx * r - dy * o, c + dy * r + dx * o, r > 7 ? pal.light : pal.mid);
          }
        }
      }
      p.rect(c - 2, c - 2, 5, 5, pal.dark);
      p.rect(c - 1, c - 1, 3, 3, pal.accent);
    },
  },
  {
    id: 'chakram',
    w: 24, h: 24,
    hitRadius: 0.48,
    draw(p, pal) {
      const c = 12, r = 11;
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          const d = Math.hypot(x, y);
          if (d > r || d < r - 3.4) continue;
          p.px(c + x, c + y, d > r - 1.2 ? pal.light : d < r - 2.6 ? pal.dark : pal.mid);
        }
      }
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        p.px(c + Math.cos(a) * (r - 1.5), c + Math.sin(a) * (r - 1.5), pal.accent);
      }
    },
  },
  {
    id: 'wrench',
    w: 30, h: 16,
    hitRadius: 0.36,
    draw(p, pal) {
      grip(p, 16, pal);
      p.rect(14, p.cy - 3, 10, 7, pal.mid);
      p.rect(14, p.cy - 3, 10, 2, pal.light);
      p.rect(24, p.cy - 5, 5, 4, pal.mid);   // open jaw
      p.rect(24, p.cy + 2, 5, 4, pal.mid);
      p.rect(24, p.cy - 5, 5, 1, pal.light);
      p.rect(27, p.cy - 1, 2, 3, pal.accent);
    },
  },
  {
    id: 'gauntlet',
    w: 26, h: 22,
    hitRadius: 0.44, heavy: true,
    draw(p, pal) {
      grip(p, 5, pal);
      // A closed armoured fist, knuckles forward. Read from the back of the
      // hand: cuff, then the wrist plate, then four knuckles with the thumb
      // folded across the near side.
      p.rect(5, p.cy - 7, 3, 15, pal.dark);            // cuff
      p.rect(5, p.cy - 7, 3, 2, pal.accent);
      p.rect(8, p.cy - 8, 8, 17, pal.mid);             // back of the hand
      p.rect(8, p.cy - 8, 8, 3, pal.light);            // top highlight
      p.rect(8, p.cy + 6, 8, 3, pal.dark);             // underside shadow
      // Four knuckle plates, each domed, with a gap between them so the
      // fingers read as separate rather than as one block.
      for (let f = 0; f < 4; f++) {
        const y = p.cy - 7 + f * 4;
        p.rect(16, y, 6, 3, f === 0 ? pal.light : pal.mid);
        p.rect(22, y, 2, 3, pal.accent);               // studded knuckle
        p.px(15, y + 1, pal.dark);                     // finger seam
      }
      // Thumb, folded across the front.
      p.rect(10, p.cy + 5, 7, 4, pal.mid);
      p.rect(10, p.cy + 5, 7, 1, pal.light);
      p.rect(16, p.cy + 5, 2, 4, pal.dark);
    },
  },
  {
    id: 'bone',
    w: 28, h: 16,
    hitRadius: 0.38,
    draw(p, pal) {
      p.rect(4, p.cy - 1, 20, 4, pal.mid);
      p.rect(4, p.cy - 1, 20, 1, pal.light);
      for (const x of [0, 22]) {
        p.rect(x, p.cy - 4, 6, 4, pal.mid);
        p.rect(x, p.cy + 2, 6, 4, pal.mid);
        p.rect(x, p.cy - 4, 6, 1, pal.light);
      }
      p.px(25, p.cy, pal.accent);
    },
  },
]);

/* ------------------------------------------------------------ arsenal */

Weapons.defineAll([
  {
    id: 'rapier',
    w: 36, h: 12,
    hitRadius: 0.26,
    draw(p, pal) {
      grip(p, 6, pal);
      // Swept bell guard — the silhouette that says "rapier" and not "sword".
      for (let a = -1.5; a <= 1.5; a += 0.12) {
        p.px(6 + Math.cos(a) * 3, p.cy + Math.sin(a) * 4, pal.accent);
        p.px(7 + Math.cos(a) * 3, p.cy + Math.sin(a) * 4, pal.accent);
      }
      // Needle blade: near-constant width, tapering only at the very tip.
      for (let x = 9; x < 35; x++) {
        const thin = x > 31 ? 0 : 1;
        for (let y = p.cy - thin; y <= p.cy + thin; y++) {
          p.px(x, y, y < p.cy ? pal.light : y > p.cy ? pal.dark : pal.mid);
        }
      }
    },
  },
  {
    id: 'bow',
    w: 26, h: 28,
    hitRadius: 0.34,
    draw(p, pal) {
      // Limbs drawn as an arc, string as a straight chord across it.
      const cx = 8, cy = p.cy, r = 12;
      for (let a = -1.15; a <= 1.15; a += 0.03) {
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        p.px(x, y, pal.mid);
        p.px(x + 1, y, pal.light);
      }
      p.line(cx + Math.cos(-1.15) * r, cy + Math.sin(-1.15) * r,
             cx + Math.cos(1.15) * r, cy + Math.sin(1.15) * r, pal.hiltLight);
      // Nocked arrow.
      p.rect(6, cy, 18, 1, pal.hilt);
      p.rect(22, cy - 1, 3, 3, pal.accent);
      p.px(25, cy, pal.light);
    },
  },
  {
    id: 'vial',
    w: 20, h: 20,
    hitRadius: 0.42,
    draw(p, pal) {
      grip(p, 4, pal);
      p.rect(5, p.cy - 2, 3, 5, pal.hiltDark);      // cork and neck
      p.rect(4, p.cy - 3, 2, 7, pal.hilt);
      // Round-bottomed flask with the brew sitting in the lower half.
      const cx = 13, cy = p.cy, r = 6;
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          const d = Math.hypot(x, y);
          if (d > r) continue;
          p.px(cx + x, cy + y, d > r - 1 ? pal.dark : y > 0 ? pal.accent : pal.light);
        }
      }
      p.px(cx - 2, cy - 3, pal.light);              // glass glint
    },
  },
  {
    id: 'flask',
    w: 22, h: 22,
    hitRadius: 0.44,
    draw(p, pal) {
      grip(p, 4, pal);
      // A round bomb with a fuse, not a funnel. The circle is the silhouette
      // that reads at 20 pixels; the fuse and spark say what it does.
      const cx = 12, cy = p.cy, r = 7;
      for (let y = -r; y <= r; y++) {
        const hw = Math.round(Math.sqrt(Math.max(0, r * r - y * y)));
        for (let x = -hw; x <= hw; x++) {
          const edge = hw - Math.abs(x) < 1 || Math.abs(y) === r;
          p.px(cx + x, cy + y, edge ? pal.dark : (x + y < -3 ? pal.light : pal.mid));
        }
      }
      // Banding across the shell so it does not read as a plain ball.
      p.rect(cx - 6, cy - 1, 13, 2, pal.accent);
      // Neck and cork at the top-left, where the grip meets it.
      p.rect(5, cy - 2, 4, 4, pal.hiltDark);
      p.rect(4, cy - 3, 2, 6, pal.hilt);
      // Fuse, curling up and away, with a lit spark at the tip.
      p.line(cx + 2, cy - 7, cx + 5, cy - 10, pal.dark);
      p.line(cx + 5, cy - 10, cx + 8, cy - 9, pal.dark);
      p.px(cx + 9, cy - 9, pal.accent);
      p.px(cx + 9, cy - 10, pal.light);
      p.px(cx + 10, cy - 9, pal.light);
    },
  },
  {
    id: 'shield',
    w: 26, h: 30,
    hitRadius: 0.48, heavy: true,
    draw(p, pal) {
      grip(p, 6, pal);
      // A heater shield seen face-on: square shoulders, straight sides, and a
      // long taper to a point.
      const x0 = 6, cols = 19;
      const halfAt = (i) => {
        const t = i / (cols - 1);
        if (t < 0.34) return 13;
        const u = (t - 0.34) / 0.66;
        return Math.max(1, Math.round(13 * Math.sqrt(1 - u * u)));
      };
      for (let i = 0; i < cols; i++) {
        const half = halfAt(i);
        for (let y = p.cy - half; y <= p.cy + half; y++) {
          const rim = y === p.cy - half || y === p.cy + half || i === cols - 1;
          // Shading in thirds. An earlier version put everything below centre
          // in shadow, which read as a shield half-swallowed by the dark.
          let c = pal.mid;
          if (rim) c = pal.dark;
          else if (y < p.cy - 5) c = pal.light;
          else if (y > p.cy + 8) c = pal.dark;
          p.px(x0 + i, y, c);
        }
      }
      p.rect(x0, p.cy - 13, 2, 27, pal.dark);
      p.rect(x0 + 2, p.cy - 13, 1, 27, pal.light);
      // Boss: a raised dome at the centre of mass.
      for (let dy = -3; dy <= 3; dy++) {
        const hw = Math.round(Math.sqrt(Math.max(0, 9 - dy * dy)));
        for (let dx = -hw; dx <= hw; dx++) {
          p.px(x0 + 7 + dx, p.cy + dy, dy < 0 ? pal.accent : pal.mid);
        }
      }
      for (const [rx, ry] of [[2, -10], [2, 10], [8, -11], [8, 11], [13, -7], [13, 7]]) {
        p.px(x0 + rx, p.cy + ry, pal.accent);
      }
    },
  },
  {
    id: 'caltrop',
    w: 18, h: 18,
    hitRadius: 0.44,
    draw(p, pal) {
      const c = 9;
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3 - Math.PI / 2;
        for (let r = 0; r < 8; r++) {
          const half = Math.max(0, 2 - Math.round(r * 0.28));
          const dx = Math.cos(a), dy = Math.sin(a);
          for (let o = -half; o <= half; o++) {
            p.px(c + dx * r - dy * o, c + dy * r + dx * o, r > 5 ? pal.light : pal.mid);
          }
        }
      }
      p.rect(c - 2, c - 2, 4, 4, pal.dark);
      p.px(c, c, pal.accent);
    },
  },
]);

/* ------------------------------------------------------------- stats */

/*
 * The derived numbers the engine actually uses, in a form a person can read.
 *
 * These are not decorative: they are computed with the same constants
 * core/engine.js uses, so the Codex cannot quietly disagree with the
 * simulation. Length is the single most important figure — it decides how
 * often a weapon meets anything — and it is deliberately compressed toward
 * the mean, with the difference paid back as damage and recovery speed.
 */
const LENGTH_COMPRESSION = 0.5;
const WEAPON_LENGTH_PER_RADIUS = 2.15;

function compressedRatio(raw) { return 0.9 + (raw - 0.9) * LENGTH_COMPRESSION; }

export function weaponStats(id) {
  const def = Weapons.require(id);
  const raw = def.w / 30;
  const reach = WEAPON_LENGTH_PER_RADIUS * compressedRatio(raw);
  const damage = 0.86 + raw * 0.24;
  const cooldown = (0.74 + raw * 0.32) * (def.heavy ? 0.34 : 0.24);
  const thickness = def.h * def.hitRadius;
  return {
    raw,
    reachValue: reach,
    damageValue: damage * (def.heavy ? 1.12 : 1),
    cooldownValue: cooldown,
    thicknessValue: thickness,
    // Display forms.
    reach: `${reach.toFixed(2)}x orb radius`,
    damage: `${Math.round((damage * (def.heavy ? 1.12 : 1)) * 100)}%`,
    recovery: `${cooldown.toFixed(2)}s between hits`,
    hitbox: `${thickness.toFixed(1)} units thick`,
    heavy: !!def.heavy,
    size: `${def.w}x${def.h}`,
  };
}

/* ------------------------------------------------------------ labels */

/* Ids are terse because they are typed in definitions and packed into share
 * URLs; these are what a person should actually read in a dropdown. */
const LABELS = {
  sword: 'Sword', katana: 'Katana', dagger: 'Dagger', greatsword: 'Greatsword',
  axe: 'Axe', hammer: 'Warhammer', spear: 'Spear', trident: 'Trident',
  scythe: 'Scythe', pitchfork: 'Pitchfork', club: 'Club', staff: 'Staff',
  shuriken: 'Shuriken', chakram: 'Chakram', wrench: 'Wrench',
  gauntlet: 'Gauntlet', bone: 'Bone', rapier: 'Rapier', bow: 'Bow',
  vial: 'Potion Vial', flask: 'Throwing Flask', shield: 'Shield',
  caltrop: 'Caltrop',
};

export function weaponLabel(id) {
  return LABELS[id] || id.replace(/(^|[-_])(\w)/g, (_, s, c) => (s ? ' ' : '') + c.toUpperCase());
}

/* ------------------------------------------------------------ baking */

const bakeCache = new Map();

/**
 * Render a silhouette at `scale` device pixels per art pixel.
 * Cached — a given (weapon, palette, scale, outline) combination is only
 * ever rasterised once for the lifetime of the page.
 */
export function bakeWeapon(weaponId, pal, scale, outlineColor) {
  // Guard the contract rather than trusting callers: a NaN or zero scale
  // produces a zero-size canvas, and drawImage throws on one of those.
  scale = Number.isFinite(scale) ? Math.max(1, Math.min(8, Math.round(scale))) : 1;
  const key = `${weaponId}|${pal.key}|${scale}|${outlineColor || '-'}`;
  const hit = bakeCache.get(key);
  if (hit) return hit;

  const def = Weapons.require(weaponId);
  const pad = outlineColor ? 1 : 0;
  const w = def.w + pad * 2;
  const h = def.h + pad * 2;

  const lo = document.createElement('canvas');
  lo.width = w; lo.height = h;
  const lctx = lo.getContext('2d');
  lctx.translate(pad, pad);
  def.draw(pixelApi(lctx, def.w, def.h), pal);
  if (outlineColor) {
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    pixelApi(lctx, w, h).outline(outlineColor);
  }

  const out = document.createElement('canvas');
  out.width = w * scale;
  out.height = h * scale;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = false;
  octx.drawImage(lo, 0, 0, out.width, out.height);

  // Where the chain attaches, and how far the head sits from it — both in
  // device pixels, so the engine never has to know about art-pixel units.
  out.anchorX = pad * scale;
  out.anchorY = (pad + def.h / 2) * scale;
  out.reach = def.w * scale;
  out.hitRadius = def.h * def.hitRadius * scale;

  bakeCache.set(key, out);
  return out;
}

export function clearWeaponCache() {
  bakeCache.clear();
}
