import type { World } from '../sim/world';
import { h, keyLabel } from './dom';

export function createGameOverScreen(world: World, actions: { playAgain(): void; menu(): void }): HTMLDivElement {
  const s = world.stats;
  const minutes = Math.floor(s.timeSurvived / 60);
  const seconds = Math.floor(s.timeSurvived % 60).toString().padStart(2, '0');
  const rows = world.cfg.questionSlots.map((slot, i) => {
    const st = s.slots[i];
    const pct = st.attempts ? Math.round((100 * st.correct) / st.attempts) : 0;
    return h(
      'tr',
      {},
      h('td', {}, `${keyLabel(slot.key)} · ${slot.label}`),
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
      h(
        'div.stat-grid',
        {},
        stat('Round reached', String(world.wave.round)),
        stat('Enemies defeated', String(s.kills)),
        stat('Time survived', `${minutes}:${seconds}`),
        stat('Mana spent', String(Math.round(s.manaSpent))),
      ),
      h('h3', {}, 'Questions'),
      h(
        'table.stats-table',
        {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Slot'), h('th', {}, 'Correct'), h('th', {}, 'Accuracy'), h('th', {}, 'Mana'))),
        h('tbody', {}, ...rows),
      ),
      h(
        'div.button-row',
        {},
        h('button.primary', { onclick: actions.playAgain }, 'Play again'),
        h('button', { onclick: actions.menu }, 'Main menu'),
      ),
    ),
  );
}

function stat(label: string, value: string) {
  return h('div.stat', {}, h('div.stat-value', {}, value), h('div.stat-label', {}, label));
}
