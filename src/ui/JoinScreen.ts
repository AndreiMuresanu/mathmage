import { cleanRoomCode } from '../net/connect';
import { fetchOpenGames, gamesListEnabled } from '../online/games';
import type { GameListing } from '../online/gamesTypes';
import { getMap } from '../sim/maps';
import { h } from './dom';

const REFRESH_MS = 5000;

/** Join game: a live list of open public rooms, plus a Room ID field for private ones. */
export function createJoinScreen(opts: { onJoin(code: string): Promise<void>; onBack(): void }): HTMLDivElement {
  const tbody = h('tbody');
  const listStatus = h('p.muted.leaderboard-status');
  const codeInput = h('input.room-code-input', { type: 'text', maxLength: 8, placeholder: 'e.g. K7Q2XM', autocomplete: 'off' });
  const joinButton = h('button.primary', { type: 'button' }, 'Join');
  const message = h('p.score-submit-message');
  let busy = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const join = async (code: string) => {
    if (busy) return;
    const clean = cleanRoomCode(code);
    if (!clean) {
      message.textContent = 'Enter a Room ID.';
      codeInput.focus();
      return;
    }
    busy = true;
    joinButton.disabled = true;
    message.textContent = `Joining ${clean}…`;
    try {
      await opts.onJoin(clean);
      if (timer) clearInterval(timer);
    } catch (e) {
      message.textContent = (e as Error).message;
    } finally {
      busy = false;
      joinButton.disabled = false;
    }
  };

  const row = (g: GameListing) => {
    const full = g.players >= g.maxPlayers;
    const tr = h(
      'tr.game-row',
      { title: full ? 'This room is full' : `Join ${g.hostName}'s room` },
      h('td', {}, g.hostName),
      h('td', {}, g.mode === 'ffa' ? 'FFA PvP' : `${g.ranked ? 'Ranked' : 'Custom'} co-op`),
      h('td', {}, getMap(g.map).name),
      h('td', {}, `${g.players} / ${g.maxPlayers}`),
      h('td.muted', {}, g.region || '—'),
    );
    tr.classList.toggle('full', full);
    if (!full) tr.addEventListener('click', () => void join(g.code));
    return tr;
  };

  const refresh = async () => {
    if (!document.body.contains(screen)) {
      if (timer) clearInterval(timer);
      return;
    }
    try {
      const games = await fetchOpenGames();
      tbody.replaceChildren(...games.map(row));
      listStatus.textContent = games.length ? '' : 'No open games right now. Host one, or join with a Room ID.';
    } catch (e) {
      listStatus.textContent = (e as Error).message;
    }
  };

  joinButton.addEventListener('click', () => void join(codeInput.value));
  codeInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') void join(codeInput.value);
  });

  const screen = h(
    'div.screen',
    {},
    h(
      'div.panel.screen-panel.leaderboard',
      {},
      h('div.screen-header', {}, h('h1', {}, 'Join game'), h('button', { onclick: () => { if (timer) clearInterval(timer); opts.onBack(); } }, 'Back')),
      h('h3', {}, 'Open games'),
      gamesListEnabled
        ? h(
            'table.stats-table.leaderboard-table.games-table',
            {},
            h('thead', {}, h('tr', {}, h('th', {}, 'Host'), h('th', {}, 'Mode'), h('th', {}, 'Map'), h('th', {}, 'Players'), h('th', {}, 'Region'))),
            tbody,
          )
        : null,
      listStatus,
      h('h3', {}, 'Join with a Room ID'),
      h('div.button-row', {}, codeInput, joinButton),
      message,
    ),
  );

  if (gamesListEnabled) {
    listStatus.textContent = 'Loading…';
    // Start after the screen is on the page (refresh checks that it still is).
    setTimeout(() => void refresh(), 0);
    timer = setInterval(() => void refresh(), REFRESH_MS);
  } else {
    listStatus.textContent = 'The open-games list is offline. You can still join with a Room ID.';
  }
  return screen;
}
