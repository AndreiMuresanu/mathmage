#!/usr/bin/env node
/**
 * Download every online leaderboard entry and save it as a CSV file.
 *
 *   npm run leaderboard:export                       -> exports/leaderboard-<date>.csv
 *   npm run leaderboard:export -- --out scores.csv   -> custom output path
 *   npm run leaderboard:export -- --url http://localhost:8787   -> another server (e.g. the local Worker)
 *
 * The server URL defaults to VITE_LEADERBOARD_URL in .env (the deployed Worker). Uses the public
 * GET /scores API, so no Cloudflare login is needed. One row per entry (a co-op team is one row).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const MODES = ['solo', 'coop']; // keep in sync with RANKED_MODES in src/online/leaderboardTypes.ts
const PAGE = 100; // MAX_PAGE_SIZE

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const baseUrl = (arg('--url') ?? process.env.LEADERBOARD_URL ?? urlFromDotEnv() ?? '').replace(/\/+$/, '');
if (!baseUrl) {
  console.error('No server URL. Set VITE_LEADERBOARD_URL in .env, or pass --url <worker-url>.');
  process.exit(1);
}
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const outPath = resolve(arg('--out') ?? `exports/leaderboard-${stamp}.csv`);

const rows = [];
for (const mode of MODES) {
  // All maps at once, best wave first; page until the server runs out.
  for (let offset = 0; ; offset += PAGE) {
    const url = `${baseUrl}/scores?map=all&mode=${mode}&sort=wave&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`GET ${url} failed: ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    const page = await res.json();
    for (const entry of page.entries) rows.push({ ...entry, mode });
    if (page.entries.length < PAGE) break;
  }
}

// Rank within each board (map + mode), the way the in-game leaderboard does.
const boards = new Map();
for (const r of rows) {
  const key = `${r.map}:${r.mode}`;
  if (!boards.has(key)) boards.set(key, []);
  boards.get(key).push(r);
}
const byWave = (a, b) => b.wave - a.wave || b.elo - a.elo || a.createdAt - b.createdAt || a.id - b.id;
const byElo = (a, b) => b.elo - a.elo || b.wave - a.wave || a.createdAt - b.createdAt || a.id - b.id;
for (const entries of boards.values()) {
  [...entries].sort(byWave).forEach((r, i) => (r.rankByWave = i + 1));
  [...entries].sort(byElo).forEach((r, i) => (r.rankByElo = i + 1));
}
rows.sort((a, b) => a.mode.localeCompare(b.mode) || a.map.localeCompare(b.map) || a.rankByWave - b.rankByWave);

const header = ['id', 'mode', 'map', 'rank_by_wave', 'rank_by_elo', 'wave', 'elo', 'players', 'player_elos', 'team_size', 'submitted_at_utc'];
const lines = [header.join(',')];
for (const r of rows) {
  lines.push(
    [
      r.id,
      r.mode,
      r.map,
      r.rankByWave,
      r.rankByElo,
      r.wave,
      r.elo,
      r.players.map((p) => p.name).join(' | '),
      r.players.map((p) => p.elo).join(' | '),
      r.players.length,
      new Date(r.createdAt).toISOString(),
    ]
      .map(csvField)
      .join(','),
  );
}
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, '﻿' + lines.join('\r\n') + '\r\n', 'utf8'); // BOM so Excel reads UTF-8 names correctly
console.log(`Saved ${rows.length} entries from ${boards.size} board(s) to ${outPath}`);

/** Quote when needed; neutralise leading = + - @ so spreadsheet apps don't run player names as formulas. */
function csvField(value) {
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function urlFromDotEnv() {
  try {
    const match = readFileSync('.env', 'utf8').match(/^\s*VITE_LEADERBOARD_URL\s*=\s*["']?([^"'\r\n]*)/m);
    return match?.[1].trim() || undefined;
  } catch {
    return undefined;
  }
}
