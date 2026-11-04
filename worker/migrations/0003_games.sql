-- Open public game rooms (matchmaking). Hosts refresh their row every 15 s; rows older than
-- 45 s are treated as gone and deleted on the next read.
CREATE TABLE games (
  code TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,   -- SHA-256 of the host's secret (needed to refresh / delete)
  host_name TEXT NOT NULL,
  mode TEXT NOT NULL,
  ranked INTEGER NOT NULL,
  map TEXT NOT NULL,
  players INTEGER NOT NULL,
  max_players INTEGER NOT NULL,
  region TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX games_by_updated ON games (updated_at);
