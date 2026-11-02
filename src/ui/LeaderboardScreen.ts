import { fetchScores, leaderboardEnabled } from '../online/leaderboard';
import { ALL_MAPS, LEADERBOARD_MODE_NAMES, RANKED_MODES, type RankedMode, type ScoreEntry, type ScoreSort } from '../online/leaderboardTypes';
import { getMap, MAPS } from '../sim/maps';
import { h } from './dom';

const PAGE_SIZE = 50;

/** Which board was last viewed, so coming back shows the same one. */
export interface LeaderboardView {
  /** A map id, or ALL_MAPS. */
  map: string;
  mode: RankedMode;
  sort: ScoreSort;
}

/** Online high scores: pick a map and mode, sort by wave or ELO, 50 rows per page. */
export function createLeaderboardScreen(opts: { view: LeaderboardView; onViewChange(view: LeaderboardView): void; onBack(): void }): HTMLDivElement {
  const view = { ...opts.view };
  let offset = 0;
  let requestId = 0;

  const select = <T extends string>(options: [T, string][], value: T, onChange: (v: T) => void) => {
    const el = h('select', {}, ...options.map(([v, label]) => h('option', { value: v, textContent: label, selected: v === value })));
    el.addEventListener('change', () => onChange(el.value as T));
    return el;
  };
  const mapOptions: [string, string][] = [[ALL_MAPS, 'All maps'], ...MAPS.map((m): [string, string] => [m.id, m.name])];
  const mapSelect = select(mapOptions, view.map, (v) => update({ map: v }));
  const mapHeader = h('th', {}, 'Map');
  const modeSelect = select(RANKED_MODES.map((m): [RankedMode, string] => [m, LEADERBOARD_MODE_NAMES[m]]), view.mode, (v) => update({ mode: v }));
  const sortButtons = (['wave', 'elo'] as ScoreSort[]).map((sort) => {
    const b = h('button.small.toggle', { type: 'button' }, sort === 'wave' ? 'Highest wave' : 'Highest ELO');
    b.addEventListener('click', () => update({ sort }));
    return b;
  });
  const status = h('p.muted.leaderboard-status');
  const tbody = h('tbody');
  const prev = h('button.small', { type: 'button', onclick: () => go(offset - PAGE_SIZE) }, '← Previous');
  const next = h('button.small', { type: 'button', onclick: () => go(offset + PAGE_SIZE) }, 'Next →');
  const pageInfo = h('span.muted');

  function update(change: Partial<LeaderboardView>): void {
    Object.assign(view, change);
    opts.onViewChange({ ...view });
    go(0);
  }

  async function go(newOffset: number): Promise<void> {
    offset = Math.max(0, newOffset);
    sortButtons.forEach((b, i) => b.classList.toggle('selected', (i === 0 ? 'wave' : 'elo') === view.sort));
    // The Map column only appears when viewing all maps at once.
    const showMap = view.map === ALL_MAPS;
    mapHeader.style.display = showMap ? '' : 'none';
    if (!leaderboardEnabled) {
      status.textContent = 'The leaderboard is offline.';
      return;
    }
    const id = ++requestId;
    status.textContent = 'Loading…';
    prev.disabled = next.disabled = true;
    try {
      const page = await fetchScores(view.map, view.mode, view.sort, offset, PAGE_SIZE);
      if (id !== requestId) return; // a newer request has started
      tbody.replaceChildren(...page.entries.map((e, i) => row(e, offset + i + 1, view.mode, showMap)));
      status.textContent = page.total ? '' : 'No scores yet. Be the first!';
      pageInfo.textContent = page.total ? `${offset + 1}–${offset + page.entries.length} of ${page.total}` : '';
      prev.disabled = offset === 0;
      next.disabled = offset + PAGE_SIZE >= page.total;
    } catch (e) {
      if (id !== requestId) return;
      tbody.replaceChildren();
      status.textContent = (e as Error).message;
    }
  }

  void go(0);

  return h(
    'div.screen',
    {},
    h(
      'div.panel.screen-panel.leaderboard',
      {},
      h('div.screen-header', {}, h('h1', {}, 'Leaderboard'), h('button', { onclick: opts.onBack }, 'Back')),
      h(
        'div.leaderboard-filters',
        {},
        h('label', {}, 'Map ', mapSelect),
        h('label', {}, 'Mode ', modeSelect),
        h('span.spacer'),
        h('div.button-row', {}, ...sortButtons),
      ),
      h(
        'table.stats-table.leaderboard-table',
        {},
        h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Name'), mapHeader, h('th', {}, 'Wave'), h('th', {}, 'Peak ELO'), h('th', {}, 'Date'))),
        tbody,
      ),
      status,
      h('div.button-row.leaderboard-pages', {}, prev, pageInfo, next),
    ),
  );
}

function row(entry: ScoreEntry, rank: number, mode: RankedMode, showMap: boolean): HTMLTableRowElement {
  const names = entry.players.map((p) => p.name).join(', ');
  // Co-op: the ELO column is the team average; each player's own ELO shows on hover and beside their name.
  const nameCell = mode === 'coop' ? entry.players.map((p) => `${p.name} (${p.elo})`).join(', ') : names;
  const eloTitle = mode === 'coop' ? `Team average of ${entry.players.map((p) => `${p.name} ${p.elo}`).join(', ')}` : '';
  return h(
    'tr',
    {},
    h('td', {}, String(rank)),
    h('td.leaderboard-name', { title: names }, nameCell),
    showMap ? h('td', {}, getMap(entry.map).name) : null,
    h('td', {}, String(entry.wave)),
    h('td', { title: eloTitle }, String(entry.elo)),
    h('td', {}, new Date(entry.createdAt).toLocaleDateString()),
  );
}
