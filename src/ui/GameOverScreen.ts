import type { QuestionTypeStats } from '../sim/types';
import type { World } from '../sim/world';
import { h } from './dom';

export interface RatingSummary {
  name: string;
  start: number;
  rating: number;
  peak: number;
  answers: number;
}

export function createGameOverScreen(
  world: World,
  actions: { playAgain(): void; menu(): void; playAgainLabel?: string; menuLabel?: string },
  ratings: RatingSummary[] = [],
  /** e.g. "Ranked solo · Mazy". */
  subtitle = '',
  /** Leaderboard submit box (ranked) or a "not ranked" note. */
  leaderboard: HTMLElement | null = null,
  /** The local player's own answers (multiplayer); defaults to the match totals. */
  questionStats: QuestionTypeStats[] = world.stats.questionTypes,
): HTMLDivElement {
  const s = world.stats;
  const minutes = Math.floor(s.timeSurvived / 60);
  const seconds = Math.floor(s.timeSurvived % 60).toString().padStart(2, '0');
  const rows = world.cfg.questionTypes.map((type, i) => {
    const st = questionStats[i] ?? { attempts: 0, correct: 0, manaEarned: 0 };
    const pct = st.attempts ? Math.round((100 * st.correct) / st.attempts) : 0;
    return h(
      'tr',
      {},
      h('td', {}, type.label),
      h('td', {}, `${st.correct} / ${st.attempts}`),
      h('td', {}, st.attempts ? `${pct}%` : '—'),
      h('td', {}, String(Math.round(st.manaEarned))),
    );
  });
  return h(
    'div.screen',
    {},
    h(
      'div.panel.screen-panel.narrow',
      {},
      h('h1', {}, 'The mage has fallen'),
      subtitle ? h('p.muted.game-over-subtitle', {}, subtitle) : null,
      h(
        'div.stat-grid',
        {},
        stat('Round reached', String(world.wave.round)),
        stat('Enemies defeated', String(s.kills)),
        stat('Time survived', `${minutes}:${seconds}`),
        stat('Mana spent', String(Math.round(s.manaSpent))),
      ),
      leaderboard,
      ratings.length ? h('h3', {}, 'Skill rating') : null,
      ...ratings.map((r) =>
        h(
          'div.rating-summary',
          {},
          h('strong', {}, r.name),
          ` ${Math.round(r.start)} → ${Math.round(r.rating)}`,
          h('span.muted', {}, ` (peak ${Math.round(r.peak)}, ${r.answers} answers)`),
        ),
      ),
      h('h3', {}, 'Questions'),
      h(
        'table.stats-table',
        {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Type'), h('th', {}, 'Correct'), h('th', {}, 'Accuracy'), h('th', {}, 'Mana'))),
        h('tbody', {}, ...rows),
      ),
      h(
        'div.button-row',
        {},
        h('button.primary', { onclick: actions.playAgain }, actions.playAgainLabel ?? 'Play again'),
        h('button', { onclick: actions.menu }, actions.menuLabel ?? 'Main menu'),
      ),
    ),
  );
}

function stat(label: string, value: string) {
  return h('div.stat', {}, h('div.stat-value', {}, value), h('div.stat-label', {}, label));
}
