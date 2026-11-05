# Math Mage: online play design

> Living design doc for online play. Phases are built one at a time, in the order under "Phasing";
> update the **Status** line there as each one lands, and amend this doc when a decision changes.

## Context

Everything is single-player today. The simulation was built for multiplayer from day one:
- `World` in `src/sim/world.ts` is pure TypeScript.
- It takes per-player `PlayerIntent`s keyed by player id and emits `SimEvent`s.
- It uses a seeded RNG.
- `trystero` 0.25 is already a dependency.

**Goals**
- Low-latency online play over WebRTC, with zero hosting cost, for at most 20 concurrent players.
- **Game modes:**
  - **Solo:** ranked or custom.
  - **Co-op PvE:** ranked or custom.
  - **FFA PvP:** free-for-all. It exists from the start as a mode option, but its rules are designed later.
- A persistent online leaderboard:
  - Sortable by **highest wave** and **highest ELO**.
  - Filterable by **map** and **game mode**.
  - Top **1000 entries per board**, each with a **date**.
  - A name prompt after you lose.

## Game flow and menus

```
Main menu:  [Play solo]  [Play multiplayer]  [Leaderboard]  [Question decks]
                │                 │
                ▼                 ▼
   Solo setup screen        Multiplayer screen:  [Join game]  [Host game]
   • map cards                   │                     │
   • [Play ranked]               ▼                     ▼
   • [Play custom]          Game list +            Host setup screen
     (+ Settings…)          "Room ID" field        • mode: FFA PvP / Ranked co-op PvE / Custom co-op PvE
                                  │                • map cards
                                  ▼                • public / private, max players
                             Game room  ◄───────── • Settings… (custom modes only)
                             (players, ping, host presses Start)
```

**Removed:** the main menu's "Configure match" button.

**Settings** are only seen and edited while setting up a match: in solo setup, or when hosting.
- The existing settings screen ([ConfigScreen.ts](../src/ui/ConfigScreen.ts)) opens as a sub-screen ("Settings…") and returns to the setup screen.
- Its own Start button is removed.

**Ranked vs custom:**
- **Ranked** (solo or co-op) always uses `DEFAULT_CONFIG` plus the chosen map. These are the only runs that go on the leaderboard.
- **Custom** (solo or co-op) uses the player's saved settings and is never ranked.
- FFA PvP is unranked until its rules exist.

**Solo setup screen:** [SoloSetup.ts](../src/ui/SoloSetup.ts) (replaced the old map screen).
- Map cards.
- "Play ranked" and "Play custom". Each starts the game at once.
- A "Settings…" link next to Play custom.

**Join game screen:**
- A live list of open public games: host, mode, map, players / max, region.
- A "Room ID" field for joining private games directly.

**Host setup screen:**
- Mode: FFA PvP, Ranked co-op PvE, or Custom co-op PvE.
- Map cards.
- Public or private.
- Max players (2–4).
- Settings… (custom modes only).
- "Create room" opens the game room.

**Game room:**
- Room ID, with a copy button.
- Players with their names and pings. Names can be edited here.
- The mode and map.
- "Start" (host only, once at least 2 players are in).

**Multiplayer rule:** the slow motion after a wrong answer is **0** in every multiplayer mode, since game time is shared.

## Architecture at a glance

```
 Browser A (host)            Browser B / C (clients)
 ┌──────────────┐  WebRTC   ┌──────────────┐
 │ World (sim)  │◄─intents──│ prediction + │
 │ authoritative│──snapshot►│ interpolation│
 └──────┬───────┘           └──────┬───────┘
        │ Nostr relays (free, public): WebRTC signalling for a game room only
        │
        └──── HTTPS ──► Cloudflare Worker + D1  (free tier)
                        • leaderboard API (+ admin delete)
                        • open-games list (matchmaking)
                        • mints short-lived TURN credentials
```

- **Gameplay traffic is peer-to-peer.** Players connect directly over WebRTC, so latency is just the network path between them; no game server sits in the middle.
- **Signalling** uses Trystero's default Nostr strategy (free public relays, no setup). It's only used to connect the at-most-4 peers of one game room. If it proves flaky, switch to Trystero's MQTT strategy, which is a one-line change.
- **Persistent data** (leaderboard, open-games list) can't be peer-to-peer. A Cloudflare Worker with a D1 (SQLite) database handles it:
  - The free tier (100k requests a day) is far beyond 20 players.
  - It never pauses when idle.
  - The code lives in this repo under `worker/`.
- **TURN relay for strict networks.** Roughly 10% of player pairs can't connect directly and need a relay. Cloudflare's TURN service has a free tier of 1,000 GB a month.
  - The Worker hands out short-lived TURN credentials, so the API key never ships in the client.
  - Traffic only goes through TURN when a direct connection fails.

## Accounts and setup you'll need

| Service | Account? | Cost | One-time setup |
|---|---|---|---|
| GitHub Pages (hosting the game) | Already have it | Free | None (already deployed with `npm run deploy`). |
| Nostr relays (WebRTC signalling) | **No** | Free | None. Trystero uses public relays out of the box. |
| Cloudflare Workers + D1 (leaderboard, game list) | **Yes**: a free Cloudflare account | Free tier (100k requests/day, 5 GB D1) | Four steps (below). |
| Cloudflare TURN (only for players whose networks block direct P2P) | Same Cloudflare account | Free tier, 1,000 GB/month | In the dashboard, create a TURN key, then store its ID and token as Worker secrets. Optional: online play works without it for most players. Added in phase 6. |

Cloudflare one-time setup:
1. Sign up at dash.cloudflare.com (the Workers free plan).
2. Run `npx wrangler login`. This opens a browser to authorise the CLI.
3. Run `npx wrangler d1 create mathmage` and paste the printed database id into `worker/wrangler.toml`.
4. Run `npx wrangler secret put ADMIN_KEY` (and the TURN secrets later), then `npx wrangler deploy`. Put the printed Worker URL in `.env` as `VITE_LEADERBOARD_URL`.

The phase that adds the Worker (phase 2) will include these steps in the README. Everything before it (phase 1) needs no account.

## Leaderboard

**Schema (D1):**

```sql
scores(id INTEGER PRIMARY KEY, board TEXT, map TEXT, mode TEXT,
       names TEXT,   -- JSON [{name, elo}]: one for solo, the whole team for co-op
       wave INTEGER, elo INTEGER, players INTEGER, created_at INTEGER, version TEXT)
INDEX (board, wave DESC, elo DESC), INDEX (board, elo DESC, wave DESC)
```

- `board` is `map:mode`, e.g. `mazy:coop`. Ranked modes are `solo` and `coop`.
- **Co-op = one entry per team.**
  - Every player has their **own independent ELO**, and the row shows each player's peak ELO next to their name (stored in `names`).
  - The row's `elo` column, used for "sort by ELO", is the **average** of the players' peak ELOs, rounded.
- **Date:** `created_at` is set by the server.

**`GET /scores`**
- Parameters: `map`, `mode`, `sort=wave|elo`, `limit` (≤100), `offset`.
- The secondary sort is the other score, then oldest first.

**`POST /scores`** takes `{names, map, mode, wave, version, configHash}` and does three things.
- **Validates:**
  - Each name: 1–20 characters, trimmed, with control characters stripped.
  - Solo: exactly 1 name. Co-op: 2–4 names.
  - `map` and `mode` must be known values.
  - `wave` and `elo` must be within sane bounds.
  - `configHash` must equal the hash of `DEFAULT_CONFIG`. This is a sanity check that it was a ranked game. The Worker imports `src/config/gameConfig.ts`, and one deploy script releases the client and the Worker together.
- **Rate-limits** each IP (hashed) to a handful of submissions per hour.
- **Trims** the board: it deletes rows that are in neither the top 1000 by wave nor the top 1000 by ELO. The response includes the entry's rank under both sorts.

**`DELETE /scores/:id`:** for moderation. It requires an `ADMIN_KEY` secret (`wrangler secret put`). Cheating is handled by moderation only.

**Client**
- **`src/online/leaderboard.ts`:** a `fetch` wrapper plus `configHash(cfg)`.
  - The base URL comes from `VITE_LEADERBOARD_URL`.
  - If it's unset, the leaderboard UI shows "offline".
- **Game-over screen, ranked runs:**
  - Solo shows a name field (pre-filled from the last name used) with Submit and Skip.
  - Co-op: the host submits one team entry using the names from the room, and everyone sees the resulting ranks.
  - After submitting, it shows "#12 by wave · #40 by ELO".
  - Custom and FFA games show no submit box.
- **Values submitted:**
  - Wave: `world.wave.round`.
  - ELO: the per-player peak from `SkillRatings`.
  - Map: `world.map.id`.
- **`LeaderboardScreen`:**
  - Map and mode dropdowns.
  - A sort toggle: Wave / ELO.
  - A table of rank, names, wave, peak ELO and date.
  - 50 rows per page.

## Co-op PvE: downed and revive

- **A downed mage:** a player at 0 HP is *downed*, not removed. Their body stays where they fell, they can't move, cast or answer questions, and enemies ignore them.
- **Reviving:** a living teammate holds **F** while touching the body (within `coop.reviveRange`) for `coop.reviveSeconds` (default **1.5**). It costs no mana.
  - The progress resets if the teammate lets go, moves away, or is downed.
  - Being hit doesn't reset it.
  - Several teammates at once don't speed it up.
- **After a revive:** the mage is back with `coop.reviveHp` (default 50% of max HP) and `coop.reviveInvulnSeconds` (default **3**) of invincibility, blinking. This uses the existing `invulnRemaining`.
- **Game over** happens when every mage is downed at the same time. Solo is unchanged: down means game over.
- **Friendly fire:** players' sparks, fireball blasts and lasers also hurt teammates, scaled by `coop.friendlyFire` (default 1 = full damage; 0 = off). A caster never hits themselves, and downed mages can't be hit.
- **Implementation:**
  - `PlayerIntent.reviving`, `PlayerState.downed` and `PlayerState.reviveProgress`.
  - Events: `downed` and `revived`.
  - A progress ring over the body, and a "Hold F to revive" hint.
  - A new `coop` config group.

## Netcode (host-authoritative)

**Transport: `src/net/transport.ts`.** A small interface (`send`, `onMessage`, `peers`, `onJoin`/`onLeave`, `ping`) with two implementations:
- **`TrysteroTransport`:** `joinRoom({appId: 'mathmage', turnConfig}, roomId)` and `room.makeAction(...)`.
- **`MemoryTransport`:** for deterministic tests.

**Protocol: `src/net/protocol.ts`.** Versioned; peers on different game versions refuse to start.

| Message | Direction | Rate | Contents |
|---|---|---|---|
| `hello` | all | once | name, game version |
| `start` | host → all | once | mode, config, map, seed, player ids + names |
| `intent` | client → host | ~30 Hz | seq, move, aim, casting, selected spell, reviving |
| `answer` | client → host | per question | typeIndex, correct, stun multiplier (host calls `world.answerQuestion`) |
| `snap` | host → all | 20 Hz | tick, last-processed intent seq per player, players / enemies / projectiles / pickups / wave as compact arrays |
| `events` | host → all | with each snap | SimEvents for effects |
| `end` | host → all | once | final stats (and leaderboard ranks, for ranked co-op) |

A snapshot with 60 enemies is about 3 KB of JSON, so about 60 KB/s per client.

**Host:** runs the real `World` with every player's id. It applies each client's latest intent every tick and broadcasts snapshots.

**Clients:**
- **Own player (prediction):** the client moves its own player immediately using shared movement code. It keeps unacknowledged inputs, and on each snapshot resets to the host's position and replays them, blending corrections over about 100 ms. `movePlayer` and `resolveWalls` move into pure functions in `src/sim/movement.ts`.
- **Everything else** is drawn about 100 ms in the past, interpolated between snapshots. Enemy projectiles are drawn slightly ahead (extrapolated) so you don't get hit by shots you couldn't see.
- **Instant feedback:** casting shows a cosmetic projectile at once; the authoritative one replaces it.

**Questions and ELO stay local, per player.**
- Each player has their own independent ELO. They draw, answer and rate their own questions with their own `SkillRatings`, and only the outcome goes to the host.
- The HUD shows your own rating.
- At game over, each player's peak ELO is sent to the host (in `end`) for the team entry and the results screen.

**Pause:** host only, pauses everyone.

**Wiring:** [Match.ts](../src/game/Match.ts) talks to a driver:
- `LocalDriver`: today's behaviour.
- `HostDriver`.
- `ClientDriver`: a world-shaped view built from snapshots.

[GameScene.ts](../src/game/GameScene.ts) keeps reading `match.world.*`.

**Disconnects:**
- **A client leaves:** its mage is removed.
- **The host leaves:** the match ends for everyone ("host left").
- **Later:** host migration.

## Matchmaking: open-games list on the Worker

- **D1 table:** `games(code, secret_hash, host_name, mode, map, players, max, region, updated_at)`.
- **`POST /games`:** a public host sends a heartbeat every 15 s. The first call returns a per-room secret.
- **`GET /games`:** lists rooms with a heartbeat in the last 45 s, so stale rooms vanish on their own.
- **`DELETE /games/:code`:** sent with the secret when the match starts or the host quits.
- **Region:** each listing gets a rough region from Cloudflare (`cf.colo`). The real ping is shown once connected (`room.ping`).
- **Private games** are never listed; they're only reachable by Room ID.
- **Load:** only hosts write, about 58k writes a day even with 10 hosts, within the free tier.

## FFA PvP (placeholder)

- It appears as a mode in Host setup, using the same rooms, netcode and maps.
- Rules (friendly fire, scoring, win condition, whether question stuns apply to others) are designed later.
- Unranked until then. The leaderboard `mode` list is shared, so FFA can be added as a board later.

## Risks and known weaknesses

1. **Scores can be faked.** The defence is moderation plus the rate limit, as decided. Real anti-cheat needs a server that runs the game itself, which isn't free.
2. **Lost packets stall updates.** Trystero's data channels are reliable and ordered, so one lost packet delays later snapshots (head-of-line blocking). Small, frequent snapshots limit the damage.
3. **Prediction ignores enemies.** Enemies are solid, so predicted movement can disagree with the host when shoved or rooted. Corrections blend instead of snapping.
4. **The host carries the game.** The host has zero lag, and a slow host slows everyone down. If the host leaves, the match ends (until host migration).
5. **Connecting can be slow.** Joining a room through Nostr can take 2–10 s. Browsing is instant because the list comes from the Worker.
6. **Latency depends on geography.** P2P is the fastest path, but it can't beat distance.
7. **Deploy together.** The client and Worker must release together, since the Worker checks the default-settings hash. Use one deploy script.
8. **Peak ELO rewards longer runs.** The rating resets every match, so longer runs have more chances to climb.
9. **Old cached builds.** The protocol version check refuses mismatched peers.

## Alternatives considered

| Area | Chosen | Alternative | Why not (for now) |
|---|---|---|---|
| Netcode model | Host-authoritative snapshots | Deterministic lockstep | Needs identical floating-point maths across browsers. Adds input delay, and desyncs are hard to debug. |
| | | Rollback | Overkill for dozens of entities. |
| | | Dedicated server | Better against cheating and NAT problems, but free tiers sleep or have limits. |
| Signalling | Nostr | MQTT / Supabase / Firebase strategies | Similar; the hosted ones need accounts. |
| Persistent store | Cloudflare Worker + D1 | Supabase free | Pauses after a week idle. |
| | | Firebase | Trimming needs the paid plan. |
| | | Nostr events | No persistence guarantee, and easy to spam. |
| Game discovery | Worker game list | Trystero lobby room | Slow, and up to 190 connections at 20 players. |

## Phasing (implemented one at a time)

Status (2026-11-05): **phases 1–7 done** (4 and 5 were built together). Host migration not started. Worker changes from phases 4–6 need `npm run deploy:all`; the TURN relay also needs a Cloudflare TURN key (README → Multiplayer).

Phase 1 notes:
- Match setup lives in `src/game/matchSetup.ts` (`MatchSetup`, `matchConfig`).
- The main menu shows a disabled "Leaderboard (coming soon)" button until phase 2.
- The Multiplayer screen has disabled Join / Host buttons until phases 4–5.

Phase 2 notes:
- Worker code: `worker/src/api.ts`; schema: `worker/migrations/0001_scores.sql`; client: `src/online/`.
- Request fields use `players: [{name, elo}]` (stored in the `names` column).
- Ranked co-op submission (host submits the team) is wired in phase 5; the API already accepts it.
- Setup and deploy steps are in README → "Online leaderboard".

Phase 3 notes:
- "Downed" is `PlayerState.alive === false`. Everything that ignores non-alive players (targeting, shots, heal orbs, pathfinding, questions) already treats bodies correctly. Game over = every player down, so solo is unchanged.
- Reviving: `World.updateRevives`, `PlayerIntent.reviving` (F), `PlayerState.reviveProgress`, `revived` event, `coop` config group. A wrong-answer stun blocks reviving; getting hit doesn't.
- `World.addPlayer(id)` adds a mage mid-match (the dev F3 test teammate; reusable for multiplayer joins).
- The renderer draws every player (teammates in blue; downed = faded body with a cross and a revive ring). The HUD shows "Hold F to revive" / "You're down!".
- Events about other players (stunned, mana, heals, downed) are handled per player, so phase 4 only needs to feed them in.
- Adding `coop` changed `DEFAULT_CONFIG`, so release with `npm run deploy:all` (the leaderboard checks the default-settings fingerprint).

Phases 4–5 notes (online co-op):
- `src/net/`: `Transport` (Trystero for real; BroadcastChannel for same-browser tabs with `?net=local` in dev; `MemoryHub` for tests), `protocol.ts` (messages, snapshots), `room.ts` (RoomSession: roster, refuse full / started / version mismatch, host-left).
- `src/game/drivers.ts`: `Match` runs through a `MatchDriver`. `HostDriver` owns the real World, applies clients' queued intents with the durations they predicted with, and sends snapshot + events every 50 ms. `ClientDriver` mirrors snapshots into a `World` (the renderer is unchanged), draws others 100 ms in the past (interpolated), predicts and reconciles its own mage, and delays events to match what's on screen.
- `World.sharedTime` disables wrong-answer slow motion in multiplayer (a flag, so ranked co-op still matches `DEFAULT_CONFIG`). Spells travel in intents; question stats are per player.
- Menus: Play multiplayer (name) → Join game (Worker list refreshed every 5 s + Room ID) / Host game (Ranked co-op, Custom co-op, FFA disabled; map; public/private; 2–4 players) → Game room (Room ID + copy, players + pings, Start). Game over: "Back to room" / "Leave".
- Worker: `/games` (POST create → secret; heartbeat with secret every 15 s; listings expire after 45 s; DELETE with secret), `worker/src/games.ts`, migration `0003_games.sql`.
- Ranked co-op: clients send their peak ELO (`peak`), the host submits one team entry, and everyone sees the ranks (`submitted`).
Phase 7 notes (FFA PvP):
- `World.pvp`: other players are opponents (full damage; never yourself), kills are credited to the last player who hit you within 10 s (`PlayerState.kills/deaths/lastHit`), no revives, and dead players respawn after `ffa.respawnSeconds` at the open spot farthest from everyone, with `ffa.spawnProtectionSeconds` of invincibility. Events: `killed` (victim, killer, cause = spell index or enemy kind), `respawned`.
- Win condition (`ffa.winCondition`): first to `killTarget` kills (default 5), most kills after `timeLimitMinutes`, or endless (the host can End match from the pause menu). `World.winnerIds` = everyone tied for the most kills.
- Enemies off by default (`ffa.enemies`); when on, waves are scaled by `ffa.enemyAmount`.
- UI: kills leaderboard under the bars (− / + to collapse, remembered), goal line in place of the round label, death panel ("Hana vaporized you." — laser: vaporized you; fireball / explosive: turned you into tiny pieces; spark / other: made you ✨disappear✨), respawn countdown and standings, results screen. Host setup: FFA mode with Settings…, win condition + kill target / time stepper, enemies on/off + amount stepper; max players is a 2–10 stepper (rooms and co-op team scores now allow up to 10).

Phase 6 notes (polish):
- Projectiles are drawn from the newest snapshot moved along their velocity (not 100 ms behind); snapshot projectile tuples now carry velocity + owner (PROTOCOL_VERSION 2).
- Instant casts: a client shows a cosmetic "ghost" projectile (or its laser beam) the moment it casts, using predicted cooldowns; the host's real projectile replaces the ghost, lined up using half the measured ping. Own beam events from the host are skipped.
- Ping: `PingMeter` measures round trips every 2 s; the HUD shows "Ping N ms" (host: "Hosting · Ping" = the slowest client), coloured green / yellow / red.
- Reconnects: `RoomSession.reconnectGraceMs` (20 s). Mid-match, a dropped player stays (standing still) and the host's mage stays for clients; if they reconnect in time play continues, otherwise they're removed / the room closes. A deliberate Leave sends `bye` so nobody waits.
- TURN: Worker `GET /turn` (worker/src/turn.ts) mints Cloudflare TURN credentials from the `TURN_KEY_ID` / `TURN_KEY_API_TOKEN` secrets; the client fetches them (3 s timeout, cached 1 h) and passes them to Trystero as `turnConfig`. Without the secrets it returns 404 and the game connects as before.

- Hidden host tab: `Match` switches the host to a Web Worker ticker (`src/game/backgroundTicker.ts`, ~30 Hz) while `document.hidden`, so the match keeps running with the host standing still; a hidden client sends one idle intent so its mage stops. Clients show "Waiting for the host…" after 1.5 s without a snapshot (`ClientDriver.hostSilentMs`). Hosts see a reminder in the room and at match start. Very long background periods may still be throttled by the browser.

1. **Menus and match setup** (no networking or backend):
   - New main menu.
   - Solo setup screen (map cards, Play ranked / Play custom, Settings…).
   - Remove "Configure match" from the main menu.
   - `mode` on matches.
   - Ranked always runs on `DEFAULT_CONFIG`.
   - Placeholder Multiplayer screen.
2. **Leaderboard:** the Worker and D1, client API, game-over submit for ranked solo, leaderboard screen, admin delete, deploy script.
3. **Co-op downed and revive** in the sim, tested with two local players.
4. **Netcode core:** transport, protocol, Host / Client drivers, shared movement module, slow motion set to 0 online. Tested with `MemoryTransport` and with two tabs joining the same Room ID.
5. **Matchmaking UI:** Worker game list, Join game list plus Room ID, Host setup, game room, ranked co-op team submission.
6. **Polish:** TURN credentials, ping display, instant cosmetic casts, reconnect handling. Later: host migration.
7. **FFA PvP rules** (design first).

## Verification (per phase)

- `npx tsc --noEmit` and `npx vitest run` pass. Each phase adds unit tests for its pure logic:
  - Ranked config forcing.
  - Leaderboard validation and trimming.
  - `configHash` stability.
  - Revive rules.
  - Protocol round trips.
  - Prediction convergence.
  - Host + client sync over `MemoryTransport`.
  - Game-list expiry.
- **Worker:** `wrangler dev` locally. Submit, read back, check sorting, filters and trimming past 1000 rows.
- **Headless browser** checks of each new screen flow. For networking: two browser contexts joining the same Room ID over real Nostr relays.
