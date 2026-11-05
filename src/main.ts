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
import { ClientDriver, HostDriver, LocalDriver, type MatchDriver } from './game/drivers';
import { connectToRoom, newRoomCode } from './net/connect';
import type { StartMsg } from './net/protocol';
import { RoomSession } from './net/room';
import { RoomListing } from './online/games';
import { savedPlayerName, savePlayerName } from './online/leaderboard';
import { World } from './sim/world';
import { saveCharacter, savedCharacter } from './game/characters';
import { createHostSetup, type HostChoices } from './ui/HostSetup';
import { createJoinScreen } from './ui/JoinScreen';
import { createRoomScreen } from './ui/RoomScreen';
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

/** Leave any running match and show the menu backdrop. */
function toMenuScene(): void {
  endMatch();
  if (!game.scene.isActive('menu')) {
    game.scene.stop('game');
    game.scene.start('menu');
  }
}

function showMenu(): void {
  closeRoom();
  toMenuScene();
  showScreen(
    createMainMenu({
      solo: showSoloSetup,
      multiplayer: () => showMultiplayer(),
      leaderboard: () => showLeaderboard(),
      decks: showDecks,
    }),
  );
}

/** Ranked or custom, as last chosen on the solo setup screen. */
let soloRanked = true;
/** The player's character (remembered between visits). */
let character = savedCharacter();
const selectCharacter = (id: string) => {
  character = id;
  saveCharacter(id);
};

function showSoloSetup(): void {
  showScreen(
    createSoloSetup({
      map: config.map,
      ranked: soloRanked,
      character,
      onSelectCharacter: selectCharacter,
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
  closeRoom();
  toMenuScene();
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

/** Start a solo match. */
function startMatch(setup: MatchSetup): void {
  const cfg = matchConfig(setup, config);
  const world = new World(cfg);
  world.players[0].character = character;
  runMatch(cfg, setup, new LocalDriver(world), {
    playAgain: () => startMatch(setup),
    exitToMenu: showMenu,
    viewLeaderboard: () => showLeaderboard({ map: setup.map, mode: 'solo' }),
  });
}

function runMatch(cfg: GameConfig, setup: MatchSetup, driver: MatchDriver, callbacks: Omit<ConstructorParameters<typeof Match>[4], 'onTypingChange'>): void {
  endMatch();
  showScreen(null);
  const gameScene = game.scene.getScene('game') as GameScene;
  match = new Match(cfg, setup, registry, uiRoot, { ...callbacks, onTypingChange: (typing) => gameScene.setTyping(typing) }, driver);
  game.scene.stop('menu');
  game.scene.start('game', { match });
}

// ------------------------------------------------------------------ multiplayer

/** Name shown to other players (remembered; shared with the leaderboard). */
let playerName = savedPlayerName();
let room: RoomSession | null = null;
let listing: RoomListing | null = null;
let roomScreen: { el: HTMLElement; refresh(): void } | null = null;
let hostChoices: HostChoices = { mode: 'coop-ranked', map: config.map, isPublic: true, maxPlayers: 4 };

function showMultiplayer(message?: string): void {
  closeRoom();
  toMenuScene();
  showScreen(
    createMultiplayerScreen({
      name: playerName,
      message,
      character,
      onSelectCharacter: selectCharacter,
      onNameChange: (name) => {
        playerName = name;
        if (name) savePlayerName(name);
      },
      onJoin: showJoin,
      onHost: showHostSetup,
      onBack: showMenu,
    }),
  );
}

function showJoin(): void {
  showScreen(
    createJoinScreen({
      onJoin: async (code) => {
        const transport = await connectToRoom(code);
        enterRoom(await RoomSession.join(transport, code, playerName, undefined, character));
      },
      onBack: () => showMultiplayer(),
    }),
  );
}

function showHostSetup(): void {
  showScreen(
    createHostSetup({
      choices: hostChoices,
      onChange: (c) => {
        hostChoices = c;
      },
      onSettings: () => showSettings(showHostSetup),
      onCreate: async () => {
        const code = newRoomCode();
        const setup: MatchSetup = { mode: hostChoices.mode === 'ffa' ? 'ffa' : 'coop', ranked: hostChoices.mode === 'coop-ranked', map: hostChoices.map };
        const transport = await connectToRoom(code);
        const hosted = RoomSession.host(transport, { code, name: playerName, character, setup, maxPlayers: hostChoices.maxPlayers, isPublic: hostChoices.isPublic });
        if (hostChoices.isPublic) {
          listing = new RoomListing({ code, hostName: playerName, mode: setup.mode === 'ffa' ? 'ffa' : 'coop', ranked: setup.ranked, map: setup.map, players: 1, maxPlayers: hostChoices.maxPlayers });
          listing.start();
        }
        enterRoom(hosted);
      },
      onBack: () => showMultiplayer(),
    }),
  );
}

/** We're in a room (as host or client): wire it up and show the game room. */
function enterRoom(session: RoomSession): void {
  room = session;
  session.onChange = () => {
    listing?.update({ players: session.players.length });
    roomScreen?.refresh();
  };
  session.onStart = (msg) => startNetMatch(session, msg);
  session.onClosed = (reason) => showMultiplayer(reason);
  showRoom();
}

function showRoom(): void {
  if (!room) return showMultiplayer();
  toMenuScene();
  const session = room;
  roomScreen = createRoomScreen(session, {
    onStart: () => {
      const cfg = matchConfig(session.setup, config);
      session.start({ setup: session.setup, config: cfg, seed: (Math.random() * 2 ** 32) >>> 0, players: session.players });
    },
    onLeave: () => showMultiplayer(),
  });
  showScreen(roomScreen.el);
}

function startNetMatch(session: RoomSession, msg: StartMsg): void {
  listing?.stop();
  roomScreen = null;
  const world = new World(msg.config, msg.seed, msg.players.map((p) => p.id));
  for (const p of msg.players) {
    const mage = world.player(p.id);
    if (mage && p.character) mage.character = p.character;
  }
  const driver = session.isHost ? new HostDriver(world, session) : new ClientDriver(world, session);
  runMatch(msg.config, msg.setup, driver, {
    playAgain: () => {
      // Back to the room: the host reopens it (and its listing) for another match.
      if (session.isHost) {
        session.backToLobby();
        listing?.start();
      }
      showRoom();
    },
    exitToMenu: () => showMultiplayer(),
    viewLeaderboard: () => showLeaderboard({ map: msg.setup.map, mode: 'coop' }),
  });
}

/** Leave the current room, if any (and take its public listing down). */
function closeRoom(): void {
  listing?.stop();
  listing = null;
  roomScreen = null;
  if (room) {
    room.onClosed = null;
    room.leave();
    room = null;
  }
}

// Dev-only hook so headless tests can inspect game state (stripped from production builds).
if (import.meta.env.DEV) {
  (window as unknown as { __mathmage: object }).__mathmage = { get match() { return match; }, get room() { return room; }, game };
}

showMenu();
