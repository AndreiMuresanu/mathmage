# Math Mage

A browser-based, top-down 2D survival shooter. You play a mage who regenerates mana **only by answering math questions**. Then you spend that mana on spells to survive waves of enemies. A wrong answer stuns you and shows the worked solution.

- **Audience:** high school (grades 9–12) through university / AMC level.
- **Planned:** peer-to-peer co-op. The simulation is already built with this in mind.

## Quick start

```bash
npm install
npm run dev        # Vite dev server at http://localhost:3000/mathmage/
npm test           # Vitest unit tests (sim, questions, rating, markup)
npm run build      # type-check (tsc) + production build into dist/
npm run deploy     # build and publish dist/ to GitHub Pages (gh-pages)
npm run deck:contest   # regenerate src/questions/data/contest.json (see "Question content")
```

`vite.config.ts` sets `open: true`, so `npm run dev` opens a browser tab. To start the server without opening a tab (for example during automated testing), run:

```bash
BROWSER=none npx vite --port 3000
```

## Controls (defaults)

| Action | Input |
|---|---|
| Move | WASD or arrow keys |
| Aim / cast | Mouse / left click |
| Select spell | Number keys (1 Spark, 2 Fireball, 3 Laser) |
| Open / close a question | Space |
| Pause | P, Esc, or the on-screen button |

You must click the answer box before typing. After you submit, the box loses focus so you can move again straight away. Typing `andrei` always counts as correct (a testing shortcut).

## Core philosophies

1. **Math is the mana economy.** There is no passive mana regeneration. Questions are the only source of mana, and they are deliberately part of the combat loop:
   - You can't open a question while stunned.
   - A wrong answer, a timeout, or a skip costs you a stun. A skip costs half the normal stun.
2. **Every number is configurable.** Each tunable lives in one typed config object, and the settings screen is generated from a schema. Don't hard-code a gameplay value: add it to the config instead. See "Adding a tunable" below.
3. **The simulation is pure TypeScript, separate from rendering.**
   - `src/sim/` has no Phaser or DOM imports. It takes per-player *intents* and emits *events*.
   - It uses a seeded RNG.
   - This keeps it unit-testable. It also lets a host run the authoritative world for co-op later and send state/events to peers.
   - Phaser (`src/game/`) only draws the world and turns events into effects.
4. **Adaptive difficulty is always on.** An Elo-style rating picks questions for each player:
   - Every question has a fixed difficulty rating; no learning from play.
   - The player's rating resets to the starting rating every match.
   - Scoring is speed-weighted, relative to the player's own pace.
   - The Easy / Medium / Hard tiers are target *success chances* (90% / 70% / 50%), not fixed content. Their weights aim for about 85% overall success.
5. **Questions should be fast and fun.** Each should take about 20 seconds or less. Avoid heavy mental arithmetic unless that is the point of the question. Every question ships with worked solution steps.
6. **UI is DOM, gameplay is canvas.**
   - Menus, the HUD, the question window and the stun panel are plain DOM elements over the Phaser canvas.
   - KaTeX renders the math.
   - mathjs (sandboxed) checks answers.
   - Clicks on UI elements must not cast spells: casting checks `pointer.downElement === canvas`.

## Repository layout

```
index.html               Entry HTML (mounts the canvas + UI root)
vite.config.ts           Vite config (base path /mathmage/ for GitHub Pages, port 3000)
scripts/
  generate_contest_deck.py   Source of truth for the contest deck; verifies every answer
public/                  Static assets (favicon, icons)
shots/                   Screenshots from headless test runs (not part of the game)
src/
  main.ts                Boot: creates the Phaser game, wires menus ↔ matches, dev hook
  config/
    gameConfig.ts        GameConfig type + DEFAULT_CONFIG (every tunable), config migration
    configSchema.ts      Labels/ranges/help text that generate the settings screen
    presets.ts           Saving/loading the current config and named presets (localStorage)
  sim/                   Pure game simulation (no Phaser, no DOM)
    world.ts             World.step(): players, enemies, spells, projectiles, explosions,
                         lasers, heal orbs, waves, damage, stuns
    waves.ts             Wave composition and per-wave scaling / round time limits
    types.ts             State types, PlayerIntent (input), SimEvent (output)
    world.test.ts        Simulation unit tests
  game/                  Phaser layer
    Match.ts             One match: owns the World, question flow, ratings, HUD, game over
    GameScene.ts         Renders the World each frame; particles, mana-orb vortex, effects
    MenuScene.ts         Animated backdrop behind menus
    textures.ts          Generated textures (circle, pixel squares for blocky particles)
  questions/
    types.ts             Question / AnswerSpec / QuestionSource / Deck types
    registry.ts          Builds all sources; picks a question for a tier near a target rating
    rating.ts            Elo math: success chance, rating updates, speed nudge, calibration
    near.ts              Gaussian-weighted "pick something near this rating" helper
    answerCheck.ts       Sandboxed mathjs answer checking (numeric, expression, text)
    storage.ts           Imported decks in localStorage
    sources/
      arithmetic.ts      Generated arithmetic ladder (1+1 upward)
      medium.ts          Generated one-or-two-step questions (equations, %, powers, fractions…)
      algebra_tricks.ts  "Solve for x" questions that each need one trick
      deck.ts            Generic source for fixed decks (built-in or imported)
      format.ts          Shared number/LaTeX formatting helpers
    data/
      hard-math.json     Hand-written hard deck
      contest.json       GENERATED contest deck (don't edit by hand)
    import/              CSV/TSV and JSON flashcard import + answer parsing
  ui/                    DOM overlay
    QuestionWindow.ts    Translucent question popup, answer box, skip button, timer
    StunPanel.ts         Stun countdown, correct answer, "Show solution", slow-mo + pause
    Hud.ts               HP/mana bars, spell bar, wave timer, rating/tier readout
    ConfigScreen.ts      Settings screen generated from configSchema.ts
    MainMenu.ts, GameOverScreen.ts, DeckManager.ts
    markup.ts            Text + $LaTeX$ → HTML via KaTeX (with font preloading)
    dom.ts               Tiny element builder h('div.class', props, ...children)
    ui.css               All UI styling
  util/rng.ts            Seeded PRNG (mulberry32) + weighted pick
```

## Important references

- **Phaser 4 documentation for this project:** [`node_modules/phaser/skills/`](node_modules/phaser/skills/). It has one folder per topic, each with a `SKILL.md`. Read the relevant one before writing Phaser code. Phaser 4 differs from v3, and most online examples are for v3. Useful topics:
  - `v3-to-v4-migration/`, `v4-new-features/`
  - `scenes/`, `game-setup-and-config/`
  - `input-keyboard-mouse-touch/`
  - `particles/`, `tweens/`, `filters-and-postfx/`
  - `sprites-and-images/`, `graphics-and-shapes/`, `render-textures/`
  - `cameras/`, `scale-and-responsive/`, `time-and-timers/`
- **Default configuration:** `DEFAULT_CONFIG` in [`src/config/gameConfig.ts`](src/config/gameConfig.ts). Players change their own copy in the in-game settings; it's saved in localStorage under `mathmage.config`. Presets are under `mathmage.presets` and imported decks under `mathmage.decks`.
- **Rating scale:** the comment at the top of [`src/questions/rating.ts`](src/questions/rating.ts) maps rating numbers to kinds of question (about 100 = 1+1, about 2000 = AMC).

## Common tasks

### Adding a tunable
1. Add the field to the `GameConfig` type and to `DEFAULT_CONFIG` in `src/config/gameConfig.ts`.
2. Add one line for it in `src/config/configSchema.ts` (label, min/max/step, help text). The settings screen picks it up automatically.
3. Read it from `cfg` in the sim or game code.
4. If an existing saved config needs a change beyond picking up new defaults, bump `CONFIG_VERSION` and handle it in `migrateSavedConfig`. `mergeWithDefaults` already fills in new fields automatically.

### Question content
- **Contest deck:** edit `scripts/generate_contest_deck.py`, then run `npm run deck:contest`. Never edit `contest.json` by hand; the script verifies answers and overwrites the file.
- **Generators:** add a generator in `sources/medium.ts`, `arithmetic.ts` or `algebra_tricks.ts`. Give each question:
  - a `difficulty` rating
  - an exact answer
  - worked `steps`

  The tests check generated answers. Tag questions that are mostly computation with `MENTAL_MATH_TAG` (`src/questions/types.ts`); they're drawn far less often (setting: `adaptive.mentalMathWeight`).
- **Decks:** players import their own decks through the in-game deck manager (CSV/TSV or JSON). Imported cards without a `difficulty` default to 1000, and each imported deck has its own rating ("skill").

### Testing
- **Unit tests:** `npm test`. Simulation behaviour is tested headlessly through `World.step()`.
- **In-browser checks:**
  - Start the dev server without opening a browser tab (`BROWSER=none`).
  - Drive the game headlessly with Playwright.
  - In dev builds, `window.__mathmage.match` exposes the live `Match` (and its `world`) for inspecting and setting up state. It's stripped from production builds.

## Tech stack

Vite · TypeScript · Phaser 4 · KaTeX · mathjs · Vitest · trystero (planned P2P co-op transport) · gh-pages
