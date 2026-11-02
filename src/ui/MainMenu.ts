import { h } from './dom';

export function createMainMenu(actions: {
  solo(): void;
  multiplayer(): void;
  leaderboard(): void;
  decks(): void;
}): HTMLDivElement {
  return h(
    'div.screen',
    {},
    h(
      'div.panel.screen-panel.menu',
      {},
      h('h1.title', {}, 'Math Mage'),
      h('p.tagline', {}, 'Solve problems to regenerate mana. Survive as long as you can.'),
      h(
        'div.menu-buttons',
        {},
        h('button.primary.big', { onclick: actions.solo }, 'Play solo'),
        h('button.big', { onclick: actions.multiplayer }, 'Play multiplayer'),
        h('button.big', { onclick: actions.leaderboard }, 'Leaderboard'),
        h('button.big', { onclick: actions.decks }, 'Question decks'),
      ),
      h(
        'div.controls-help',
        {},
        h('div', {}, h('span.key', {}, 'WASD'), ' or ', h('span.key', {}, 'Arrow keys'), ' move'),
        h('div', {}, h('span.key', {}, 'Mouse'), ' aim · hold left click to cast'),
        h('div', {}, h('span.key', {}, '1'), h('span.key', {}, '2'), ' select spell'),
        h('div', {}, h('span.key', {}, 'Space'), ' open / close a question (mostly easy, sometimes hard)'),
        h('div', {}, 'Click the answer field to type · ', h('span.key', {}, 'Enter'), ' submit'),
        h('div', {}, h('span.key', {}, 'P'), ' or ', h('span.key', {}, 'Esc'), ' pause'),
      ),
    ),
  );
}
