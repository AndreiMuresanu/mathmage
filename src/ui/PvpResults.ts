import type { World } from '../sim/world';
import { h } from './dom';
import { goalText, killRows, standings } from './pvp';

/** Who won an FFA match: the host's verdict if known, else everyone tied for the most kills. */
export function pvpWinners(world: World): string[] {
  if (world.winnerIds.length) return world.winnerIds;
  const best = Math.max(0, ...world.players.map((p) => p.kills));
  return world.players.filter((p) => p.kills === best).map((p) => p.id);
}

/** End of an FFA PvP match: who won, and everyone's kills and deaths. */
export function createPvpResults(
  world: World,
  nameOf: (id: string) => string,
  localId: string,
  actions: { back(): void; leave(): void },
): HTMLDivElement {
  const winners = pvpWinners(world);
  const title =
    winners.length === 1
      ? winners[0] === localId
        ? 'You win! 🏆'
        : `${nameOf(winners[0])} wins!`
      : winners.includes(localId)
        ? "It's a tie!"
        : `Tie: ${winners.map(nameOf).join(', ')}`;
  const t = world.stats.timeSurvived;
  const time = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const me = standings(world.players, nameOf).findIndex((p) => p.id === localId);
  const goal = world.cfg.ffa.winCondition === 'time' ? `${world.cfg.ffa.timeLimitMinutes}-minute match` : goalText(world);
  return h(
    'div.screen',
    {},
    h(
      'div.panel.screen-panel.narrow',
      {},
      h('h1.pvp-results-title', {}, title),
      h('p.muted.game-over-subtitle', {}, `FFA PvP · ${world.map.name} · ${goal} · ${time}`),
      me >= 0 ? h('p', {}, `You placed #${me + 1} of ${world.players.length}.`) : null,
      h('h3', {}, 'Standings'),
      h('div.kill-rows.results-rows', {}, ...killRows(world.players, nameOf, localId, true)),
      h('p.muted', {}, 'FFA games aren’t ranked.'),
      h(
        'div.button-row',
        {},
        h('button.primary', { onclick: actions.back }, 'Back to room'),
        h('button', { onclick: actions.leave }, 'Leave'),
      ),
    ),
  );
}
