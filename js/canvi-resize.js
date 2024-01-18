function resizeCanvas() {
  const canvases = document.querySelectorAll('canvas');
  canvases.forEach(canvas => {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  });
}

window.addEventListener('DOMContentLoaded', resizeCanvas);
window.addEventListener('resize', resizeCanvas);