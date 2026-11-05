import { createCharacterPicker } from './CharacterPicker';
import { h } from './dom';
import { mapCards } from './mapCards';
import { cardLink, optionCards } from './optionCards';

/**
 * Solo match setup: pick a map and a game type — ranked (default settings, for the leaderboard)
 * or custom (your own settings, unranked) — then start. Settings are only reachable from here
 * (and from hosting a multiplayer game).
 */
export function createSoloSetup(opts: {
  /** Currently selected map id. */
  map: string;
  /** Currently selected game type. */
  ranked: boolean;
  character: string;
  onSelectCharacter(id: string): void;
  onSelectMap(id: string): void;
  onSelectRanked(ranked: boolean): void;
  onStart(): void;
  onSettings(): void;
  onBack(): void;
}): HTMLDivElement {
  const gameType = optionCards(
    [
      { value: true, title: 'Ranked Game', detail: ['Default settings. Your score can go on the leaderboard.'] },
      { value: false, title: 'Custom Game', detail: ['Your own settings. Not ranked. ', cardLink('Settings…', opts.onSettings)] },
    ],
    opts.ranked,
    opts.onSelectRanked,
  );
  return h(
    'div.screen',
    {},
    h(
      'div.panel.screen-panel.setup',
      {},
      h('div.screen-header', {}, h('h1', {}, 'Play solo'), h('button', { onclick: opts.onBack }, 'Back')),
      h('h3', {}, 'Character'),
      createCharacterPicker(opts.character, opts.onSelectCharacter),
      h('h3', {}, 'Map'),
      mapCards(opts.map, opts.onSelectMap),
      h('h3', {}, 'Game type'),
      gameType,
      h('button.primary.big.start-game', { onclick: opts.onStart }, 'Start Game'),
    ),
  );
}
