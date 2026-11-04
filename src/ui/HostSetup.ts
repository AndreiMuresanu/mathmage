import { MAX_ROOM_PLAYERS, MIN_ROOM_PLAYERS } from '../online/gamesTypes';
import { h } from './dom';
import { mapCards } from './mapCards';
import { cardLink, optionCards } from './optionCards';

export type HostedMode = 'coop-ranked' | 'coop-custom' | 'ffa';

export interface HostChoices {
  mode: HostedMode;
  map: string;
  isPublic: boolean;
  maxPlayers: number;
}

/** Host game: pick the mode, map, visibility and size, then create the room. */
export function createHostSetup(opts: {
  choices: HostChoices;
  onChange(choices: HostChoices): void;
  onSettings(): void;
  onCreate(): Promise<void>;
  onBack(): void;
}): HTMLDivElement {
  const choices = { ...opts.choices };
  const change = (c: Partial<HostChoices>) => {
    Object.assign(choices, c);
    opts.onChange({ ...choices });
  };
  const message = h('p.score-submit-message');
  const create = h('button.primary.big.start-game', { type: 'button' }, 'Create room');
  create.addEventListener('click', async () => {
    create.disabled = true;
    message.textContent = 'Opening the room…';
    try {
      await opts.onCreate();
    } catch (e) {
      message.textContent = (e as Error).message;
      create.disabled = false;
    }
  });

  const sizes = [];
  for (let n = MIN_ROOM_PLAYERS; n <= MAX_ROOM_PLAYERS; n++) sizes.push(n);
  const sizeButtons = sizes.map((n) => {
    const b = h('button.toggle', { type: 'button' }, `${n} players`);
    b.classList.toggle('selected', n === choices.maxPlayers);
    b.addEventListener('click', () => {
      for (const other of sizeButtons) other.classList.toggle('selected', other === b);
      change({ maxPlayers: n });
    });
    return b;
  });

  return h(
    'div.screen',
    {},
    h(
      'div.panel.screen-panel.setup',
      {},
      h('div.screen-header', {}, h('h1', {}, 'Host game'), h('button', { onclick: opts.onBack }, 'Back')),
      h('h3', {}, 'Mode'),
      optionCards<HostedMode>(
        [
          { value: 'coop-ranked', title: 'Ranked co-op PvE', detail: ['Default settings. The team score can go on the leaderboard.'] },
          { value: 'coop-custom', title: 'Custom co-op PvE', detail: ['Your own settings. Not ranked. ', cardLink('Settings…', opts.onSettings)] },
          { value: 'ffa', title: 'FFA PvP', detail: ['Free-for-all. Coming soon.'], disabled: true },
        ],
        choices.mode,
        (mode) => change({ mode }),
      ),
      h('h3', {}, 'Map'),
      mapCards(choices.map, (map) => change({ map })),
      h('h3', {}, 'Who can join'),
      optionCards(
        [
          { value: true, title: 'Public', detail: ['Listed under Join game.'] },
          { value: false, title: 'Private', detail: ['Only people you give the Room ID to.'] },
        ],
        choices.isPublic,
        (isPublic) => change({ isPublic }),
      ),
      h('h3', {}, 'Max players'),
      h('div.button-row', {}, ...sizeButtons),
      create,
      message,
    ),
  );
}
