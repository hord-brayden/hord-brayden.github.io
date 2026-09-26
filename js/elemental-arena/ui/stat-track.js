/* The tuning track.
 *
 * A symmetric slider drawn as cells either side of a fixed centre mark. The
 * centre is always visible, so a balanced build reads as "deliberately
 * centred" rather than as an empty control that has not been touched yet.
 *
 * Shared by the Forge inspector and the campaign bench so the two can never
 * drift apart.
 */

export const STAT_RANGE = 5;

/**
 * @param {number} value  current setting, -STAT_RANGE..+STAT_RANGE
 * @param {number} step   multiplier per point, for the readout
 */
export function statTrack(value, step) {
  const cells = [];
  for (let i = -STAT_RANGE; i <= STAT_RANGE; i++) {
    if (i === 0) { cells.push('<i class="ea-pip ea-pip--mid" aria-hidden="true"></i>'); continue; }
    const on = (value > 0 && i > 0 && i <= value) || (value < 0 && i < 0 && i >= value);
    const cls = on ? (value > 0 ? 'is-up' : 'is-down') : '';
    cells.push(`<i class="ea-pip ${cls}" aria-hidden="true"></i>`);
  }
  const pct = Math.round(value * step * 100);
  const label = value === 0 ? 'stock' : `${pct > 0 ? '+' : ''}${pct}%`;
  return `<span class="ea-track">${cells.join('')}</span>
          <span class="ea-track-value ${value > 0 ? 'is-up' : value < 0 ? 'is-down' : ''}">${label}</span>`;
}
