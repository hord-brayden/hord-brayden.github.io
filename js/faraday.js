/* Faraday page scripts: the cage animation and the ticker loop. No dependencies. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Ticker: duplicate the track once so translateX(-50%) loops seamlessly. */
  document.querySelectorAll('.ticker-track').forEach(function (t) {
    if (reduce) return;
    t.innerHTML += t.innerHTML;
    Array.prototype.slice.call(t.children, t.children.length / 2).forEach(function (c) { c.setAttribute('aria-hidden', 'true'); });
  });

  /* The cage: a page inside a copper lattice. Tags fire requests at the wall;
     the wall catches every one. Tags that respect the "no" don't fire at all. */
  var canvas = document.getElementById('cage');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var caughtEl = document.getElementById('caught');
  var C = { ink: '#141210', paper: '#f3eee3', surface: '#fffcf5', copper: '#c4713a', copper2: '#e39a62', red: '#ff4b3e', yellow: '#ffd83d', green: '#12b76a', blue: '#3d5afe', orange: '#f79009', muted: '#8a8174' };
  var TAGS = [
    { name: 'analytics', c: C.orange, leaks: false, fx: 0.12, fy: 0.50 },
    { name: 'ad tag', c: C.red, leaks: true, fx: 0.56, fy: 0.50 },
    { name: 'social pixel', c: C.blue, leaks: false, fx: 0.12, fy: 0.76 },
    { name: '4th party', c: C.red, leaks: true, fx: 0.56, fy: 0.76 }
  ];
  var W = 0, H = 0, dpr = 1, cage = null, page = null;
  var shots = [], hits = [], caught = 0, frame = 0, running = false, visible = true;

  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function layout() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var m = Math.max(16, Math.min(W, H) * 0.06);
    cage = { x: m, y: m, w: W - m * 2, h: H - m * 2 - 40 };
    var pw = cage.w * 0.66, ph = cage.h * 0.52;
    page = { x: W / 2 - pw / 2, y: cage.y + cage.h / 2 - ph / 2, w: pw, h: ph };
    TAGS.forEach(function (t) { t.x = page.x + page.w * t.fx; t.y = page.y + page.h * t.fy; });
  }

  function edgePoint() {
    // random point on the cage wall
    var p = Math.random() * 2 * (cage.w + cage.h), x, y;
    if (p < cage.w) { x = cage.x + p; y = cage.y; }
    else if (p < cage.w + cage.h) { x = cage.x + cage.w; y = cage.y + (p - cage.w); }
    else if (p < 2 * cage.w + cage.h) { x = cage.x + (p - cage.w - cage.h); y = cage.y + cage.h; }
    else { x = cage.x; y = cage.y + (p - 2 * cage.w - cage.h); }
    return { x: x, y: y };
  }

  function fire(tag) {
    var e = edgePoint();
    var d = Math.hypot(e.x - tag.x, e.y - tag.y);
    shots.push({ x0: tag.x, y0: tag.y, x1: e.x, y1: e.y, p: 0, v: (2.6 + Math.random() * 1.6) / d, c: tag.c });
  }

  function hit(s) {
    hits.push({ x: s.x1, y: s.y1, t: 0, c: s.c });
    caught++;
    if (caughtEl) caughtEl.textContent = caught;
  }

  function drawLattice() {
    ctx.save();
    rr(cage.x, cage.y, cage.w, cage.h, 18); ctx.clip();
    var g = 30;
    ctx.strokeStyle = 'rgba(196,113,58,0.22)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (var x = cage.x + g; x < cage.x + cage.w; x += g) { ctx.moveTo(x, cage.y); ctx.lineTo(x, cage.y + cage.h); }
    for (var y = cage.y + g; y < cage.y + cage.h; y += g) { ctx.moveTo(cage.x, y); ctx.lineTo(cage.x + cage.w, y); }
    ctx.stroke();
    // glows where requests hit
    hits.forEach(function (h) {
      var a = Math.max(0, 1 - h.t / 50);
      var rg = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, 70);
      rg.addColorStop(0, 'rgba(227,154,98,' + (0.55 * a) + ')'); rg.addColorStop(1, 'rgba(227,154,98,0)');
      ctx.fillStyle = rg; ctx.fillRect(h.x - 70, h.y - 70, 140, 140);
    });
    ctx.restore();
    ctx.strokeStyle = C.copper; ctx.lineWidth = 4;
    rr(cage.x, cage.y, cage.w, cage.h, 18); ctx.stroke();
    // rivets
    ctx.fillStyle = C.copper2;
    [[cage.x, cage.y], [cage.x + cage.w, cage.y], [cage.x, cage.y + cage.h], [cage.x + cage.w, cage.y + cage.h]].forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, 7); ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke(); });
  }

  function drawPage() {
    var p = page, fs = Math.max(10, Math.min(13, W / 46));
    ctx.fillStyle = C.ink; rr(p.x + 6, p.y + 6, p.w, p.h, 12); ctx.fill();
    ctx.fillStyle = C.paper; rr(p.x, p.y, p.w, p.h, 12); ctx.fill();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; rr(p.x, p.y, p.w, p.h, 12); ctx.stroke();
    // browser chrome
    ctx.beginPath(); ctx.moveTo(p.x, p.y + 26); ctx.lineTo(p.x + p.w, p.y + 26); ctx.stroke();
    [C.red, C.yellow, C.green].forEach(function (c, i) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p.x + 14 + i * 13, p.y + 13, 4, 0, 7); ctx.fill(); });
    ctx.fillStyle = C.ink; ctx.font = '500 ' + fs + 'px "JetBrains Mono", monospace'; ctx.textBaseline = 'middle';
    ctx.fillText('shop.test/checkout', p.x + 56, p.y + 13.5);
    // consent banner chip
    var label = 'REJECTED ALL';
    ctx.font = '700 ' + fs + 'px "Instrument Sans", sans-serif';
    var tw = ctx.measureText(label).width + 20;
    ctx.fillStyle = C.red; rr(p.x + 12, p.y + 36, tw, 22, 11); ctx.fill(); ctx.strokeStyle = C.ink; ctx.stroke();
    ctx.fillStyle = C.ink; ctx.fillText(label, p.x + 22, p.y + 47.5);
    ctx.fillStyle = '#5d574f'; ctx.font = '600 ' + fs + 'px "Instrument Sans", sans-serif';
    if (p.w > 280) ctx.fillText('visitor: Foolia (synthetic)', p.x + 22 + tw, p.y + 47.5);
    // tag nodes
    TAGS.forEach(function (t) {
      var pulse = t.leaks ? 1 + 0.12 * Math.sin(frame / 8 + t.fx * 10) : 1;
      ctx.beginPath(); ctx.arc(t.x, t.y, 9 * pulse, 0, 7);
      if (t.leaks) { ctx.fillStyle = t.c; ctx.fill(); }
      else { ctx.fillStyle = C.surface; ctx.fill(); ctx.strokeStyle = t.c; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(t.x, t.y, 7, 0, 7); ctx.stroke(); }
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(t.x, t.y, 9 * pulse, 0, 7); ctx.stroke();
      ctx.fillStyle = C.ink; ctx.font = '600 ' + fs + 'px "Instrument Sans", sans-serif';
      ctx.fillText(t.name, t.x + 16, t.y - 1);
      ctx.fillStyle = t.leaks ? '#b42318' : '#0e7a49'; ctx.font = '500 ' + (fs - 1) + 'px "JetBrains Mono", monospace';
      ctx.fillText(t.leaks ? 'ignored "no"' : 'held', t.x + 16, t.y + fs + 1);
    });
  }

  function drawShots() {
    shots.forEach(function (s) {
      var x = s.x0 + (s.x1 - s.x0) * s.p, y = s.y0 + (s.y1 - s.y0) * s.p;
      var tp = Math.max(0, s.p - 0.18), tx = s.x0 + (s.x1 - s.x0) * tp, ty = s.y0 + (s.y1 - s.y0) * tp;
      var lg = ctx.createLinearGradient(tx, ty, x, y);
      lg.addColorStop(0, 'rgba(255,75,62,0)'); lg.addColorStop(1, 'rgba(255,75,62,0.9)');
      ctx.strokeStyle = lg; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.stroke();
    });
    hits.forEach(function (h) {
      var k = h.t / 40, a = Math.max(0, 1 - k);
      ctx.strokeStyle = 'rgba(255,216,61,' + a + ')'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(h.x, h.y, 4 + k * 26, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(243,238,227,' + a + ')'; ctx.font = '500 11px "JetBrains Mono", monospace';
      var lx = Math.min(Math.max(h.x, cage.x + 22), cage.x + cage.w - 60), ly = Math.min(Math.max(h.y, cage.y + 16), cage.y + cage.h - 10);
      ctx.fillText('204', lx + (h.x > W / 2 ? -34 : 10), ly - 8 - k * 14);
    });
  }

  function draw() {
    ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
    drawLattice(); drawShots(); drawPage();
  }

  function step() {
    frame++;
    if (frame % 26 === 0) { var leaky = TAGS.filter(function (t) { return t.leaks; }); fire(leaky[(Math.random() * leaky.length) | 0]); }
    shots.forEach(function (s) { s.p += s.v; if (s.p >= 1) { s.done = true; hit(s); } });
    shots = shots.filter(function (s) { return !s.done; });
    hits.forEach(function (h) { h.t++; });
    hits = hits.filter(function (h) { return h.t < 52; });
  }

  function loop() {
    if (!running) return;
    step(); draw();
    requestAnimationFrame(loop);
  }
  function start() { if (!running && visible && !document.hidden && !reduce) { running = true; requestAnimationFrame(loop); } }
  function stop() { running = false; }

  function staticFrame() {
    // A resting frame that already tells the story: several requests mid-flight and caught.
    shots = []; hits = [];
    for (var i = 0; i < 6; i++) { fire(TAGS[i % 2 ? 1 : 3]); shots[i].p = 0.25 + i * 0.12; }
    for (var j = 0; j < 4; j++) { var e = edgePoint(); hits.push({ x: e.x, y: e.y, t: 6 + j * 6, c: C.red }); }
    caught = 12; if (caughtEl) caughtEl.textContent = caught;
    draw();
  }

  layout(); staticFrame();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!running) draw(); });
  window.addEventListener('resize', function () { layout(); if (!running) draw(); });
  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; visible ? start() : stop(); }).observe(canvas);
  } else { start(); }
})();
