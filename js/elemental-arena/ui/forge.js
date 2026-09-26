/* The Forge — the setup screen where a match gets built.
 *
 * Three columns: a library of fighter templates on the left, the teams in the
 * middle, and an inspector on the right for whichever orb is selected.
 *
 * Interaction is deliberately dual-path. Pointer drag is the expressive way
 * to move an orb between teams, but drag-and-drop is miserable on a phone, so
 * every drag has a tap equivalent: tap a template to add it to the focused
 * team, tap an orb to inspect it, and use the inspector's team buttons to
 * move it. Nothing is reachable *only* by dragging.
 */

import { Fighters, FAMILIES, uiColor } from '../content/roster.js';
import { Weapons, weaponLabel, weaponStats } from '../content/weapons.js';
import { weaponAbility } from '../content/weapon-abilities.js';
import { Perks, BUILD_STATS, defaultLoadout, normalizeLoadout, buildSpend, BUILD_BUDGET } from '../content/loadouts.js';
import { Chassis, Drives, partsLabel } from '../content/parts.js';
import { Modes } from '../modes/index.js';
import { attachPreview, updatePreview, detachPreview, refreshPreviews } from './preview.js';
import { statTrack, STAT_RANGE } from './stat-track.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const TEAM_NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];
export const TEAM_TINTS = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#9333ea', '#0891b2'];
const MAX_TEAMS = 6;
const MAX_ORBS = 10;

export class Forge {
  /**
   * @param {object} app  the App shell; Forge calls app.startMatch and reads
   *                      app.config, but owns no simulation state itself.
   */
  constructor(app) {
    this.app = app;
    this.selected = null;       // index into config.roster
    this.focusTeam = 0;         // which team a tapped template joins
    this.dragging = null;
    this.root = $('#forge');
    this.build();
  }

  get roster() { return this.app.config.roster; }

  /* ------------------------------------------------------------- build */

  build() {
    this.buildModeTabs();
    this.buildLibrary();
    this.bindSeed();
    this.render();
  }

  buildModeTabs() {
    const wrap = $('#modeTabs');
    wrap.innerHTML = Modes.all.map((m) => `
      <button type="button" class="ea-tab" data-mode="${m.id}" role="tab">
        <span class="ea-tab-name">${m.name}</span>
        <span class="ea-tab-line">${m.tagline}</span>
      </button>`).join('');
    wrap.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-mode]');
      if (!btn) return;
      this.app.config.modeId = btn.dataset.mode;
      this.app.persist();
      this.render();
    });
  }

  buildLibrary() {
    const tabs = $('#familyTabs');
    tabs.innerHTML = FAMILIES.map((f, i) => `
      <button type="button" class="ea-pill ${i === 0 ? 'is-on' : ''}" data-family="${f.id}">${f.name}</button>
    `).join('');
    tabs.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-family]');
      if (!btn) return;
      $$('#familyTabs .ea-pill').forEach((b) => b.classList.toggle('is-on', b === btn));
      this.showFamily(btn.dataset.family);
    });
    this.showFamily(FAMILIES[0].id);
  }

  showFamily(familyId) {
    const family = FAMILIES.find((f) => f.id === familyId);
    $('#familyBlurb').textContent = family ? family.blurb : '';

    const list = $('#library');
    $$('canvas', list).forEach(detachPreview);
    list.innerHTML = '';

    for (const f of Fighters.filter((x) => x.family === familyId)) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'ea-lib-card';
      card.draggable = true;
      card.dataset.fighter = f.id;
      card.style.setProperty('--ea-color', uiColor(f, false));
      card.style.setProperty('--ea-color-dark', uiColor(f, true));
      card.innerHTML = `
        <canvas class="ea-lib-orb" width="72" height="72" aria-hidden="true"></canvas>
        <span class="ea-lib-name">${f.name}</span>
        <span class="ea-lib-weapon">${f.weapon.name}</span>
      `;
      card.title = f.blurb;
      list.appendChild(card);
      attachPreview($('canvas', card), f, { themeId: this.app.config.themeId });

      card.addEventListener('click', () => this.addFighter(f.id, this.focusTeam));
      card.addEventListener('dragstart', (ev) => {
        this.dragging = { type: 'new', fighterId: f.id };
        ev.dataTransfer.effectAllowed = 'copy';
        ev.dataTransfer.setData('text/plain', f.id);
        document.body.classList.add('ea-dragging');
      });
      card.addEventListener('dragend', () => this.endDrag());
    }
  }

  bindSeed() {
    $('#forgeSeed').addEventListener('change', (ev) => {
      this.app.config.seed = ev.target.value.trim() || this.app.config.seed;
      this.app.persist();
    });
  }

  /* ------------------------------------------------------------ roster */

  addFighter(fighterId, teamId) {
    if (this.totalOrbs() >= MAX_ORBS) {
      this.app.toast(`${MAX_ORBS} orbs is the cap`);
      return;
    }
    this.roster.push({
      fighterId,
      teamId: Math.min(teamId, MAX_TEAMS - 1),
      count: 1,
      loadout: defaultLoadout(),
    });
    this.selected = this.roster.length - 1;
    this.app.persist();
    this.render();
  }

  removeAt(index) {
    if (this.roster.length <= 2) {
      this.app.toast('A match needs at least two orbs');
      return;
    }
    this.roster.splice(index, 1);
    if (this.selected === index) this.selected = null;
    else if (this.selected > index) this.selected--;
    this.app.persist();
    this.render();
  }

  moveTo(index, teamId) {
    const entry = this.roster[index];
    if (!entry || entry.teamId === teamId) return;
    entry.teamId = teamId;
    this.app.persist();
    this.render();
  }

  totalOrbs() {
    return this.roster.reduce((n, e) => n + (e.count || 1), 0);
  }

  /** Teams that currently have members, plus one empty slot to drop into. */
  teamIds() {
    const used = [...new Set(this.roster.map((e) => e.teamId))].sort((a, b) => a - b);
    const next = [];
    for (let i = 0; i < MAX_TEAMS; i++) if (!used.includes(i)) { next.push(i); break; }
    return { used, next: next[0] };
  }

  /* ------------------------------------------------------------ render */

  render() {
    const cfg = this.app.config;
    const mode = Modes.get(cfg.modeId);

    $$('#modeTabs .ea-tab').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.mode === cfg.modeId);
      b.setAttribute('aria-selected', String(b.dataset.mode === cfg.modeId));
    });
    $('#modeBlurb').textContent = mode ? mode.desc : '';
    $('#forgeSeed').value = cfg.seed;

    // Survival is one side against the world, so team columns are pointless.
    const soloMode = mode && mode.supportsTeams === false;
    $('#teamsWrap').classList.toggle('is-solo', soloMode);
    $('#soloNote').hidden = !soloMode;

    this.renderTeams(soloMode);
    this.renderInspector();
    this.renderSummary();
    refreshPreviews();
  }

  renderTeams(soloMode) {
    const wrap = $('#teams');
    $$('canvas', wrap).forEach(detachPreview);
    wrap.innerHTML = '';

    const { used, next } = this.teamIds();
    const columns = soloMode ? [0] : used.slice();
    if (!soloMode && next !== undefined && columns.length < MAX_TEAMS) columns.push(next);

    for (const teamId of columns) {
      const members = this.roster
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => (soloMode ? true : e.teamId === teamId));

      const col = document.createElement('section');
      col.className = 'ea-team';
      col.dataset.team = String(teamId);
      col.style.setProperty('--ea-team', TEAM_TINTS[teamId % TEAM_TINTS.length]);
      col.classList.toggle('is-empty', members.length === 0);
      col.classList.toggle('is-focus', teamId === this.focusTeam && !soloMode);

      const head = document.createElement('header');
      head.className = 'ea-team-head';
      head.innerHTML = `
        <span class="ea-team-dot"></span>
        <span class="ea-team-name">${soloMode ? 'Your side' : TEAM_NAMES[teamId]}</span>
        <span class="ea-team-count">${members.reduce((n, m) => n + (m.e.count || 1), 0)}</span>
      `;
      col.appendChild(head);

      const slots = document.createElement('div');
      slots.className = 'ea-team-slots';
      col.appendChild(slots);

      for (const { e, i } of members) {
        slots.appendChild(this.orbChip(e, i));
      }

      if (!members.length) {
        const hint = document.createElement('p');
        hint.className = 'ea-team-hint';
        hint.textContent = 'Drop an orb here';
        slots.appendChild(hint);
      }

      this.bindDropTarget(col, teamId);
      col.addEventListener('click', (ev) => {
        if (ev.target.closest('.ea-orb')) return;
        this.focusTeam = teamId;
        this.render();
      });
      wrap.appendChild(col);
    }
  }

  orbChip(entry, index) {
    const f = Fighters.get(entry.fighterId);
    const chip = document.createElement('div');
    chip.className = 'ea-orb';
    chip.draggable = true;
    chip.dataset.index = String(index);
    chip.tabIndex = 0;
    chip.classList.toggle('is-selected', this.selected === index);
    chip.style.setProperty('--ea-color', uiColor(f, false));
    chip.style.setProperty('--ea-color-dark', uiColor(f, true));

    const perk = Perks.get(entry.loadout.perk);
    const tweaked = buildSpend(entry.loadout) !== 0
      || entry.loadout.perk !== 'none' || entry.loadout.weaponId
      || entry.loadout.chassisId !== 'standard' || entry.loadout.driveId !== 'orbit';

    chip.innerHTML = `
      <canvas class="ea-orb-canvas" width="76" height="76" aria-hidden="true"></canvas>
      <span class="ea-orb-name">${f.name}</span>
      ${entry.count > 1 ? `<span class="ea-orb-count">×${entry.count}</span>` : ''}
      ${tweaked ? `<span class="ea-orb-mod" title="${perk && perk.id !== 'none' ? perk.name : 'Custom build'}">◆</span>` : ''}
    `;
    chip.setAttribute('aria-label', `${f.name}, ${TEAM_NAMES[entry.teamId]}. Click to edit.`);

    attachPreview($('canvas', chip), f, {
      loadout: entry.loadout,
      themeId: this.app.config.themeId,
    });

    chip.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.selected = index;
      this.focusTeam = entry.teamId;
      this.render();
    });
    chip.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); chip.click(); }
      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); this.removeAt(index); }
    });
    chip.addEventListener('dragstart', (ev) => {
      this.dragging = { type: 'move', index };
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', String(index));
      document.body.classList.add('ea-dragging');
    });
    chip.addEventListener('dragend', () => this.endDrag());
    return chip;
  }

  bindDropTarget(el, teamId) {
    el.addEventListener('dragover', (ev) => {
      if (!this.dragging) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = this.dragging.type === 'new' ? 'copy' : 'move';
      el.classList.add('is-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('is-over'));
    el.addEventListener('drop', (ev) => {
      ev.preventDefault();
      el.classList.remove('is-over');
      const d = this.dragging;
      this.endDrag();
      if (!d) return;
      if (d.type === 'new') this.addFighter(d.fighterId, teamId);
      else this.moveTo(d.index, teamId);
    });
  }

  endDrag() {
    this.dragging = null;
    document.body.classList.remove('ea-dragging');
    $$('.is-over').forEach((n) => n.classList.remove('is-over'));
  }

  /* --------------------------------------------------------- inspector */

  renderInspector() {
    const panel = $('#inspector');
    const entry = this.selected !== null ? this.roster[this.selected] : null;

    if (!entry) {
      panel.innerHTML = `
        <div class="ea-inspect-empty">
          <p class="ea-inspect-title">Nothing selected</p>
          <p>Tap an orb to change its weapon, give it a perk, or shift points between health, damage and speed.</p>
          <p class="ea-inspect-tip">Drag a template from the library into a team, or just tap it to add it to the highlighted team.</p>
        </div>`;
      return;
    }

    const f = Fighters.get(entry.fighterId);
    const l = entry.loadout;
    const spend = buildSpend(l);
    const weaponId = l.weaponId || f.weapon.id;

    panel.innerHTML = `
      <header class="ea-inspect-head" style="--ea-color:${uiColor(f, false)};--ea-color-dark:${uiColor(f, true)}">
        <canvas class="ea-inspect-orb" width="104" height="104" aria-hidden="true"></canvas>
        <div>
          <p class="ea-inspect-kicker">${f.family} · ${partsLabel(l)}</p>
          <h3>${f.glyph} ${f.name}</h3>
          <p class="ea-inspect-blurb">${f.blurb}</p>
        </div>
      </header>

      <div class="ea-inspect-body">
        <label class="ea-row">
          <span>Weapon</span>
          <select id="insWeapon">
            ${Weapons.ids.map((id) => `<option value="${id}" ${id === weaponId ? 'selected' : ''}>${weaponLabel(id)}${id === f.weapon.id ? ' (stock)' : ''}</option>`).join('')}
          </select>
        </label>

        ${weaponCard(weaponId)}

        <label class="ea-row">
          <span>Chassis</span>
          <select id="insChassis">
            ${Chassis.all.map((c) => `<option value="${c.id}" ${c.id === l.chassisId ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
        </label>
        <p class="ea-inspect-note">${Chassis.get(l.chassisId)?.desc || ''}</p>

        <label class="ea-row">
          <span>Drive</span>
          <select id="insDrive">
            ${Drives.all.map((d) => `<option value="${d.id}" ${d.id === l.driveId ? 'selected' : ''}>${d.name}</option>`).join('')}
          </select>
        </label>
        <p class="ea-inspect-note">${Drives.get(l.driveId)?.desc || ''}</p>

        <label class="ea-row">
          <span>Perk</span>
          <select id="insPerk">
            ${Perks.all.map((p) => `<option value="${p.id}" ${p.id === l.perk ? 'selected' : ''}>${p.name}</option>`).join('')}
          </select>
        </label>
        <p class="ea-inspect-note" id="insPerkDesc">${Perks.get(l.perk)?.desc || ''}</p>

        <div class="ea-build">
          <div class="ea-build-head">
            <span>Build</span>
            <span class="ea-build-budget ${spend > BUILD_BUDGET ? 'is-over' : ''}" id="insBudget">${spend === 0 ? 'Balanced' : spend > 0 ? `${spend} over` : `${-spend} to spend`}</span>
          </div>
          ${BUILD_STATS.map((s) => `
            <div class="ea-stepper" data-stat="${s.id}">
              <span class="ea-stepper-name">${s.name}</span>
              <button type="button" class="ea-step" data-dir="-1" aria-label="Lower ${s.name}">−</button>
              <span class="ea-stepper-pips">${statTrack(l[s.id], s.step)}</span>
              <button type="button" class="ea-step" data-dir="1" aria-label="Raise ${s.name}">+</button>
            </div>`).join('')}
          <p class="ea-inspect-note">Points come out of each other — raise one and something else gives.</p>
        </div>

        <label class="ea-row">
          <span>How many</span>
          <span class="ea-count-ctl">
            <button type="button" id="insCountDown" aria-label="Fewer">−</button>
            <output id="insCount">${entry.count}</output>
            <button type="button" id="insCountUp" aria-label="More">+</button>
          </span>
        </label>

        <div class="ea-row ea-row--teams">
          <span>Team</span>
          <div class="ea-team-pick">
            ${TEAM_NAMES.slice(0, MAX_TEAMS).map((n, i) => `
              <button type="button" class="ea-team-btn ${i === entry.teamId ? 'is-on' : ''}"
                      style="--ea-team:${TEAM_TINTS[i]}" data-team="${i}">${n[0]}</button>`).join('')}
          </div>
        </div>

        <button type="button" class="ea-remove-btn" id="insRemove">Remove this orb</button>
      </div>
    `;

    attachPreview($('.ea-inspect-orb', panel), f, {
      loadout: l, themeId: this.app.config.themeId, spin: 1.2,
    });

    $('#insWeapon', panel).addEventListener('change', (ev) => {
      l.weaponId = ev.target.value === f.weapon.id ? null : ev.target.value;
      this.commitLoadout(entry);
    });
    $('#insChassis', panel).addEventListener('change', (ev) => {
      l.chassisId = ev.target.value;
      this.commitLoadout(entry);
    });
    $('#insDrive', panel).addEventListener('change', (ev) => {
      l.driveId = ev.target.value;
      this.commitLoadout(entry);
    });
    $('#insPerk', panel).addEventListener('change', (ev) => {
      l.perk = ev.target.value;
      this.commitLoadout(entry);
    });
    $$('.ea-stepper', panel).forEach((row) => {
      row.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-dir]');
        if (!btn) return;
        const stat = row.dataset.stat;
        const dir = Number(btn.dataset.dir);
        const next = { ...l, [stat]: l[stat] + dir };

        // A build is zero-sum, which means the first click on a fresh orb
        // would otherwise be refused until you lowered something else — a
        // confusing place to start. Raising instead *takes* the point from
        // whichever other stat can most afford it, so a click always does
        // something and the trade is visible immediately.
        if (dir > 0 && buildSpend(next) > BUILD_BUDGET) {
          const donors = BUILD_STATS
            .filter((x) => x.id !== stat && next[x.id] > -STAT_RANGE)
            .sort((x, y) => next[y.id] - next[x.id]);
          if (!donors.length) { this.app.toast('Nothing left to trade away'); return; }
          next[donors[0].id] -= 1;
        }

        const fixed = normalizeLoadout(next);
        if (fixed[stat] === l[stat]) { this.app.toast('That stat is maxed'); return; }
        Object.assign(l, fixed);
        this.commitLoadout(entry);
      });
    });
    $('#insCountUp', panel).addEventListener('click', () => {
      if (this.totalOrbs() >= MAX_ORBS) { this.app.toast(`${MAX_ORBS} orbs is the cap`); return; }
      entry.count = Math.min(8, entry.count + 1);
      this.app.persist(); this.render();
    });
    $('#insCountDown', panel).addEventListener('click', () => {
      entry.count = Math.max(1, entry.count - 1);
      this.app.persist(); this.render();
    });
    $$('.ea-team-btn', panel).forEach((b) => b.addEventListener('click', () => {
      this.moveTo(this.selected, Number(b.dataset.team));
    }));
    $('#insRemove', panel).addEventListener('click', () => this.removeAt(this.selected));
  }

  commitLoadout(entry) {
    entry.loadout = normalizeLoadout(entry.loadout);
    this.app.persist();
    this.render();
  }

  /* ----------------------------------------------------------- summary */

  renderSummary() {
    const teams = new Map();
    for (const e of this.roster) {
      if (!teams.has(e.teamId)) teams.set(e.teamId, []);
      teams.get(e.teamId).push(e);
    }
    const mode = Modes.get(this.app.config.modeId);
    const solo = mode && mode.supportsTeams === false;

    const sides = [...teams.entries()].sort((a, b) => a[0] - b[0]).map(([teamId, list]) => {
      const names = list.map((e) => {
        const f = Fighters.get(e.fighterId);
        return `<span style="color:${uiColor(f, false)}" class="ea-sum-name">${f.glyph} ${f.name}${e.count > 1 ? ` ×${e.count}` : ''}</span>`;
      }).join(' <span class="ea-sum-plus">+</span> ');
      return solo ? names : `<span class="ea-sum-side">${names}</span>`;
    });

    $('#forgeSummary').innerHTML = solo
      ? `${sides.join('')} <span class="ea-sum-vs">vs</span> <span class="ea-sum-side">endless waves</span>`
      : sides.join(' <span class="ea-sum-vs">vs</span> ');

    const canStart = solo ? this.roster.length >= 1 : teams.size >= 2;
    const btn = $('#launchBtn');
    btn.disabled = !canStart;
    btn.textContent = canStart ? 'Launch match' : 'Add a second team';
  }
}


/** The consultable numbers and the special, shown right under the picker. */
function weaponCard(weaponId) {
  const st = weaponStats(weaponId);
  const ab = weaponAbility(weaponId);
  return `
    <div class="ea-wep-panel">
      <dl class="ea-wep-stats">
        <div><dt>Reach</dt><dd>${st.reachValue.toFixed(2)}x</dd></div>
        <div><dt>Damage</dt><dd>${Math.round(st.damageValue * 100)}%</dd></div>
        <div><dt>Recovery</dt><dd>${st.cooldownValue.toFixed(2)}s</dd></div>
        <div><dt>Hitbox</dt><dd>${st.thicknessValue.toFixed(1)}</dd></div>
      </dl>
      ${ab ? `<p class="ea-wep-ability">
        <span class="ea-wep-kind ea-wep-${ab.kind || 'passive'}">${ab.kind === 'deploy' ? 'deploys' : ab.kind === 'onhit' ? 'on hit' : 'passive'}</span>
        <strong>${ab.name}</strong> — ${ab.desc}</p>` : ''}
    </div>`;
}
