(function () {
  const RESOLUTION = 18;

  let canvas, ctx;
  let cols = 0, rows = 0;
  let grid = [];
  let raf = 0;
  let running = false;

  function sizeCanvas() {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    cols = Math.max(1, Math.floor(canvas.width / RESOLUTION));
    rows = Math.max(1, Math.floor(canvas.height / RESOLUTION));
  }

  function freshGrid() {
    const arr = new Array(cols);
    for (let i = 0; i < cols; i++) {
      arr[i] = new Uint8Array(rows);
      for (let j = 0; j < rows; j++) arr[i][j] = Math.random() < 0.18 ? 1 : 0;
    }
    return arr;
  }

  function nextGen(g) {
    const out = new Array(cols);
    for (let c = 0; c < cols; c++) out[c] = new Uint8Array(rows);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        let n = 0;
        for (let dc = -1; dc <= 1; dc++) {
          for (let dr = -1; dr <= 1; dr++) {
            if (!dc && !dr) continue;
            const cc = (c + dc + cols) % cols;
            const rr = (r + dr + rows) % rows;
            n += g[cc][rr];
          }
        }
        const cell = g[c][r];
        out[c][r] = (cell && (n === 2 || n === 3)) || (!cell && n === 3) ? 1 : 0;
      }
    }
    return out;
  }

  function getCss(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function draw() {
    const fillOn = getCss('--text') || '#15171a';
    const fillOff = getCss('--bg') || '#f4f5f7';
    ctx.fillStyle = fillOff;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = fillOn;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (grid[c][r]) {
          ctx.fillRect(c * RESOLUTION, r * RESOLUTION, RESOLUTION - 1, RESOLUTION - 1);
        }
      }
    }
  }

  function loop() {
    grid = nextGen(grid);
    draw();
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    running = true;
    loop();
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  function init() {
    canvas = document.getElementById('gameOfLifeCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    sizeCanvas();
    grid = freshGrid();
    draw();

    const startBtn = document.getElementById('startStopButton');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        if (running) {
          stop();
          startBtn.textContent = 'Start Game of Life';
        } else {
          start();
          startBtn.textContent = 'Stop Game of Life';
        }
      });
    }

    window.reSeed = function () {
      sizeCanvas();
      grid = freshGrid();
      draw();
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
