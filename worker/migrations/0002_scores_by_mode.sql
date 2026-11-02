-- "All maps" leaderboard view: sort every board of one mode together.
CREATE INDEX scores_by_mode_wave ON scores (mode, wave DESC, elo DESC, created_at ASC);
CREATE INDEX scores_by_mode_elo ON scores (mode, elo DESC, wave DESC, created_at ASC);
