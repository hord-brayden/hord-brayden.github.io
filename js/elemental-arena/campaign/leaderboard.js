/* The global leaderboard.
 *
 * GitHub Pages serves static files, so there is no server here to own a score
 * table. This talks to Supabase's REST endpoint instead, which is free, needs
 * no build step, and — the part that actually matters — gives you a table
 * editor where deleting a fraudulent row is two clicks.
 *
 * SETUP (about five minutes, one time):
 *
 *   1. Make a free project at supabase.com.
 *   2. In the SQL editor, run:
 *
 *        create table scores (
 *          id         bigint generated always as identity primary key,
 *          created_at timestamptz default now(),
 *          name       text not null check (char_length(name) between 1 and 18),
 *          score      integer not null check (score >= 0 and score < 100000000),
 *          stage      integer not null check (stage >= 0 and stage < 10000),
 *          fighter    text not null,
 *          seed       text,
 *          kills      integer,
 *          hidden     boolean default false
 *        );
 *        alter table scores enable row level security;
 *        -- Anyone may read what is not hidden, and append their own run.
 *        -- Nobody may update or delete: moderation happens in the dashboard.
 *        create policy "read"   on scores for select using (hidden = false);
 *        create policy "append" on scores for insert with check (true);
 *
 *   3. Put the project URL and the *anon* key in LEADERBOARD below.
 *
 * The anon key is safe to publish — that is what it is for. The policies above
 * are what keep it safe: a visitor can add a row and read the board, and can
 * do nothing else. To remove a cheater, flip `hidden` to true in the table
 * editor (or delete the row); it disappears from every client immediately.
 *
 * Until it is configured, everything here no-ops and the panel shows local
 * scores only — the game never depends on the network to work.
 *
 * On trust: a determined person can post any number they like, because the
 * simulation runs on their machine. That is unavoidable for a static site and
 * not worth pretending otherwise. What we can do is make cheating *visible*:
 * every row carries the seed and the fighter it claims, and a run is fully
 * deterministic from those, so a suspicious entry can be replayed and checked.
 */

const LEADERBOARD = {
  // e.g. 'https://abcdefgh.supabase.co'
  url: '',
  // the public anon key, safe to commit
  key: '',
  table: 'scores',
  top: 25,
};

export function leaderboardEnabled() {
  return !!(LEADERBOARD.url && LEADERBOARD.key);
}

function endpoint(query = '') {
  return `${LEADERBOARD.url}/rest/v1/${LEADERBOARD.table}${query}`;
}

function headers(extra = {}) {
  return {
    apikey: LEADERBOARD.key,
    Authorization: `Bearer ${LEADERBOARD.key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/** Names are the one free-text field, so they are the one that needs a leash. */
export function cleanName(raw) {
  return String(raw || '')
    .replace(/[^\p{L}\p{N} _.'-]/gu, '')
    .trim()
    .slice(0, 18) || 'Anonymous';
}

/**
 * Post a finished run. Never throws and never blocks the UI: a leaderboard
 * that can break the end-of-run screen is worse than no leaderboard.
 */
export async function submitScore(run, name) {
  if (!leaderboardEnabled()) return { ok: false, reason: 'offline' };
  try {
    const res = await fetch(endpoint(), {
      method: 'POST',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        name: cleanName(name),
        score: Math.max(0, Math.round(run.score)),
        stage: Math.max(0, Math.round(run.stage)),
        fighter: run.build.fighterId,
        seed: String(run.seed).slice(0, 64),
        kills: Math.max(0, Math.round(run.stats.kills)),
      }),
    });
    return res.ok ? { ok: true } : { ok: false, reason: `http ${res.status}` };
  } catch (e) {
    return { ok: false, reason: 'network' };
  }
}

/** The global top N, newest-first within equal scores. */
export async function fetchTop() {
  if (!leaderboardEnabled()) return null;
  try {
    const q = `?select=name,score,stage,fighter,seed,created_at`
      + `&hidden=eq.false&order=score.desc&limit=${LEADERBOARD.top}`;
    const res = await fetch(endpoint(q), { headers: headers() });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? rows : null;
  } catch (e) {
    return null;
  }
}
