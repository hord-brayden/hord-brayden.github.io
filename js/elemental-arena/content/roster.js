/* Roster barrel.
 *
 * Importing this guarantees every pack has registered before anything reads
 * the registry. Consumers import from here, never from `fighters.js` directly
 * — that is what keeps packs and registry from forming an import cycle.
 *
 * To add a pack: create it under `packs/`, import it here, and add its family
 * to FAMILIES in `fighters.js`.
 */

import './packs/elemental.js';
import './packs/arsenal.js';

export { Fighters, effectiveness, uiColor, FAMILIES, fightersInFamily, wpal, shade } from './fighters.js';
