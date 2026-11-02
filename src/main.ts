import Phaser from 'phaser';
import 'katex/dist/katex.min.css';
import './ui/ui.css';
import { ARENA_HEIGHT, ARENA_WIDTH, type GameConfig } from './config/gameConfig';
import { loadCurrentConfig, saveCurrentConfig } from './config/presets';
import { GameScene } from './game/GameScene';
import { Match } from './game/Match';
import { MenuScene } from './game/MenuScene';
import { QuestionRegistry } from './questions/registry';
import { createConfigScreen } from './ui/ConfigScreen';
import { createDeckManager } from './ui/DeckManager';
import { createMainMenu } from './ui/MainMenu';
import { createMultiplayerScreen } from './ui/MultiplayerScreen';
import { createSoloSetup } from './ui/SoloSetup';
import { createLeaderboardScreen, type LeaderboardView } from './ui/LeaderboardScreen';
import { matchConfig, type MatchSetup } from './game/matchSetup';
import { preloadMathFonts } from './ui/markup';

preloadMathFonts();

const uiRoot = document.getElementById('ui-root')!;
/** The player's saved custom-game settings (also remembers the last map picked). */
let config: GameConfig = loadCurrentConfig();
const registry = new QuestionRegistry(() => config);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: '#07070f',
  scale: {
    parent: 'game-container',
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
  },
  scene: [MenuScene, GameScene],
});

let screen: HTMLElement | null = null;
let match: Match | null = null;

function showScreen(el: HTMLElement | null): void {
  screen?.remove();
  screen = el;
  if (el) uiRoot.append(el);
}

function endMatch(): void {
  match?.destroy();
  match = null;
}

function showMenu(): void {
  endMatch();
  if (!game.scene.isActive('menu')) {
    game.scene.stop('game');
    game.scene.start('menu');
  }
  showScreen(
    createMainMenu({
      solo: showSoloSetup,
      multiplayer: () => showScreen(createMultiplayerScreen({ onBack: showMenu })),
      leaderboard: () => showLeaderboard(),
      decks: showDecks,
    }),
  );
}

/** Ranked or custom, as last chosen on the solo setup screen. */
let soloRanked = true;

function showSoloSetup(): void {
  showScreen(
    createSoloSetup({
      map: config.map,
      ranked: soloRanked,
      onSelectMap: (id) => {
        config = { ...config, map: id };
        saveCurrentConfig(config);
      },
      onSelectRanked: (ranked) => {
        soloRanked = ranked;
      },
      onStart: () => startMatch({ mode: 'solo', ranked: soloRanked, map: config.map }),
      onSettings: () => showSettings(showSoloSetup),
      onBack: showMenu,
    }),
  );
}

/** The board last viewed (defaults to the current map, solo, by wave). */
let leaderboardView: LeaderboardView | undefined;

/** Open the leaderboard, optionally on a given board (e.g. the one just played). */
function showLeaderboard(board?: Partial<LeaderboardView>): void {
  endMatch();
  if (!game.scene.isActive('menu')) {
    game.scene.stop('game');
    game.scene.start('menu');
  }
  leaderboardView = { ...(leaderboardView ?? { map: config.map, mode: 'solo', sort: 'wave' }), ...board };
  showScreen(
    createLeaderboardScreen({
      view: leaderboardView,
      onViewChange: (v) => {
        leaderboardView = v;
      },
      onBack: showMenu,
    }),
  );
}

/** Custom game settings, opened from a match setup screen; `back` returns there. */
function showSettings(back: () => void): void {
  showScreen(
    createConfigScreen({
      config,
      registry,
      onBack: (cfg) => {
        config = cfg;
        back();
      },
    }),
  );
}

function showDecks(): void {
  showScreen(createDeckManager({ registry, onBack: showMenu }));
}

function startMatch(setup: MatchSetup): void {
  endMatch();
  showScreen(null);
  const gameScene = game.scene.getScene('game') as GameScene;
  match = new Match(matchConfig(setup, config), setup, registry, uiRoot, {
    onTypingChange: (typing) => gameScene.setTyping(typing),
    playAgain: () => startMatch(setup),
    exitToMenu: showMenu,
    viewLeaderboard: () => showLeaderboard({ map: setup.map, mode: 'solo' }),
  });
  game.scene.stop('menu');
  game.scene.start('game', { match });
}

// Dev-only hook so headless tests can inspect game state (stripped from production builds).
if (import.meta.env.DEV) {
  (window as unknown as { __mathmage: object }).__mathmage = { get match() { return match; } };
}

showMenu();
