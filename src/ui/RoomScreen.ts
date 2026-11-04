import { setupLabel } from '../game/matchSetup';
import type { RoomSession } from '../net/room';
import { getMap } from '../sim/maps';
import { h } from './dom';

const PING_EVERY_MS = 2000;

/**
 * The game room before (and between) matches: Room ID to share, who's here with their pings,
 * and Start for the host. Call refresh() when the roster changes.
 */
export function createRoomScreen(room: RoomSession, opts: { onStart(): void; onLeave(): void }): { el: HTMLDivElement; refresh(): void } {
  const pings = new Map<string, number>();
  const list = h('ul.room-players');
  const info = h('p.muted');
  const footer = h('div.room-footer');
  const start = h('button.primary.big', { type: 'button', onclick: () => opts.onStart() }, 'Start game');
  const copy = h('button.small', { type: 'button' }, 'Copy');
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(room.code).then(
      () => (copy.textContent = 'Copied!'),
      () => (copy.textContent = 'Copy failed'),
    );
    setTimeout(() => (copy.textContent = 'Copy'), 1500);
  });

  const refresh = () => {
    info.textContent = `${setupLabel(room.setup)} · ${getMap(room.setup.map).name} · ${room.isPublic || !room.isHost ? '' : 'private · '}up to ${room.maxPlayers} players`;
    list.replaceChildren(
      ...room.players.map((p) => {
        const ping = pings.get(p.id);
        return h(
          'li',
          {},
          h('strong', {}, p.name),
          p.id === room.hostId ? h('span.badge', {}, 'host') : null,
          p.id === room.selfId ? h('span.muted', {}, ' (you)') : null,
          h('span.spacer'),
          p.id === room.selfId ? null : h('span.muted', {}, ping === undefined ? '…' : `${Math.round(ping)} ms`),
        );
      }),
    );
    if (room.isHost) {
      const enough = room.players.length >= 2;
      start.disabled = !enough;
      footer.replaceChildren(
        start,
        h('p.muted', {}, enough ? '' : 'Waiting for at least one more player…'),
        h('p.muted.host-note', {}, "You're the host: the match runs in your browser, so keep the game open while you play."),
      );
    } else {
      footer.replaceChildren(h('p.muted', {}, 'Waiting for the host to start…'));
    }
  };

  const pingAll = () => {
    if (!document.body.contains(el)) return clearInterval(timer);
    for (const p of room.players) {
      if (p.id === room.selfId) continue;
      room.transport
        .ping(p.id)
        .then((ms) => {
          pings.set(p.id, ms);
          refresh();
        })
        .catch(() => {});
    }
  };
  const timer = setInterval(pingAll, PING_EVERY_MS);
  setTimeout(pingAll, 300);

  const el = h(
    'div.screen',
    {},
    h(
      'div.panel.screen-panel.narrow',
      {},
      h('div.screen-header', {}, h('h1', {}, 'Game room'), h('button', { onclick: () => { clearInterval(timer); opts.onLeave(); } }, 'Leave')),
      h('div.room-code', {}, h('span.muted', {}, 'Room ID'), h('strong', {}, room.code), copy),
      info,
      h('h3', {}, 'Players'),
      list,
      footer,
    ),
  );
  refresh();
  return { el, refresh };
}
