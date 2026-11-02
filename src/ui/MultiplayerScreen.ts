import { h } from './dom';

/**
 * Multiplayer entry point: join an open game or host one. Placeholder until the netcode and
 * matchmaking phases land (see docs/ONLINE_PLAN.md).
 */
export function createMultiplayerScreen(opts: { onBack(): void }): HTMLDivElement {
  return h(
    'div.screen',
    {},
    h(
      'div.panel.screen-panel.menu',
      {},
      h('div.screen-header', {}, h('h1', {}, 'Multiplayer'), h('button', { onclick: opts.onBack }, 'Back')),
      h(
        'div.menu-buttons',
        {},
        h('button.big', { disabled: true }, 'Join game'),
        h('button.big', { disabled: true }, 'Host game'),
      ),
      h('p.muted', {}, 'Online co-op and PvP are coming soon.'),
    ),
  );
}
