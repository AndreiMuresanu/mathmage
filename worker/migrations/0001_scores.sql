-- Leaderboard entries. One row per ranked run (a co-op team is one row).
CREATE TABLE scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board TEXT NOT NULL,          -- "<map>:<mode>", e.g. "mazy:solo"
  map TEXT NOT NULL,
  mode TEXT NOT NULL,
  names TEXT NOT NULL,          -- JSON [{"name": "...", "elo": 1234}, ...]
  wave INTEGER NOT NULL,
  elo INTEGER NOT NULL,         -- solo: peak ELO; co-op: the team's average peak ELO
  players INTEGER NOT NULL,
  created_at INTEGER NOT NULL,  -- ms since epoch, set by the server
  version TEXT NOT NULL
);
CREATE INDEX scores_by_wave ON scores (board, wave DESC, elo DESC, created_at ASC);
CREATE INDEX scores_by_elo ON scores (board, elo DESC, wave DESC, created_at ASC);

-- Recent submissions per hashed IP, for rate limiting (pruned after a day).
CREATE TABLE submissions (
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX submissions_by_ip ON submissions (ip_hash, created_at);
