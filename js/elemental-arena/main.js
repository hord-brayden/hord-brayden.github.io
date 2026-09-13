/* Elemental Arena — application shell.
 *
 * Owns the requestAnimationFrame loop, the two screens (Forge and Arena), and
 * the panels around them. All simulation lives in core/engine.js; all drawing
 * lives in render/renderer.js; the roster builder lives in ui/forge.js. This
 * file is the glue and nothing else.
 *
 * Nothing auto-starts. The page opens on the Forge, so the first thing you see
 * is a board you can change rather than a fight already in progress. The one
 * exception is a shared match link, where going straight to the fight is the
 * entire point of the link.
 */

import { Engine } from './core/engine.js';
import { Renderer } from './render/renderer.js';
import { Audio } from './core/audio.js';
import { Themes } from './render/themes.js';
import { Fighters, uiColor, FAMILIES } from './content/roster.js';
import { Powerups } from './content/powerups.js';
import { Statuses } from './content/statuses.js';
import { Perks } from './content/loadouts.js';
import { Modes } from './modes/index.js';
import { randomSeedPhrase } from './core/rng.js';
import { Forge, TEAM_NAMES, TEAM_TINTS } from './ui/forge.js';
import { Campaign } from './ui/campaign.js';
import { refreshPreviews } from './ui/preview.js';
import { Recorder, recordingSupported } from './ui/recorder.js';
import {
  defaultConfig, normalizeConfig, loadConfig, saveConfig,
  shareUrl, configFromLocation,
} from './core/config.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const HUD_HZ = 14;   // DOM updates per second; the canvas still runs at full rate

class App {
  constructor() {
    const shared = configFromLocation();
    this.config = shared || loadConfig() || defaultConfig();
    this.audio = new Audio();
    this.engine = null;
    this.paused = false;
    this.screen = 'forge';
    this.lastFrame = 0;
    this.hudAccum = 0;
    this.hudRows = new Map();

    this.canvas = $('#arena');
    this.renderer = new Renderer(this.canvas, { arena: { w: 520, h: 520 } }, this.config.themeId);

    this.bindChrome();
    this.buildSettings();
    this.buildCodex();
    this.applyPresentation();
    this.observeResize();

    this.forge = new Forge(this);
    this.campaign = new Campaign(this);
    this.recorder = new Recorder(this.canvas, this.audio);
    this.recorder.onStop = (blob) => this.saveRecording(blob);
    this.campaignBattle = null;   // set while a campaign fight is running

    if (shared) this.startMatch();
    else this.showForge();

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  persist() { saveConfig(this.config); }

  /* ----------------------------------------------------------- screens */

  /** Screens are mutually exclusive; this is the only place that toggles them. */
  setScreen(name) {
    this.screen = name;
    this.scrollToTop();
    $('#forge').hidden = name !== 'forge';
    $('#campaign').hidden = name !== 'campaign';
    $('#play').hidden = name !== 'play';
    document.body.classList.toggle('ea-playing', name === 'play');
    $$('.ea-mode-switch button').forEach((b) =>
      b.classList.toggle('is-on', b.dataset.screen === name));
  }

  showForge() {
    this.setScreen('forge');
    this.campaignBattle = null;
    if (this.forge) this.forge.render();
    refreshPreviews();
  }

  showCampaign() {
    this.setScreen('campaign');
    this.campaignBattle = null;
    this.campaign.enter();
  }

  showPlay() {
    this.setScreen('play');
    this.renderer.hostW = -1;
    this.fitCanvas();
  }

  /** The site header is sticky and tall enough to clip the match title if
   *  the page is scrolled when a screen changes. */
  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  /* ------------------------------------------------------------ match */

  /**
   * @param {object} overrides merged into the config
   * @param {object} opts      { campaign, modifier } — a campaign fight is not
   *                           persisted as the player's Forge setup, because
   *                           its roster is generated rather than authored.
   */
  startMatch(overrides = {}, opts = {}) {
    let cfg;
    if (opts.campaign) {
      cfg = normalizeConfig({ ...this.config, ...overrides });
      // A generated roster carries profiles that normalizeConfig drops, so
      // reattach them from the override.
      cfg.roster = overrides.roster;
    } else {
      Object.assign(this.config, overrides);
      cfg = normalizeConfig(this.config);
      this.config = cfg;
      this.persist();
    }

    const mode = Modes.require(cfg.modeId);

    // The configured arena is calibrated for a two-orb duel. A bigger roster
    // needs proportionally more floor or the orbs spend the match wedged
    // together, so scale by the square root of the headcount — area grows
    // linearly with fighters, keeping density and pace roughly constant. It
    // is capped because past a point the orbs just look lost on the board.
    const headcount = cfg.roster.reduce((n, e) => n + (e.count || 1), 0);
    const spread = Math.min(1.5, Math.sqrt(Math.max(2, headcount) / 2));
    const arenaW = Math.round(cfg.arenaW * spread);
    const arenaH = Math.round(cfg.arenaH * spread);

    const engine = new Engine({
      ...cfg,
      arenaW, arenaH,
      // Survival adds fighters as it runs, so it starts with extra room.
      ...(cfg.modeId === 'survival'
        ? { arenaW: Math.round(arenaW * 1.4), arenaH: Math.round(arenaH * 1.4) } : {}),
      timeLimit: cfg.modeId === 'territory' && !cfg.timeLimit ? 90 : cfg.timeLimit,
    });
    engine.on('sfx', ({ name, opts }) => this.audio.play(name, opts));
    engine.on('end', (r) => this.showResult(r));
    if (opts.modifier && opts.modifier.onStart) {
      engine.onReady = (e) => opts.modifier.onStart(e);
    }

    // A fresh mode instance per match so grids and clocks never leak across.
    engine.setMode(Object.create(mode));

    this.engine = engine;
    this.renderer.engine = engine;
    this.renderer.setTheme(cfg.themeId);

    this.paused = false;
    this.hideOverlay();
    this.showPlay();
    this.buildHud();
    this.updateTitleBar();
    $('#pauseBtn').textContent = 'Pause';
    $('#seedReadout').textContent = cfg.seed;

    // Campaign fights hide the sandbox controls: rerolling the seed or editing
    // the roster mid-run would make the score meaningless.
    const inCampaign = !!opts.campaign;
    $('#play').classList.toggle('is-campaign', inCampaign);
    $('#backBtn').textContent = inCampaign ? '← Give up' : '← Forge';
  }

  /**
   * Launch the fight a campaign run has set up. It is an ordinary duel; the
   * run supplies the roster (with profiles) and gets told how it went.
   */
  startCampaignBattle(run) {
    const { cfg, modifier } = run.battleConfig(normalizeConfig(this.config));
    this.campaignBattle = { run, modifier };
    this.startMatch(cfg, { campaign: true, modifier });
  }

  restartSameSeed() { this.startMatch({}); }
  restartNewSeed() { this.startMatch({ seed: randomSeedPhrase() }); }

  /** True while the match on screen belongs to a campaign run. */
  get inCampaign() { return !!this.campaignBattle; }

  /* ------------------------------------------------------------- loop */

  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = now;

    if (this.screen !== 'play' || !this.engine) return;
    const alpha = this.paused ? 1 : this.engine.advance(dt);
    this.renderer.render(alpha);

    this.hudAccum += dt;
    if (this.hudAccum >= 1 / HUD_HZ) {
      this.updateHud();
      this.hudAccum = 0;
    }
  }

  /* -------------------------------------------------------------- HUD */

  /** One row per fighter: ultimate meter, ult name, and the template's own
   *  stat readout — the same shape as the strips in the source clips. */
  buildHud() {
    const wrap = $('#hudRows');
    wrap.innerHTML = '';
    this.hudRows.clear();

    for (const ball of this.engine.balls) {
      const el = ball.element;
      const row = document.createElement('div');
      row.className = 'ea-hud-row';
      row.style.setProperty('--ea-color', uiColor(el, false));
      row.style.setProperty('--ea-color-dark', uiColor(el, true));
      row.style.setProperty('--ea-team', TEAM_TINTS[ball.teamId % TEAM_TINTS.length]);
      row.innerHTML = `
        <div class="ea-meter"><div class="ea-meter-fill"></div><span class="ea-meter-label">${el.ult.name}</span></div>
        <div class="ea-hud-stat"></div>
      `;
      wrap.appendChild(row);
      this.hudRows.set(ball.id, {
        row, fill: $('.ea-meter-fill', row), stat: $('.ea-hud-stat', row), lastStat: '',
      });
    }
  }

  updateHud() {
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
      $('#statsReadout').textContent =
        `${e.livingBalls.length} alive · ${e.stats.hits} hits · ${e.stats.parries} parries · ${e.stats.ults} ults`;
    }
  }

  updateTitleBar() {
    const bar = $('#matchTitle');
    const byTeam = new Map();
    for (const b of this.engine.balls) {
      if (!byTeam.has(b.teamId)) byTeam.set(b.teamId, []);
      byTeam.get(b.teamId).push(b.element);
    }
    const parts = [...byTeam.entries()].sort((a, b) => a[0] - b[0]).map(([, els]) => {
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
    if (this.screen === 'play') {
      this.paused = true;
      $('#pauseBtn').textContent = 'Resume';
    }
  }

  hideOverlay() {
    $('#overlay').hidden = true;
    $$('.ea-panel').forEach((p) => { p.hidden = true; });
  }

  showResult(result) {
    const winner = result.winnerTeam;
    const survivors = this.engine.balls.filter((b) => b.teamId === winner);
    const names = [...new Set(survivors.map((b) => b.element.name))].join(' + ');
    const color = survivors.length ? uiColor(survivors[0].element, false) : '#888';

    $('#resultTitle').textContent = winner === null ? 'Draw' : `${names} wins`;
    $('#resultTitle').style.color = color;
    $('#resultReason').textContent = result.reason;

    $('#resultTable tbody').innerHTML = this.engine.balls
      .slice()
      .sort((a, b) => b.damageDealt - a.damageDealt)
      .map((b) => `
        <tr>
          <td><span class="ea-dot" style="background:${uiColor(b.element, false)}"></span>${b.element.glyph} ${b.element.name}</td>
          <td>${TEAM_NAMES[b.teamId] || `Team ${b.teamId}`}</td>
          <td>${Math.round(b.damageDealt)}</td>
          <td>${b.hitsLanded}</td>
          <td>${b.parries}</td>
          <td>${b.kills}</td>
          <td>${b.ultCount}</td>
          <td>${b.dead ? '—' : Math.ceil(b.hp)}</td>
        </tr>`).join('');

    this.audio.play('win');
    // Let the last moment land, then close the file on its own.
    if (this.recorder.active) setTimeout(() => this.recorder.stop(), 1200);

    if (this.campaignBattle) {
      const { run } = this.campaignBattle;
      const summary = this.campaign.onBattleEnd(this.engine);
      this.campaignBattle = null;
      this.showCampaignResult(run, summary);
      return;
    }
    this.showOverlay('panelResult');
  }

  /** The campaign's own post-battle panel: gold earned, then back to the run. */
  showCampaignResult(run, summary) {
    const r = this.campaign.lastResult;
    $('#campResultTitle').textContent = r.survived ? 'Stage cleared'
      : r.timedOut ? 'Out of time' : 'Your orb fell';
    $('#campResultTitle').style.color = r.survived ? 'var(--good)' : 'var(--bad)';
    $('#campResultBody').innerHTML = r.survived
      ? `<ul class="ea-reward">
           <li><span>Clear bonus</span><b>+${r.clearGold}g</b></li>
           <li><span>Performance</span><b>+${r.perfGold}g</b></li>
           <li><span>Damage dealt</span><b>${Math.round(r.dmg)}</b></li>
           <li><span>Kills · parries</span><b>${r.kills} · ${r.parries}</b></li>
           <li><span>Purse</span><b>${run.gold}g</b></li>
         </ul>`
      : `<p class="ea-note">Final score <b>${run.score.toLocaleString()}</b> after ${run.stage + 1} stages.</p>`;
    $('#campResultNext').textContent = r.survived ? 'Continue' : 'See the run';
    this.showOverlay('panelCampResult');
  }

  /* ---------------------------------------------------------- controls */

  bindChrome() {
    $('#launchBtn').addEventListener('click', () => this.startMatch());
    $('#forgeShuffle').addEventListener('click', () => {
      this.config.seed = randomSeedPhrase();
      this.persist();
      this.forge.render();
    });
    $('#backBtn').addEventListener('click', () => {
      this.hideOverlay();
      if (this.campaignBattle) { this.campaignBattle = null; this.showCampaign(); }
      else this.showForge();
    });

    $$('.ea-mode-switch button').forEach((b) => b.addEventListener('click', () => {
      this.hideOverlay();
      if (b.dataset.screen === 'campaign') this.showCampaign();
      else this.showForge();
    }));

    $('#campResultNext').addEventListener('click', () => {
      this.hideOverlay();
      this.showCampaign();
    });

    $('#pauseBtn').addEventListener('click', () => {
      if (!$('#overlay').hidden) {
        this.hideOverlay(); this.paused = false; $('#pauseBtn').textContent = 'Pause'; return;
      }
      this.paused = !this.paused;
      $('#pauseBtn').textContent = this.paused ? 'Resume' : 'Pause';
    });
    $('#restartBtn').addEventListener('click', () => this.restartSameSeed());
    $('#rerollBtn').addEventListener('click', () => this.restartNewSeed());

    $$('[data-open-panel]').forEach((b) => b.addEventListener('click', () => {
      this.showOverlay(b.dataset.openPanel);
    }));
    $$('[data-close-panel]').forEach((b) => b.addEventListener('click', () => {
      this.hideOverlay();
      if (this.screen === 'play') { this.paused = false; $('#pauseBtn').textContent = 'Pause'; }
    }));
    $('#overlay').addEventListener('click', (ev) => {
      if (ev.target.id !== 'overlay') return;
      this.hideOverlay();
      if (this.screen === 'play') { this.paused = false; $('#pauseBtn').textContent = 'Pause'; }
    });

    $('#speedRange').addEventListener('input', (ev) => {
      const v = Number(ev.target.value);
      this.config.gameSpeed = v;
      if (this.engine) this.engine.speedScale = v;
      $('#speedReadout').textContent = `${v.toFixed(2)}×`;
      this.persist();
    });

    $('#fullscreenBtn').addEventListener('click', () => this.toggleFullscreen());
    $('#recordBtn').addEventListener('click', () => this.toggleRecording());
    if (!recordingSupported()) {
      $('#recordBtn').disabled = true;
      $('#recordBtn').title = 'This browser cannot record canvas video';
    }
    // The canvas has to be re-fitted on the way into and out of fullscreen,
    // because the space it is being fitted to just changed.
    document.addEventListener('fullscreenchange', () => {
      const on = !!document.fullscreenElement;
      document.body.classList.toggle('ea-fullscreen', on);
      $('#fullscreenBtn').textContent = on ? '⛶ Exit' : '⛶ Fullscreen';
      this.renderer.hostW = -1;
      requestAnimationFrame(() => this.fitCanvas());
    });

    $$('[data-share]').forEach((b) => b.addEventListener('click', async () => {
      const url = shareUrl(this.config);
      window.history.replaceState(null, '', url);
      try {
        await navigator.clipboard.writeText(url);
        this.toast('Match link copied to clipboard');
      } catch (e) {
        this.toast('Link is in the address bar — copy it from there');
      }
    }));

    $('#resultAgainBtn').addEventListener('click', () => this.restartNewSeed());
    $('#resultRematchBtn').addEventListener('click', () => this.restartSameSeed());
    $('#resultForgeBtn').addEventListener('click', () => { this.hideOverlay(); this.showForge(); });

    // Audio can only start inside a gesture, so the first interaction
    // anywhere unlocks the context if sound is enabled.
    const unlock = () => { if (this.config.sound) this.audio.setEnabled(true); };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });

    // Pasting a share link into the address bar of an already-open page is a
    // same-document navigation — nothing reloads — so the match has to be
    // picked up here, or the link silently does nothing.
    window.addEventListener('hashchange', () => {
      const shared = configFromLocation();
      if (!shared) return;
      this.config = shared;
      this.forge.selected = null;
      this.forge.render();
      this.startMatch();
      this.toast('Loaded shared match');
    });

    document.addEventListener('keydown', (ev) => {
      if (ev.target.matches('input, select, textarea')) return;
      const k = ev.key.toLowerCase();
      if (k === 'escape') {
        if (!$('#overlay').hidden) { this.hideOverlay(); return; }
        if (this.screen === 'play') {
          if (this.campaignBattle) { this.campaignBattle = null; this.showCampaign(); }
          else this.showForge();
        }
        return;
      }
      if (this.screen !== 'play') {
        if (k === 'enter' && this.screen === 'forge' && !$('#launchBtn').disabled) this.startMatch();
        return;
      }
      switch (k) {
        case ' ': ev.preventDefault(); $('#pauseBtn').click(); break;
        case 'r': this.restartSameSeed(); break;
        case 'n': this.restartNewSeed(); break;
        case 'f': ev.preventDefault(); this.toggleFullscreen(); break;
        case 'v': this.toggleRecording(); break;
        case 't': {
          const ids = Themes.ids;
          const next = ids[(ids.indexOf(this.config.themeId) + 1) % ids.length];
          this.config.themeId = next;
          this.renderer.setTheme(next);
          this.fitCanvas();
          const sel = $('#themeSelect');
          if (sel) sel.value = next;
          this.persist();
          this.toast(`Theme: ${Themes.get(next).name}`);
          break;
        }
        default: break;
      }
    });
  }

  /* ------------------------------------------------- fullscreen + video */

  /** Fullscreen the play screen itself, so the arena gets the whole display
   *  and the site chrome goes away with it. */
  async toggleFullscreen() {
    const target = $('#play');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (target.requestFullscreen) await target.requestFullscreen({ navigationUI: 'hide' });
      else this.toast('This browser will not allow fullscreen here');
    } catch (e) {
      this.toast('Fullscreen was refused by the browser');
    }
  }

  toggleRecording() {
    if (this.recorder.active) {
      this.recorder.stop();
      this.toast('Saving the clip…');
      this.setRecordUi(false);
      return;
    }
    if (!recordingSupported()) {
      this.toast('This browser cannot record canvas video');
      return;
    }
    // Recording silently without audio is a worse surprise than being told.
    if (!this.audio.ready) this.toast('Recording — enable Sound first if you want audio');
    if (this.recorder.start()) this.setRecordUi(true);
    else this.toast('Could not start recording');
  }

  setRecordUi(on) {
    const btn = $('#recordBtn');
    btn.classList.toggle('is-recording', on);
    btn.textContent = on ? '■ Stop' : '● Record';
    document.body.classList.toggle('ea-recording', on);
  }

  saveRecording(blob) {
    this.setRecordUi(false);
    if (!blob || !blob.size) { this.toast('Nothing was captured'); return; }
    const ext = (blob.type || '').includes('mp4') ? 'mp4' : 'webm';
    const seed = (this.config.seed || 'match').replace(/[^a-z0-9-]+/gi, '-');
    Recorder.save(blob, `elemental-arena-${seed}.${ext}`);
    this.toast(`Saved · ${(blob.size / 1e6).toFixed(1)} MB`);
  }

  toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('is-on'), 2200);
  }

  /* ----------------------------------------------------------- settings */

  buildSettings() {
    $('#themeSelect').innerHTML = Themes.all
      .map((t) => `<option value="${t.id}">${t.name} — ${t.desc}</option>`).join('');
    $('#themeSelect').value = this.config.themeId;
    $('#themeSelect').addEventListener('change', (ev) => {
      this.config.themeId = ev.target.value;
      this.renderer.setTheme(ev.target.value);
      this.fitCanvas();
      this.persist();
      if (this.screen === 'forge') this.forge.render();
    });

    const bind = (sel, key, after) => {
      const input = $(sel);
      if (!input) return;
      if (input.type === 'checkbox') input.checked = !!this.config[key];
      else input.value = this.config[key];
      const readout = $(`${sel}Readout`);
      const paint = () => { if (readout) readout.textContent = input.value; };
      paint();
      input.addEventListener('input', () => {
        this.config[key] = input.type === 'checkbox' ? input.checked : Number(input.value);
        paint();
        this.persist();
        if (after) after(this.config[key]);
      });
    };

    bind('#baseHp', 'baseHp');
    bind('#baseDamage', 'baseDamage');
    bind('#ballRadius', 'ballRadius');
    bind('#ballSpeed', 'ballSpeed');
    bind('#arenaSize', 'arenaW', (v) => { this.config.arenaH = v; });
    bind('#timeLimit', 'timeLimit');
    bind('#powerupsEnabled', 'powerupsEnabled', () => {
      $('#powerupOpts').hidden = !this.config.powerupsEnabled;
    });
    bind('#powerupInterval', 'powerupInterval');
    bind('#maxPickups', 'maxPickups');
    bind('#soundEnabled', 'sound', (v) => this.audio.setEnabled(v));
    bind('#volume', 'volume', (v) => this.audio.setVolume(v));
    bind('#particlesOn', 'particles', () => this.applyPresentation());
    bind('#shakeOn', 'screenShake', () => this.applyPresentation());
    bind('#showStats', 'showStats', () => this.applyPresentation());
    bind('#tileSize', 'tileSize');
    bind('#territoryRespawn', 'territoryRespawn');

    $('#powerupOpts').hidden = !this.config.powerupsEnabled;

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
      // All-checked stores as "empty = everything", which keeps URLs short and
      // opts newly added powerups in by default.
      this.config.powerupIds = on.length === boxes.length ? [] : on;
      this.persist();
    });

    $('#resetSettingsBtn').addEventListener('click', () => {
      this.config = defaultConfig();
      this.persist();
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

  /** Reference panel, generated from the registries so it cannot drift. */
  buildCodex() {
    $('#codexFighters').innerHTML = FAMILIES.map((fam) => `
      <h4 class="ea-codex-family">${fam.name}</h4>
      <p class="ea-note">${fam.blurb}</p>
      <div class="ea-codex-grid">
        ${Fighters.filter((f) => f.family === fam.id).map((e) => `
          <article class="ea-codex-card" style="--ea-color:${uiColor(e, false)};--ea-color-dark:${uiColor(e, true)}">
            <h5>${e.glyph} ${e.name}</h5>
            <p class="ea-codex-blurb">${e.blurb}</p>
            <dl>
              <dt>Weapon</dt><dd>${e.weapon.name}</dd>
              <dt>Passive</dt><dd><strong>${e.passive?.name || '—'}</strong> ${e.passive?.desc || ''}</dd>
              <dt>Ultimate</dt><dd><strong>${e.ult.name}</strong></dd>
              <dt>Overload</dt><dd><strong>${e.overload?.name || '—'}</strong> ${e.overload?.desc || ''}</dd>
              <dt>Strong vs</dt><dd>${e.strong.map((id) => Fighters.get(id)?.name).filter(Boolean).join(', ') || '—'}</dd>
              <dt>Weak vs</dt><dd>${e.weak.map((id) => Fighters.get(id)?.name).filter(Boolean).join(', ') || '—'}</dd>
            </dl>
          </article>`).join('')}
      </div>`).join('');

    $('#codexPerks').innerHTML = Perks.all.filter((p) => p.id !== 'none').map((p) => `
      <li><strong>${p.name}</strong> — ${p.desc}</li>`).join('');

    $('#codexStatuses').innerHTML = Statuses.all.map((s) => `
      <li><span class="ea-dot" style="background:${s.color}"></span>
        <strong>${s.name}</strong>${s.cc ? ' <em>(control)</em>' : ''}${s.beneficial ? ' <em>(buff)</em>' : ''}
      </li>`).join('');

    $('#codexPowerups').innerHTML = Powerups.all.map((p) => `
      <li><span class="ea-dot" style="background:${p.color}"></span>
        <strong>${p.name}</strong>${p.id === 'overload' ? ' — resolves differently for every template' : ''}
      </li>`).join('');
  }

  /* ------------------------------------------------------------ layout */

  observeResize() {
    const fit = () => { this.fitCanvas(); refreshPreviews(); };
    window.addEventListener('resize', fit);
    if (window.ResizeObserver) new ResizeObserver(fit).observe($('#stage'));
  }

  fitCanvas() {
    const rect = $('#stage').getBoundingClientRect();
    if (rect.width < 10) return;
    this.renderer.resize(rect.width, rect.height);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  // Fail loudly in the page rather than silently in the console — this is a
  // module script, so a syntax error anywhere means a blank screen.
  try {
    window.elementalArena = new App();
  } catch (err) {
    console.error(err);
    const s = $('#forge') || document.body;
    s.innerHTML = `<p class="ea-error">The arena failed to start: ${err.message}</p>`;
  }
});
