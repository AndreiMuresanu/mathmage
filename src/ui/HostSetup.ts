import type { FfaConfig, FfaWinCondition } from '../config/gameConfig';
import { MAX_ROOM_PLAYERS, MIN_ROOM_PLAYERS } from '../online/gamesTypes';
import { h } from './dom';
import { mapCards } from './mapCards';
import { cardLink, optionCards } from './optionCards';
import { createStepper } from './pvp';

export type HostedMode = 'coop-ranked' | 'coop-custom' | 'ffa';

export interface HostChoices {
  mode: HostedMode;
  map: string;
  isPublic: boolean;
  maxPlayers: number;
}

/**
 * Host game: pick the mode, map, visibility and size, then create the room. FFA PvP adds its own
 * options (win condition, enemies); custom co-op and FFA use the host's custom settings.
 */
export function createHostSetup(opts: {
  choices: HostChoices;
  onChange(choices: HostChoices): void;
  /** The host's FFA options (part of their custom settings). */
  ffa: FfaConfig;
  onFfaChange(ffa: FfaConfig): void;
  onSettings(): void;
  onCreate(): Promise<void>;
  onBack(): void;
  /** Editing an open room's settings (instead of creating one); max players can't go below `minPlayers`. */
  editing?: { minPlayers: number };
}): HTMLDivElement {
  const choices = { ...opts.choices };
  const ffa = { ...opts.ffa };
  const change = (c: Partial<HostChoices>) => {
    Object.assign(choices, c);
    opts.onChange({ ...choices });
    pvpSection.hidden = choices.mode !== 'ffa';
  };
  const changeFfa = (c: Partial<FfaConfig>) => {
    Object.assign(ffa, c);
    opts.onFfaChange({ ...ffa });
    renderPvpDetails();
  };

  const message = h('p.score-submit-message');
  const create = h('button.primary.big.start-game', { type: 'button' }, opts.editing ? 'Save' : 'Create room');
  create.addEventListener('click', async () => {
    create.disabled = true;
    message.textContent = opts.editing ? 'Saving…' : 'Opening the room…';
    try {
      await opts.onCreate();
    } catch (e) {
      message.textContent = (e as Error).message;
      create.disabled = false;
    }
  });

  // ---- FFA PvP options
  const winDetail = h('div.host-options');
  const enemyDetail = h('div.host-options');
  const renderPvpDetails = () => {
    winDetail.replaceChildren(
      ffa.winCondition === 'kills'
        ? h('label', {}, 'Kills to win', createStepper({ value: ffa.killTarget, min: 1, max: 50, onChange: (n) => changeFfa({ killTarget: n }) }))
        : ffa.winCondition === 'time'
          ? h('label', {}, 'Time limit', createStepper({ value: ffa.timeLimitMinutes, min: 1, max: 30, format: (n) => `${n} min`, onChange: (n) => changeFfa({ timeLimitMinutes: n }) }))
          : h('span.muted', {}, 'No winner: play until the host ends the match (pause menu → End match).'),
    );
    enemyDetail.replaceChildren(
      ffa.enemies
        ? h('label', {}, 'Enemy amount', createStepper({ value: ffa.enemyAmount, min: 0.25, max: 5, step: 0.25, format: (n) => `×${n}`, onChange: (n) => changeFfa({ enemyAmount: n }) }))
        : h('span.muted', {}, 'Only players in the arena.'),
    );
  };
  renderPvpDetails();
  const pvpSection = h(
    'div.pvp-options',
    { hidden: choices.mode !== 'ffa' },
    h('h3', {}, 'Win condition'),
    optionCards<FfaWinCondition>(
      [
        { value: 'kills', title: 'Kills', detail: ['First to the kill target wins.'] },
        { value: 'time', title: 'Time limit', detail: ['Most kills when time runs out.'] },
        { value: 'endless', title: 'Endless', detail: ['No winner.'] },
      ],
      ffa.winCondition,
      (winCondition) => changeFfa({ winCondition }),
    ),
    winDetail,
    h('h3', {}, 'Enemies'),
    optionCards(
      [
        { value: false, title: 'Off', detail: ['Players only.'] },
        { value: true, title: 'On', detail: ['Enemy waves spawn too.'] },
      ],
      ffa.enemies,
      (enemies) => changeFfa({ enemies }),
    ),
    enemyDetail,
  );

  return h(
    'div.screen',
    {},
    h(
      'div.panel.screen-panel.setup',
      {},
      h('div.screen-header', {}, h('h1', {}, opts.editing ? 'Room settings' : 'Host game'), h('button', { onclick: opts.onBack }, opts.editing ? 'Cancel' : 'Back')),
      h('h3', {}, 'Mode'),
      optionCards<HostedMode>(
        [
          { value: 'coop-ranked', title: 'Ranked co-op PvE', detail: ['Default settings. The team score can go on the leaderboard.'] },
          { value: 'coop-custom', title: 'Custom co-op PvE', detail: ['Your own settings. Not ranked. ', cardLink('Settings…', opts.onSettings)] },
          { value: 'ffa', title: 'FFA PvP', detail: ['Free-for-all: everyone for themselves. ', cardLink('Settings…', opts.onSettings)] },
        ],
        choices.mode,
        (mode) => change({ mode }),
      ),
      pvpSection,
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
      h(
        'div.host-options',
        {},
        h(
          'label',
          {},
          'Max players',
          createStepper({
            value: Math.max(choices.maxPlayers, opts.editing?.minPlayers ?? MIN_ROOM_PLAYERS),
            min: Math.max(MIN_ROOM_PLAYERS, opts.editing?.minPlayers ?? MIN_ROOM_PLAYERS),
            max: MAX_ROOM_PLAYERS,
            onChange: (maxPlayers) => change({ maxPlayers }),
          }),
        ),
      ),
      create,
      message,
    ),
  );
}
