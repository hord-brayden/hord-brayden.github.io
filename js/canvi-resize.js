(function () {
  function resizeGoL() {
    const gol = document.getElementById('gameOfLifeCanvas');
    if (!gol) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    gol.width = Math.floor(window.innerWidth * dpr);
    gol.height = Math.floor(window.innerHeight * dpr);
    gol.style.width = window.innerWidth + 'px';
    gol.style.height = window.innerHeight + 'px';
    if (typeof window.reSeed === 'function') window.reSeed();
  }

  let raf;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(resizeGoL);
  });
})();
