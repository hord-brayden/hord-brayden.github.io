/* A tiny typed registry.
 *
 * Every piece of content in the arena — elements, statuses, powerups, modes,
 * weapon silhouettes, themes — lives in one of these. Adding content is
 * always the same gesture:
 *
 *     Elements.define({ id: 'plasma', name: 'Plasma', ... });
 *
 * Nothing else in the codebase needs to change. The menus, the matchup
 * matrix, the sprite baker and the URL codec all enumerate the registry
 * rather than hard-coding a list.
 */

export class Registry {
  /**
   * @param {string} kind      human-readable name, used in error messages
   * @param {object} defaults  shallow-merged under every definition
   * @param {string[]} required keys a definition must supply
   */
  constructor(kind, { defaults = {}, required = [] } = {}) {
    this.kind = kind;
    this.defaults = defaults;
    this.required = required;
    this._map = new Map();
  }

  define(def) {
    if (!def || typeof def.id !== 'string' || !def.id) {
      throw new Error(`[${this.kind}] definition needs a string id`);
    }
    if (this._map.has(def.id)) {
      throw new Error(`[${this.kind}] duplicate id "${def.id}"`);
    }
    for (const key of this.required) {
      if (!(key in def)) {
        throw new Error(`[${this.kind}] "${def.id}" is missing required key "${key}"`);
      }
    }
    const merged = { ...this.defaults, ...def };
    merged.order = this._map.size;
    this._map.set(def.id, Object.freeze(merged));
    return merged;
  }

  /** Register many at once. */
  defineAll(defs) {
    return defs.map((d) => this.define(d));
  }

  get(id) {
    return this._map.get(id);
  }

  /** Like get(), but throws rather than returning undefined. */
  require(id) {
    const v = this._map.get(id);
    if (!v) throw new Error(`[${this.kind}] unknown id "${id}"`);
    return v;
  }

  has(id) {
    return this._map.has(id);
  }

  get ids() {
    return [...this._map.keys()];
  }

  get all() {
    return [...this._map.values()];
  }

  get size() {
    return this._map.size;
  }

  filter(fn) {
    return this.all.filter(fn);
  }

  [Symbol.iterator]() {
    return this._map.values();
  }
}
