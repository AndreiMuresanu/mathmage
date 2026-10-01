import { h } from './dom';

export function createMainMenu(actions: { play(): void; configure(): void; decks(): void }): HTMLDivElement {
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
        h('button.primary.big', { onclick: actions.play }, 'Play survival'),
        h('button.big', { onclick: actions.configure }, 'Configure match'),
        h('button.big', { onclick: actions.decks }, 'Question decks'),
      ),
      h(
        'div.controls-help',
        {},
        h('div', {}, h('span.key', {}, 'WASD'), ' move'),
        h('div', {}, h('span.key', {}, 'Mouse'), ' aim · hold left click to cast'),
        h('div', {}, h('span.key', {}, '1'), h('span.key', {}, '2'), ' select spell'),
        h('div', {}, h('span.key', {}, 'Z'), h('span.key', {}, 'X'), ' open / close easy · hard question'),
        h('div', {}, 'Click the answer field to type · ', h('span.key', {}, 'Enter'), ' submit · ', h('span.key', {}, 'Esc'), ' close'),
      ),
    ),
  );
}
