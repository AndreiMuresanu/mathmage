import Phaser from 'phaser';
import 'katex/dist/katex.min.css';
import './ui/ui.css';
import { ARENA_HEIGHT, ARENA_WIDTH, cloneConfig, type GameConfig } from './config/gameConfig';
import { loadCurrentConfig, saveCurrentConfig } from './config/presets';
import { GameScene } from './game/GameScene';
import { Match } from './game/Match';
import { MenuScene } from './game/MenuScene';
import { QuestionRegistry } from './questions/registry';
import { createConfigScreen } from './ui/ConfigScreen';
import { createDeckManager } from './ui/DeckManager';
import { createMainMenu } from './ui/MainMenu';
import { preloadMathFonts } from './ui/markup';

preloadMathFonts();

const uiRoot = document.getElementById('ui-root')!;
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
      play: () => startMatch(config),
      configure: showConfig,
      decks: showDecks,
    }),
  );
}

function showConfig(): void {
  showScreen(
    createConfigScreen({
      config,
      registry,
      onStart: (cfg) => {
        config = cfg;
        saveCurrentConfig(config);
        startMatch(config);
      },
      onBack: (cfg) => {
        config = cfg;
        showMenu();
      },
    }),
  );
}

function showDecks(): void {
  showScreen(createDeckManager({ registry, onBack: showMenu }));
}

function startMatch(cfg: GameConfig): void {
  endMatch();
  showScreen(null);
  const gameScene = game.scene.getScene('game') as GameScene;
  match = new Match(cloneConfig(cfg), registry, uiRoot, {
    onTypingChange: (typing) => gameScene.setTyping(typing),
    playAgain: () => startMatch(config),
    exitToMenu: showMenu,
  });
  game.scene.stop('menu');
  game.scene.start('game', { match });
}

showMenu();
