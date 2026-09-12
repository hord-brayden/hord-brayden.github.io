/* The Campaign screen.
 *
 * Renders whichever phase the run is in — choose an encounter, spend in the
 * workshop, or read the aftermath — plus the persistent run header and the
 * local high-score table.
 *
 * The screen owns no game state. Everything lives on the CampaignRun; this
 * reads it, calls methods on it, and re-renders.
 */

import { Fighters, uiColor } from '../content/roster.js';
import { Weapons, weaponLabel } from '../content/weapons.js';
import { Perks } from '../content/loadouts.js';
import { CampaignRun, RunState, loadScores, clearScores, saveRun, loadRun, clearRun } from '../campaign/run.js';
import { TIERS, Upgrades } from '../campaign/upgrades.js';
import { MODIFIERS } from '../campaign/modifiers.js';
import { attachPreview, detachPreview, refreshPreviews } from './preview.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const RISK_COLORS = { low: '#16a34a', medium: '#d97706', high: '#dc2626', boss: '#9333ea' };

export class Campaign {
  constructor(app) {
    this.app = app;
    this.run = null;
    this.lastResult = null;
    this.root = $('#campaign');
    this.bind();
  }

  bind() {
    $('#campNewRun').addEventListener('click', () => this.pickStarter());
    $('#campAbandon').addEventListener('click', () => {
      if (!this.run) return;
      clearRun();
      this.run = null;
      this.render();
    });
    $('#campScoresBtn').addEventListener('click', () => {
      this.renderScores();
      this.app.showOverlay('panelScores');
    });
    $('#campClearScores').addEventListener('click', () => {
      clearScores();
      this.renderScores();
    });
  }

  /** Resume a saved run if there is one, otherwise show the start screen. */
  enter() {
    if (!this.run) this.run = loadRun();
    this.render();
  }

  /* ------------------------------------------------------- run lifecycle */

  pickStarter() {
    this.phase = 'starter';
    this.render();
  }

  startRun(fighterId) {
    this.run = new CampaignRun({ fighterId });
    this.lastResult = null;
    this.phase = null;
    saveRun(this.run);
    this.render();
  }

  choose(index) {
    this.run.choose(index);
    saveRun(this.run);
    this.render();
  }

  launch() {
    this.app.startCampaignBattle(this.run);
  }

  /** Called by the app once a campaign battle has finished. */
  onBattleEnd(engine) {
    this.lastResult = this.run.resolve(engine);
    saveRun(this.run);
    this.render();
  }

  /* ------------------------------------------------------------- render */

  render() {
    const run = this.run;

    if (this.phase === 'starter') { this.renderStarter(); return; }
    if (!run) { this.renderIntro(); return; }

    $('#campIntro').hidden = true;
    $('#campStarter').hidden = true;
    $('#campRun').hidden = false;
    $('#campAbandon').hidden = false;

    this.renderHeader();

    if (run.state === RunState.DEAD) this.renderDead();
    else if (run.state === RunState.SHOP) this.renderShop();
    else this.renderChoices();

    refreshPreviews();
  }

  renderIntro() {
    $('#campIntro').hidden = false;
    $('#campStarter').hidden = true;
    $('#campRun').hidden = true;
    $('#campAbandon').hidden = true;

    const scores = loadScores();
    $('#campBest').textContent = scores.length
      ? `Best run: ${scores[0].score.toLocaleString()} · stage ${scores[0].stage}`
      : 'No runs yet.';
  }

  renderStarter() {
    $('#campIntro').hidden = true;
    $('#campRun').hidden = true;
    $('#campAbandon').hidden = true;
    const wrap = $('#campStarter');
    wrap.hidden = false;

    $$('canvas', wrap).forEach(detachPreview);
    $('#starterGrid').innerHTML = '';
    for (const f of Fighters.all) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'ea-lib-card';
      card.style.setProperty('--ea-color', uiColor(f, false));
      card.style.setProperty('--ea-color-dark', uiColor(f, true));
      card.innerHTML = `
        <canvas class="ea-lib-orb" width="72" height="72" aria-hidden="true"></canvas>
        <span class="ea-lib-name">${f.name}</span>
        <span class="ea-lib-weapon">${f.weapon.name}</span>`;
      card.title = f.blurb;
      $('#starterGrid').appendChild(card);
      attachPreview($('canvas', card), f, { themeId: this.app.config.themeId });
      card.addEventListener('click', () => this.startRun(f.id));
    }
  }

  renderHeader() {
    const run = this.run;
    const f = Fighters.get(run.build.fighterId);
    const maxHp = run.previewMaxHp();
    const hp = run.hp === null ? maxHp : run.hp;
    const pct = Math.max(0, Math.min(1, hp / maxHp));

    $('#campHeader').style.setProperty('--ea-color', uiColor(f, false));
    $('#campHeader').style.setProperty('--ea-color-dark', uiColor(f, true));
    $('#campFighter').textContent = `${f.glyph} ${f.name}`;
    $('#campWeapon').textContent = weaponLabel(run.build.weaponId || f.weapon.id);
    $('#campStage').textContent = run.stage + 1;
    $('#campGold').textContent = run.gold.toLocaleString();
    $('#campScore').textContent = run.score.toLocaleString();
    $('#campHpText').textContent = `${Math.ceil(hp)} / ${Math.round(maxHp)}`;
    $('#campHpFill').style.transform = `scaleX(${pct.toFixed(3)})`;
    $('#campHpFill').classList.toggle('is-low', pct < 0.3);

    const orb = $('#campOrb');
    detachPreview(orb);
    attachPreview(orb, f, {
      loadout: { weaponId: run.build.weaponId, perk: 'none', hp: 0, dmg: 0, spd: 0 },
      themeId: this.app.config.themeId, spin: 1.1,
    });

    $('#campBuild').innerHTML = this.buildSummary(run.build);
  }

  buildSummary(build) {
    const chips = [];
    const pct = (v) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
    // A refit is a real change to the build even though it moves no stat, so
    // it needs to show up here and not only in the header.
    if (build.weaponId) chips.push(['Refit', weaponLabel(build.weaponId)]);
    if (Math.abs(build.maxHpMul - 1) > 0.005) chips.push(['Health', pct(build.maxHpMul)]);
    if (Math.abs(build.damageMul - 1) > 0.005) chips.push(['Damage', pct(build.damageMul)]);
    if (Math.abs(build.speedMul - 1) > 0.005) chips.push(['Speed', pct(build.speedMul)]);
    if (Math.abs(build.spinMul - 1) > 0.005) chips.push(['Swing', pct(build.spinMul)]);
    if (Math.abs(build.radiusMul - 1) > 0.005) chips.push(['Size', pct(build.radiusMul)]);
    if (build.reachBonus) chips.push(['Reach', `+${build.reachBonus.toFixed(2)}`]);
    if (build.extraWeapons) chips.push(['Arms', `${build.extraWeapons + 1}`]);
    if (Math.abs(build.ultRate - 1) > 0.005) chips.push(['Ult rate', pct(build.ultRate)]);
    if (build.crit) chips.push(['Crit', `${Math.round(build.crit.chance * 100)}% / ${build.crit.mult.toFixed(1)}×`]);
    if (build.ccResist) chips.push(['Control res', `${Math.round(build.ccResist * 100)}%`]);
    for (const [k, v] of Object.entries(build.resists)) {
      chips.push([k === 'all' ? 'All res' : `${k} res`, `${Math.round(v * 100)}%`]);
    }
    for (const id of build.perks) {
      const p = Perks.get(id);
      if (p) chips.push([p.name, '']);
    }
    if (!chips.length) return '<span class="ea-camp-empty">Stock orb. Nothing bolted on yet.</span>';
    return chips.map(([k, v]) =>
      `<span class="ea-chip">${k}${v ? ` <b>${v}</b>` : ''}</span>`).join('');
  }

  /* ------------------------------------------------------------ choices */

  renderChoices() {
    const run = this.run;
    $('#campPhaseTitle').textContent = run.isBoss ? 'A Warden blocks the way' : 'Choose your next fight';
    $('#campPhaseNote').textContent = run.isBoss
      ? 'No alternatives on a boss stage. Spend well.'
      : 'Higher risk pays more gold. The reward is shown before you commit.';

    const body = $('#campBody');
    body.innerHTML = `<div class="ea-enc-grid">${run.choices.map((c, i) => {
      const mod = c.modifier ? MODIFIERS[c.modifier] : null;
      return `
      <button type="button" class="ea-enc" data-choice="${i}" style="--ea-risk:${RISK_COLORS[c.risk]}">
        <span class="ea-enc-risk">${c.risk}</span>
        <h4>${c.name}</h4>
        <p class="ea-enc-blurb">${c.blurb}</p>
        <div class="ea-enc-foes">
          ${c.roster.map((e) => {
            const f = Fighters.get(e.fighterId);
            return `<span class="ea-enc-foe" style="--ea-color:${uiColor(f, false)};--ea-color-dark:${uiColor(f, true)}">${f.glyph} ${f.name}${(e.traits || []).length ? `<i>${e.traits.join(' · ')}</i>` : ''}</span>`;
          }).join('')}
        </div>
        ${mod ? `<p class="ea-enc-mod"><b>${mod.name}</b> — ${mod.desc}</p>` : ''}
        <span class="ea-enc-gold">${c.roster.length} foe${c.roster.length === 1 ? '' : 's'} · reward ×${c.gold.toFixed(2)}</span>
      </button>`;
    }).join('')}</div>`;

    $$('[data-choice]', body).forEach((b) =>
      b.addEventListener('click', () => this.choose(Number(b.dataset.choice))));
  }

  /* --------------------------------------------------------------- shop */

  renderShop() {
    const run = this.run;
    const enc = run.encounter;
    const mod = enc.modifier ? MODIFIERS[enc.modifier] : null;

    $('#campPhaseTitle').textContent = 'Workshop';
    $('#campPhaseNote').textContent = 'Spend before you commit. Repairs and upgrades come out of the same pocket.';

    const repairCost = run.repairCost;
    const body = $('#campBody');
    body.innerHTML = `
      <div class="ea-shop">
        <div class="ea-shop-offers">
          ${run.offers.map((o, i) => `
            <article class="ea-offer ${o.bought ? 'is-bought' : ''} ${run.gold < o.cost ? 'is-poor' : ''}"
                     style="--ea-tier:${TIERS[o.def.tier].color}">
              <span class="ea-offer-tier">${TIERS[o.def.tier].name}</span>
              <h4>${o.def.name}</h4>
              <p>${o.def.desc}</p>
              <button type="button" data-buy="${i}" ${o.bought || run.gold < o.cost ? 'disabled' : ''}>
                ${o.bought ? 'Installed' : `${o.cost}g`}
              </button>
            </article>`).join('')}
        </div>

        <div class="ea-shop-side">
          <div class="ea-shop-act">
            <h4>Repair</h4>
            <p>${repairCost > 0 ? `Restore your orb to full for ${repairCost}g.` : 'Your orb is undamaged.'}</p>
            <button type="button" id="campRepair" ${repairCost <= 0 || run.gold < repairCost ? 'disabled' : ''}>
              ${repairCost > 0 ? `Repair · ${repairCost}g` : 'Nothing to fix'}
            </button>
          </div>
          <div class="ea-shop-act">
            <h4>Reroll</h4>
            <p>Draw three different offers.</p>
            <button type="button" id="campReroll" ${run.gold < run.rerollCost ? 'disabled' : ''}>
              Reroll · ${run.rerollCost}g
            </button>
          </div>
          <div class="ea-shop-next" style="--ea-risk:${RISK_COLORS[enc.risk]}">
            <span class="ea-enc-risk">${enc.risk}</span>
            <h4>Next: ${enc.name}</h4>
            <div class="ea-enc-foes">
              ${enc.roster.map((e) => {
                const f = Fighters.get(e.fighterId);
                return `<span class="ea-enc-foe" style="--ea-color:${uiColor(f, false)};--ea-color-dark:${uiColor(f, true)}">${f.glyph} ${f.name}</span>`;
              }).join('')}
            </div>
            ${mod ? `<p class="ea-enc-mod"><b>${mod.name}</b> — ${mod.desc}</p>` : ''}
            <button type="button" id="campFight" class="ea-fight-btn">Fight →</button>
          </div>
        </div>
      </div>`;

    $$('[data-buy]', body).forEach((b) => b.addEventListener('click', () => {
      if (run.buy(Number(b.dataset.buy))) { saveRun(run); this.render(); }
    }));
    $('#campRepair', body)?.addEventListener('click', () => {
      if (run.repair()) { saveRun(run); this.render(); }
    });
    $('#campReroll', body)?.addEventListener('click', () => {
      if (run.reroll()) { saveRun(run); this.render(); }
    });
    $('#campFight', body).addEventListener('click', () => this.launch());
  }

  /* ---------------------------------------------------------- aftermath */

  renderDead() {
    const run = this.run;
    $('#campPhaseTitle').textContent = 'Run over';
    $('#campPhaseNote').textContent = this.lastResult?.timedOut
      ? `You ran out of time on stage ${run.stage + 1}. Surviving is not the same as clearing.`
      : `Your orb fell on stage ${run.stage + 1}.`;

    const scores = loadScores();
    const rank = scores.findIndex((s) => s.seed === run.seed && s.score === run.score);

    $('#campBody').innerHTML = `
      <div class="ea-dead">
        <p class="ea-dead-score">${run.score.toLocaleString()}</p>
        <p class="ea-dead-sub">
          Stage ${run.stage + 1} · ${run.stats.kills} kills · ${Math.round(run.stats.damage).toLocaleString()} damage
          · ${run.stats.parries} parries${rank === 0 ? ' · <b>new best</b>' : rank > 0 ? ` · #${rank + 1} all time` : ''}
        </p>
        <div class="ea-dead-log">${run.log.slice(-10).map((l) => `<span>${l}</span>`).join('')}</div>
        <div class="ea-panel-actions" style="border:0;padding:0;margin-top:18px">
          <button type="button" id="campAgain">New run</button>
          <button type="button" class="btn--ghost" id="campSeeScores">High scores</button>
        </div>
      </div>`;

    $('#campAgain').addEventListener('click', () => { clearRun(); this.run = null; this.pickStarter(); });
    $('#campSeeScores').addEventListener('click', () => { this.renderScores(); this.app.showOverlay('panelScores'); });
  }

  renderScores() {
    const scores = loadScores();
    if (!scores.length) {
      $('#scoresBody').innerHTML = '<p class="ea-note">No runs recorded yet.</p>';
      return;
    }
    $('#scoresBody').innerHTML = `
      <table id="scoresTable">
        <thead><tr><th>#</th><th>Score</th><th>Stage</th><th>Orb</th><th>Kills</th><th>Seed</th></tr></thead>
        <tbody>
          ${scores.map((s, i) => {
            const f = Fighters.get(s.fighter);
            return `<tr>
              <td>${i + 1}</td>
              <td><b>${s.score.toLocaleString()}</b></td>
              <td>${s.stage + 1}</td>
              <td>${f ? `${f.glyph} ${f.name}` : s.fighter}</td>
              <td>${s.kills}</td>
              <td class="ea-seed-cell">${s.seed}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }
}
