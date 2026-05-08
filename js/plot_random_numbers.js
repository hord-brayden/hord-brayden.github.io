(function () {
  const COLORS = {
    axis: () => getCss('--muted') || '#888',
    point: () => getCss('--accent') || '#2563eb'
  };

  function getCss(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function drawCartesianGraph(ctx, canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const tickSize = 6;
    const values = [0, 0.25, 0.5, 0.75, 1];
    const axisColor = COLORS.axis();

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = axisColor;
    ctx.fillStyle = axisColor;
    ctx.font = '12px ui-monospace, monospace';

    // X axis
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    // Y axis
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    ctx.textBaseline = 'middle';
    values.forEach((v) => {
      const x = w * v;
      const y = h / 2;
      ctx.beginPath();
      ctx.moveTo(x, y - tickSize / 2);
      ctx.lineTo(x, y + tickSize / 2);
      ctx.stroke();
      ctx.textAlign = v === 0 ? 'left' : v === 1 ? 'right' : 'center';
      ctx.fillText(v, x, y + tickSize * 2);
    });

    ctx.textAlign = 'center';
    values.forEach((v) => {
      const x = w / 2;
      const y = h * (1 - v);
      ctx.beginPath();
      ctx.moveTo(x - tickSize / 2, y);
      ctx.lineTo(x + tickSize / 2, y);
      ctx.stroke();
      ctx.textBaseline = v === 0 ? 'bottom' : v === 1 ? 'top' : 'middle';
      ctx.fillText(v, x - tickSize * 2, y);
    });
    ctx.restore();
  }

  function countSectors(values) {
    const c = { sector1: 0, sector2: 0, sector3: 0, sector4: 0 };
    values.forEach(([x, y]) => {
      if (x >= 0.5 && y >= 0.5) c.sector1++;
      else if (x < 0.5 && y >= 0.5) c.sector2++;
      else if (x < 0.5 && y < 0.5) c.sector3++;
      else c.sector4++;
    });
    return c;
  }

  function displaySectorCounts(c, id = 'sectorCounts') {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `
      <div>
        <span class="pill">Q1: ${c.sector1}</span>
        <span class="pill">Q2: ${c.sector2}</span>
        <span class="pill">Q3: ${c.sector3}</span>
        <span class="pill">Q4: ${c.sector4}</span>
      </div>`;
  }

  function displayRandomValues(values, id = 'randomValues') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = values.map(([x, y]) => `(${x}, ${y})`).join('  ');
  }

  function plot(canvas, ctx, generator) {
    const count = 250;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCartesianGraph(ctx, canvas);

    const values = [];
    ctx.fillStyle = COLORS.point();
    for (let i = 0; i < count; i++) {
      const x = generator();
      const y = generator();
      ctx.beginPath();
      ctx.arc(x * canvas.width, y * canvas.height, 2.2, 0, Math.PI * 2, true);
      ctx.fill();
      values.push([x.toFixed(2), y.toFixed(2)]);
    }
    return values;
  }

  function init() {
    const c1 = document.getElementById('randomNumberPlot');
    const c2 = document.getElementById('randomNumberPlot2');
    if (!c1 || !c2) return;

    const ctx1 = c1.getContext('2d');
    const ctx2 = c2.getContext('2d');
    drawCartesianGraph(ctx1, c1);
    drawCartesianGraph(ctx2, c2);

    document.getElementById('plotButton').addEventListener('click', () => {
      const values = plot(c1, ctx1, () => Math.random());
      displaySectorCounts(countSectors(values), 'sectorCounts');
      displayRandomValues(values, 'randomValues');
    });

    document.getElementById('plotButton2').addEventListener('click', () => {
      if (typeof window.reseedXorshift === 'function') window.reseedXorshift();
      const values = plot(c2, ctx2, () => window.getBetterRandom());
      displaySectorCounts(countSectors(values), 'sectorCounts2');
      displayRandomValues(values, 'randomValues2');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
