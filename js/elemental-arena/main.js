/* Elemental Arena — application shell.
 *
 * Owns the requestAnimationFrame loop, the DOM chrome around the canvas, and
 * the menus. All simulation lives in core/engine.js; all drawing lives in
 * render/renderer.js. This file is the glue and nothing else.
 */

import { Engine } from './core/engine.js';
import { Renderer } from './render/renderer.js';
import { Audio } from './core/audio.js';
import { Themes } from './render/themes.js';
import { Elements, uiColor } from './content/elements.js';
import { Powerups } from './content/powerups.js';
import { Statuses } from './content/statuses.js';
import { Modes } from './modes/index.js';
import { randomSeedPhrase } from './core/rng.js';
import {
  defaultConfig, normalizeConfig, loadConfig, saveConfig,
  shareUrl, configFromLocation,
} from './core/config.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const TEAM_NAMES = ['Team A', 'Team B', 'Team C', 'Team D', 'Team E', 'Team F'];

/** Set both page-theme variants of an element's chrome colour on an element. */
function setElementColor(node, el) {
  node.style.setProperty('--ea-color', uiColor(el, false));
  node.style.setProperty('--ea-color-dark', uiColor(el, true));
}
const HUD_HZ = 14;   // DOM updates per second; the canvas still runs at full rate

class App {
  constructor() {
    this.config = configFromLocation() || loadConfig() || defaultConfig();
    this.audio = new Audio();
    this.engine = null;
    this.renderer = null;
    this.running = false;
    this.paused = false;
    this.lastFrame = 0;
    this.hudAccum = 0;
    this.fpsSamples = [];
    this.hudRows = new Map();

    this.canvas = $('#arena');
    this.renderer = new Renderer(this.canvas, { arena: { w: 900, h: 900 } }, this.config.themeId);

    this.buildMenus();
    this.bindControls();
    this.applyPresentation();
    this.observeResize();

    this.startMatch();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  /* ------------------------------------------------------------ match */

  startMatch(overrides = {}) {
    Object.assign(this.config, overrides);
    const cfg = normalizeConfig(this.config);
    this.config = cfg;
    saveConfig(cfg);

    const mode = Modes.require(cfg.modeId);

    // The configured arena size is calibrated for a two-fighter duel. A
    // bigger roster needs proportionally more floor or the balls spend the
    // match wedged against each other, so scale by the square root of the
    // headcount — area grows linearly with fighters, which keeps the density
    // (and therefore the pace) roughly constant.
    const headcount = cfg.roster.reduce((n, e) => n + (e.count || 1), 0);
    const spread = Math.min(1.55, Math.sqrt(Math.max(2, headcount) / 2));
    const arenaW = Math.round(cfg.arenaW * spread);
    const arenaH = Math.round(cfg.arenaH * spread);

    const engine = new Engine({
      ...cfg,
      arenaW, arenaH,
      // Survival adds fighters as it runs, so it starts with extra room.
      ...(cfg.modeId === 'survival' ? { arenaW: Math.round(arenaW * 1.5), arenaH: Math.round(arenaH * 1.5) } : {}),
      timeLimit: cfg.modeId === 'territory' && !cfg.timeLimit ? 90 : cfg.timeLimit,
    });
    engine.on('sfx', ({ name, opts }) => this.audio.play(name, opts));
    engine.on('hit', ({ amount }) => this.audio.play('hit', { power: Math.min(1, amount / 30) }));
    engine.on('bounce', () => this.audio.play('bounce'));
    engine.on('end', (r) => this.showResult(r));

    // `setMode` wants a fresh instance so per-match state (grids, clocks)
    // never leaks between matches.
    engine.setMode(Object.create(mode));

    this.engine = engine;
    this.renderer.engine = engine;
    this.renderer.setTheme(cfg.themeId);
    this.renderer.hostW = -1;                // force a re-fit against the new arena
    this.fitCanvas();

    this.paused = false;
    this.hideOverlay();
    this.buildHud();
    this.updateTitleBar();
    $('#pauseBtn').textContent = 'Pause';
    $('#seedReadout').textContent = cfg.seed;
  }

  restartSameSeed() { this.startMatch({}); }
  restartNewSeed() { this.startMatch({ seed: randomSeedPhrase() }); }

  /* ------------------------------------------------------------- loop */

  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = now;

    if (!this.engine) return;
    const alpha = this.paused ? 1 : this.engine.advance(dt);
    this.renderer.render(alpha);

    this.hudAccum += dt;
    if (this.hudAccum >= 1 / HUD_HZ) {
      this.updateHud(this.hudAccum);
      this.hudAccum = 0;
    }
  }

  /* -------------------------------------------------------------- HUD */

  /** One row per fighter: ultimate meter, ult name, and the element's own
   *  stat readout — the same shape as the strips in the source clips. */
  buildHud() {
    const wrap = $('#hudRows');
    wrap.innerHTML = '';
    this.hudRows.clear();

    for (const ball of this.engine.balls) {
      const el = ball.element;
      const row = document.createElement('div');
      row.className = 'ea-hud-row';
      setElementColor(row, el);
      row.innerHTML = `
        <div class="ea-meter"><div class="ea-meter-fill"></div><span class="ea-meter-label">${el.ult.name}</span></div>
        <div class="ea-hud-stat"></div>
      `;
      wrap.appendChild(row);
      this.hudRows.set(ball.id, {
        row,
        fill: $('.ea-meter-fill', row),
        stat: $('.ea-hud-stat', row),
        lastStat: '',
      });
    }
    wrap.dataset.count = String(this.engine.balls.length);
  }

  updateHud(dt) {
    const e = this.engine;

    for (const ball of e.balls) {
      let entry = this.hudRows.get(ball.id);
      if (!entry) { this.buildHud(); entry = this.hudRows.get(ball.id); if (!entry) continue; }
      // transform beats width: it stays on the compositor and never reflows.
      entry.fill.style.transform = `scaleX(${ball.ultRatio.toFixed(3)})`;
      entry.row.classList.toggle('is-dead', ball.dead);
      const text = ball.element.ult.statLabel(ball, e);
      if (text !== entry.lastStat) { entry.stat.textContent = text; entry.lastStat = text; }
    }

    const mode = e.mode;
    $('#hudLeft').textContent = mode.hudLeft ? mode.hudLeft(e) : '';
    $('#hudRight').textContent = mode.hudRight ? mode.hudRight(e) : '';

    if (this.config.showStats) {
      const fps = 1 / Math.max(dt / Math.max(1, Math.round(dt * 60)), 1 / 240);
      this.fpsSamples.push(1 / (dt / Math.max(1, Math.round(dt * HUD_HZ))));
      if (this.fpsSamples.length > 20) this.fpsSamples.shift();
      $('#statsReadout').textContent =
        `${e.livingBalls.length} alive · ${e.particles.count} particles · ${e.stats.hits} hits · ${e.stats.ults} ults`;
    }
  }

  updateTitleBar() {
    const bar = $('#matchTitle');
    const byTeam = new Map();
    for (const b of this.engine.balls) {
      if (!byTeam.has(b.teamId)) byTeam.set(b.teamId, []);
      byTeam.get(b.teamId).push(b.element);
    }
    const parts = [...byTeam.entries()].map(([, els]) => {
      const uniq = [...new Map(els.map((e) => [e.id, e])).values()];
      return uniq.map((e) =>
        `<span class="ea-title-side" style="--ea-color:${uiColor(e, false)};--ea-color-dark:${uiColor(e, true)}">${e.glyph} ${e.name.toUpperCase()}</span>`
      ).join('<span class="ea-amp">+</span>');
    });
    bar.innerHTML = parts.join('<span class="ea-vs">VS</span>');
  }

  /* ---------------------------------------------------------- overlays */

  showOverlay(id) {
    $('#overlay').hidden = false;
    $$('.ea-panel').forEach((p) => { p.hidden = p.id !== id; });
    this.paused = true;
    $('#pauseBtn').textContent = 'Resume';
  }

  hideOverlay() {
    $('#overlay').hidden = true;
    $$('.ea-panel').forEach((p) => { p.hidden = true; });
  }

  showResult(result) {
    const winner = result.winnerTeam;
    const survivors = this.engine.balls.filter((b) => b.teamId === winner);
    const names = [...new Set(survivors.map((b) => b.element.name))].join(' + ');
    const color = survivors.length ? survivors[0].element.colors.core : '#888';

    $('#resultTitle').textContent = winner === null ? 'Draw' : `${names} wins`;
    $('#resultTitle').style.color = color;
    $('#resultReason').textContent = result.reason;

    const rows = this.engine.balls
      .slice()
      .sort((a, b) => b.damageDealt - a.damageDealt)
      .map((b) => `
        <tr>
          <td><span class="ea-dot" style="background:${b.element.colors.core}"></span>${b.element.glyph} ${b.element.name}</td>
          <td>${TEAM_NAMES[b.teamId] || `Team ${b.teamId}`}</td>
          <td>${Math.round(b.damageDealt)}</td>
          <td>${b.hitsLanded}</td>
          <td>${b.kills}</td>
          <td>${b.ultCount}</td>
          <td>${b.dead ? '—' : Math.ceil(b.hp)}</td>
        </tr>`).join('');
    $('#resultTable tbody').innerHTML = rows;

    this.audio.play('win');
    this.showOverlay('panelResult');
  }

  /* ---------------------------------------------------------- controls */

  bindControls() {
    $('#pauseBtn').addEventListener('click', () => {
      if (!$('#overlay').hidden) { this.hideOverlay(); this.paused = false; $('#pauseBtn').textContent = 'Pause'; return; }
      this.paused = !this.paused;
      $('#pauseBtn').textContent = this.paused ? 'Resume' : 'Pause';
    });

    $('#restartBtn').addEventListener('click', () => this.restartSameSeed());
    $('#rerollBtn').addEventListener('click', () => this.restartNewSeed());
    $('#newGameBtn').addEventListener('click', () => this.showOverlay('panelNew'));
    $('#settingsBtn').addEventListener('click', () => this.showOverlay('panelSettings'));
    $('#codexBtn').addEventListener('click', () => this.showOverlay('panelCodex'));

    $$('[data-close-panel]').forEach((b) => b.addEventListener('click', () => {
      this.hideOverlay();
      this.paused = false;
      $('#pauseBtn').textContent = 'Pause';
    }));

    $('#speedRange').addEventListener('input', (ev) => {
      const v = Number(ev.target.value);
      this.config.gameSpeed = v;
      if (this.engine) this.engine.speedScale = v;
      $('#speedReadout').textContent = `${v.toFixed(2)}×`;
      saveConfig(this.config);
    });

    $('#shareBtn').addEventListener('click', async () => {
      const url = shareUrl(this.config);
      window.history.replaceState(null, '', url);
      try {
        await navigator.clipboard.writeText(url);
        this.toast('Match link copied to clipboard');
      } catch (e) {
        this.toast('Link is in the address bar — copy it from there');
      }
    });

    $('#startMatchBtn').addEventListener('click', () => {
      this.readNewGameForm();
      this.startMatch();
      this.paused = false;
    });

    $('#resultAgainBtn').addEventListener('click', () => this.restartNewSeed());
    $('#resultRematchBtn').addEventListener('click', () => this.restartSameSeed());
    $('#resultNewBtn').addEventListener('click', () => this.showOverlay('panelNew'));

    // Pasting a share link into the address bar of an already-open page is a
    // same-document navigation — nothing reloads — so the match has to be
    // picked up here, or the link silently does nothing.
    window.addEventListener('hashchange', () => {
      const shared = configFromLocation();
      if (!shared) return;
      if (shared.seed === this.config.seed && shared.modeId === this.config.modeId) return;
      this.config = shared;
      this.syncFormsToConfig();
      this.startMatch();
      this.toast('Loaded shared match');
    });

    // Audio can only start inside a gesture, so the first click anywhere
    // unlocks the context if sound is enabled.
    const unlock = () => { if (this.config.sound) this.audio.setEnabled(true); };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });

    document.addEventListener('keydown', (ev) => {
      if (ev.target.matches('input, select, textarea')) return;
      switch (ev.key.toLowerCase()) {
        case ' ': ev.preventDefault(); $('#pauseBtn').click(); break;
        case 'r': this.restartSameSeed(); break;
        case 'n': this.restartNewSeed(); break;
        case 't': {
          const ids = Themes.ids;
          const next = ids[(ids.indexOf(this.config.themeId) + 1) % ids.length];
          this.config.themeId = next;
          this.renderer.setTheme(next);
          this.fitCanvas();
          $('#themeSelect').value = next;
          saveConfig(this.config);
          this.toast(`Theme: ${Themes.get(next).name}`);
          break;
        }
        case 'escape': if (!$('#overlay').hidden) $('[data-close-panel]:not([hidden])')?.click(); break;
        default: break;
      }
    });
  }

  /** Push the current config back into the menu controls. */
  syncFormsToConfig() {
    $('#modeSelect').value = this.config.modeId;
    $('#themeSelect').value = this.config.themeId;
    $('#seedInput').value = this.config.seed;
    $('#tileSize').value = this.config.tileSize;
    $('#territoryRespawn').checked = this.config.territoryRespawn;
    this.describeMode(this.config.modeId);
    $('#rosterList').innerHTML = '';
    this.config.roster.forEach((entry) => this.addRosterRow(entry));
    this.applyPresentation();
  }

  toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('is-on'), 2200);
  }

  /* ------------------------------------------------------------- menus */

  buildMenus() {
    // Mode picker.
    $('#modeSelect').innerHTML = Modes.all
      .map((m) => `<option value="${m.id}">${m.name} — ${m.tagline}</option>`).join('');
    $('#modeSelect').value = this.config.modeId;
    $('#modeSelect').addEventListener('change', (ev) => {
      this.describeMode(ev.target.value);
      this.syncRosterToMode(ev.target.value);
    });
    this.describeMode(this.config.modeId);

    // Theme picker.
    $('#themeSelect').innerHTML = Themes.all
      .map((t) => `<option value="${t.id}">${t.name} — ${t.desc}</option>`).join('');
    $('#themeSelect').value = this.config.themeId;
    $('#themeSelect').addEventListener('change', (ev) => {
      this.config.themeId = ev.target.value;
      this.renderer.setTheme(ev.target.value);
      this.fitCanvas();
      saveConfig(this.config);
    });

    $('#seedInput').value = this.config.seed;
    $('#seedShuffle').addEventListener('click', () => { $('#seedInput').value = randomSeedPhrase(); });

    this.buildRosterEditor();
    this.buildPowerupChecklist();
    this.buildSettingsForm();
    this.buildCodex();
  }

  describeMode(id) {
    const m = Modes.get(id);
    $('#modeDesc').textContent = m ? m.desc : '';
    $('#territoryOpts').hidden = id !== 'territory';
    $('#survivalNote').hidden = id !== 'survival';
  }

  /** Survival is one team by definition; flatten the roster when picked. */
  syncRosterToMode(modeId) {
    if (modeId !== 'survival') return;
    $$('#rosterList .ea-roster-row').forEach((row) => {
      const sel = $('.ea-team', row);
      sel.value = '0';
      sel.disabled = true;
    });
    if (modeId !== 'survival') return;
  }

  buildRosterEditor() {
    const list = $('#rosterList');
    list.innerHTML = '';
    this.config.roster.forEach((entry) => this.addRosterRow(entry));

    $('#addFighterBtn').addEventListener('click', () => {
      const used = $$('#rosterList .ea-roster-row').length;
      if (used >= 8) { this.toast('Eight fighters is the cap'); return; }
      const unused = Elements.ids.find((id) =>
        !$$('#rosterList .ea-element').some((s) => s.value === id)) || Elements.ids[0];
      this.addRosterRow({ elementId: unused, teamId: used, count: 1 });
    });

    $('#randomRosterBtn').addEventListener('click', () => {
      const n = $$('#rosterList .ea-roster-row').length || 2;
      const pool = Elements.ids.slice();
      list.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        this.addRosterRow({ elementId: pick, teamId: i, count: 1 });
      }
    });
  }

  addRosterRow(entry) {
    const row = document.createElement('div');
    row.className = 'ea-roster-row';
    const el = Elements.get(entry.elementId) || Elements.all[0];
    setElementColor(row, el);
    row.innerHTML = `
      <span class="ea-swatch"></span>
      <select class="ea-element" aria-label="Element">
        ${Elements.all.map((e) =>
          `<option value="${e.id}" ${e.id === entry.elementId ? 'selected' : ''}>${e.glyph} ${e.name}</option>`).join('')}
      </select>
      <select class="ea-team" aria-label="Team">
        ${TEAM_NAMES.map((n, i) =>
          `<option value="${i}" ${i === entry.teamId ? 'selected' : ''}>${n}</option>`).join('')}
      </select>
      <input class="ea-count" type="number" min="1" max="8" value="${entry.count || 1}" aria-label="How many">
      <button type="button" class="ea-remove btn--ghost" aria-label="Remove fighter">×</button>
      <p class="ea-roster-blurb">${el.blurb || ''}</p>
    `;
    $('.ea-element', row).addEventListener('change', (ev) => {
      const e = Elements.get(ev.target.value);
      setElementColor(row, e);
      $('.ea-roster-blurb', row).textContent = e.blurb || '';
    });
    $('.ea-remove', row).addEventListener('click', () => {
      if ($$('#rosterList .ea-roster-row').length <= 2) { this.toast('Need at least two fighters'); return; }
      row.remove();
    });
    $('#rosterList').appendChild(row);
  }

  readNewGameForm() {
    const roster = $$('#rosterList .ea-roster-row').map((row) => ({
      elementId: $('.ea-element', row).value,
      teamId: Number($('.ea-team', row).value),
      count: Number($('.ea-count', row).value) || 1,
    }));
    this.config.roster = roster;
    this.config.modeId = $('#modeSelect').value;
    this.config.seed = $('#seedInput').value.trim() || randomSeedPhrase();
    this.config.tileSize = Number($('#tileSize').value);
    this.config.territoryRespawn = $('#territoryRespawn').checked;
  }

  buildPowerupChecklist() {
    const wrap = $('#powerupList');
    const enabled = this.config.powerupIds;
    wrap.innerHTML = Powerups.all.map((p) => `
      <label class="ea-check" style="--ea-color:${p.color}">
        <input type="checkbox" value="${p.id}" ${!enabled.length || enabled.includes(p.id) ? 'checked' : ''}>
        <span class="ea-check-glyph">${p.glyph}</span>
        <span>${p.name}</span>
      </label>`).join('');
    wrap.addEventListener('change', () => {
      const boxes = $$('input[type=checkbox]', wrap);
      const on = boxes.filter((b) => b.checked).map((b) => b.value);
      // All-checked is stored as "empty = everything", which keeps URLs short
      // and means newly added powerups are opted in by default.
      this.config.powerupIds = on.length === boxes.length ? [] : on;
      saveConfig(this.config);
    });
  }

  buildSettingsForm() {
    const bind = (sel, key, { transform = Number, after } = {}) => {
      const input = $(sel);
      if (!input) return;
      if (input.type === 'checkbox') input.checked = !!this.config[key];
      else input.value = this.config[key];
      const readout = $(`${sel}Readout`);
      const paint = () => { if (readout) readout.textContent = input.value; };
      paint();
      input.addEventListener('input', () => {
        this.config[key] = input.type === 'checkbox' ? input.checked : transform(input.value);
        paint();
        saveConfig(this.config);
        if (after) after(this.config[key]);
      });
    };

    bind('#baseHp', 'baseHp');
    bind('#baseDamage', 'baseDamage');
    bind('#ballRadius', 'ballRadius');
    bind('#ballSpeed', 'ballSpeed');
    bind('#arenaSize', 'arenaW', { after: (v) => { this.config.arenaH = v; } });
    bind('#timeLimit', 'timeLimit');
    bind('#powerupsEnabled', 'powerupsEnabled', { after: () => { $('#powerupOpts').hidden = !this.config.powerupsEnabled; } });
    bind('#powerupInterval', 'powerupInterval');
    bind('#maxPickups', 'maxPickups');
    bind('#soundEnabled', 'sound', { after: (v) => this.audio.setEnabled(v) });
    bind('#volume', 'volume', { after: (v) => this.audio.setVolume(v) });
    bind('#particlesOn', 'particles', { after: () => this.applyPresentation() });
    bind('#shakeOn', 'screenShake', { after: () => this.applyPresentation() });
    bind('#showStats', 'showStats', { after: () => this.applyPresentation() });

    $('#powerupOpts').hidden = !this.config.powerupsEnabled;
    $('#tileSize').value = this.config.tileSize;
    $('#territoryRespawn').checked = this.config.territoryRespawn;

    $('#resetSettingsBtn').addEventListener('click', () => {
      this.config = defaultConfig();
      saveConfig(this.config);
      window.location.hash = '';
      window.location.reload();
    });
  }

  applyPresentation() {
    this.renderer.showParticles = this.config.particles;
    this.renderer.reduceMotion = !this.config.screenShake;
    this.audio.setEnabled(this.config.sound);
    this.audio.setVolume(this.config.volume);
    $('#statsReadout').hidden = !this.config.showStats;
    $('#speedRange').value = this.config.gameSpeed;
    $('#speedReadout').textContent = `${this.config.gameSpeed.toFixed(2)}×`;
  }

  /** Reference panel: every element, matchup, status and powerup, generated
   *  from the registries so it can never drift out of date. */
  buildCodex() {
    $('#codexElements').innerHTML = Elements.all.map((e) => `
      <article class="ea-codex-card" style="--ea-color:${uiColor(e, false)};--ea-color-dark:${uiColor(e, true)}">
        <h4>${e.glyph} ${e.name}</h4>
        <p class="ea-codex-blurb">${e.blurb}</p>
        <dl>
          <dt>Weapon</dt><dd>${e.weapon.name}</dd>
          <dt>Passive</dt><dd><strong>${e.passive?.name || '—'}</strong> ${e.passive?.desc || ''}</dd>
          <dt>Ultimate</dt><dd><strong>${e.ult.name}</strong></dd>
          <dt>Overload</dt><dd><strong>${e.overload?.name || '—'}</strong> ${e.overload?.desc || ''}</dd>
          <dt>Strong vs</dt><dd>${e.strong.map((id) => Elements.get(id)?.name).filter(Boolean).join(', ') || '—'}</dd>
          <dt>Weak vs</dt><dd>${e.weak.map((id) => Elements.get(id)?.name).filter(Boolean).join(', ') || '—'}</dd>
        </dl>
      </article>`).join('');

    $('#codexStatuses').innerHTML = Statuses.all.map((s) => `
      <li><span class="ea-dot" style="background:${s.color}"></span>
        <strong>${s.name}</strong>${s.cc ? ' <em>(crowd control)</em>' : ''}${s.beneficial ? ' <em>(buff)</em>' : ''}
      </li>`).join('');

    $('#codexPowerups').innerHTML = Powerups.all.map((p) => `
      <li><span class="ea-dot" style="background:${p.color}"></span>
        <strong>${p.name}</strong> ${p.id === 'overload' ? '— resolves differently for every element' : ''}
      </li>`).join('');
  }

  /* ------------------------------------------------------------ layout */

  observeResize() {
    const fit = () => this.fitCanvas();
    window.addEventListener('resize', fit);
    if (window.ResizeObserver) {
      new ResizeObserver(fit).observe($('#stage'));
    }
  }

  fitCanvas() {
    const stage = $('#stage');
    const rect = stage.getBoundingClientRect();
    if (rect.width < 10) return;
    this.renderer.resize(rect.width, rect.height);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  // Fail loudly in the page rather than silently in the console — this is a
  // module script, so a syntax error anywhere means a blank canvas.
  try {
    window.elementalArena = new App();
  } catch (err) {
    console.error(err);
    const s = document.getElementById('stage');
    if (s) s.innerHTML = `<p class="ea-error">The arena failed to start: ${err.message}</p>`;
  }
});
