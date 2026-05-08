(function () {
  function secureInt(max) {
    if (window.crypto && window.crypto.getRandomValues) {
      const limit = Math.floor(0x100000000 / max) * max;
      const buf = new Uint32Array(1);
      do { window.crypto.getRandomValues(buf); } while (buf[0] >= limit);
      return buf[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  // Fisher-Yates with crypto-grade index selection.
  window.randomizeInputArray = function (inputId, outputId) {
    const inputEl = document.getElementById(inputId);
    const outputEl = document.getElementById(outputId);
    if (!inputEl || !outputEl) return;

    const tokens = inputEl.value.split(/[\s,]+/).filter(Boolean);
    if (tokens.length === 0) {
      outputEl.value = '';
      return;
    }
    const items = tokens.slice();
    for (let i = items.length - 1; i > 0; i--) {
      const j = secureInt(i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    outputEl.value = items.join(', ');
  };
})();
