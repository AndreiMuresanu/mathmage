import { ARENA_HEIGHT, ARENA_WIDTH } from '../config/gameConfig';
import { MAPS, type MapDef } from '../sim/maps';
import { h } from './dom';

const SVG = 'http://www.w3.org/2000/svg';

/** Small picture of a map's walls (and where the player starts). */
function mapPreview(map: MapDef): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${ARENA_WIDTH} ${ARENA_HEIGHT}`);
  svg.classList.add('map-preview');
  const shape = (tag: string, attrs: Record<string, number | string>) => {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    svg.append(el);
  };
  shape('rect', { x: 0, y: 0, width: ARENA_WIDTH, height: ARENA_HEIGHT, class: 'map-floor' });
  for (const w of map.walls) shape('rect', { x: w.x, y: w.y, width: w.w, height: w.h, class: 'map-wall' });
  shape('circle', { cx: map.playerSpawn.x, cy: map.playerSpawn.y, r: 22, class: 'map-player' });
  return svg;
}

/**
 * Map choice, shown after picking a game mode. Clicking a card selects it (double-click starts
 * right away); the last choice is remembered via `onSelect`.
 */
export function createMapSelect(opts: {
  /** Currently selected map id. */
  map: string;
  onSelect(id: string): void;
  onStart(): void;
  onBack(): void;
}): HTMLDivElement {
  let current = MAPS.some((m) => m.id === opts.map) ? opts.map : MAPS[0].id;
  const cards = MAPS.map((map) => {
    const card = h('button.map-card', { type: 'button', title: map.name }, mapPreview(map), h('span', {}, map.name));
    card.classList.toggle('selected', map.id === current);
    card.addEventListener('click', () => {
      current = map.id;
      for (const c of cards) c.classList.toggle('selected', c === card);
      opts.onSelect(map.id);
    });
    card.addEventListener('dblclick', () => opts.onStart());
    return card;
  });
  return h(
    'div.screen',
    {},
    h(
      'div.panel.screen-panel.map-select',
      {},
      h('div.screen-header', {}, h('h1', {}, 'Choose a map'), h('button', { onclick: opts.onBack }, 'Back')),
      h('div.map-picker', {}, ...cards),
      h('div.button-row', {}, h('button.primary.big', { onclick: opts.onStart }, 'Start')),
    ),
  );
}
