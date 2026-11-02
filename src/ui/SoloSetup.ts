import { h } from './dom';
import { mapCards } from './mapCards';

/**
 * Solo match setup: pick a map and a game type — ranked (default settings, for the leaderboard)
 * or custom (your own settings, unranked) — then start. Settings are only reachable from here.
 */
export function createSoloSetup(opts: {
  /** Currently selected map id. */
  map: string;
  /** Currently selected game type. */
  ranked: boolean;
  onSelectMap(id: string): void;
  onSelectRanked(ranked: boolean): void;
  onStart(): void;
  onSettings(): void;
  onBack(): void;
}): HTMLDivElement {
  const settingsLink = h(
    'a',
    {
      href: '#',
      onclick: (e: Event) => {
        e.preventDefault();
        e.stopPropagation(); // don't also select the card
        opts.onSettings();
      },
    },
    'Settings…',
  );
  const option = (title: string, ...detail: (string | Node)[]) =>
    h('button.option-card', { type: 'button' }, h('strong', {}, title), h('span.muted', {}, ...detail));
  const rankedCard = option('Ranked Game', 'Default settings. Your score can go on the leaderboard.');
  const customCard = option('Custom Game', 'Your own settings. Not ranked. ', settingsLink);
  const select = (ranked: boolean) => {
    rankedCard.classList.toggle('selected', ranked);
    customCard.classList.toggle('selected', !ranked);
  };
  select(opts.ranked);
  rankedCard.addEventListener('click', () => {
    select(true);
    opts.onSelectRanked(true);
  });
  customCard.addEventListener('click', () => {
    select(false);
    opts.onSelectRanked(false);
  });

  return h(
    'div.screen',
    {},
    h(
      'div.panel.screen-panel.setup',
      {},
      h('div.screen-header', {}, h('h1', {}, 'Play solo'), h('button', { onclick: opts.onBack }, 'Back')),
      h('h3', {}, 'Map'),
      mapCards(opts.map, opts.onSelectMap),
      h('h3', {}, 'Game type'),
      h('div.setup-choices', {}, rankedCard, customCard),
      h('button.primary.big.start-game', { onclick: opts.onStart }, 'Start Game'),
    ),
  );
}
