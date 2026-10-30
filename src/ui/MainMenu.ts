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

/** One card per map; clicking a card selects it. */
function mapPicker(selected: string, onSelect: (id: string) => void): HTMLDivElement {
  const current = MAPS.some((m) => m.id === selected) ? selected : MAPS[0].id;
  const cards = MAPS.map((map) => {
    const card = h('button.map-card', { type: 'button', title: map.name }, mapPreview(map), h('span', {}, map.name));
    card.classList.toggle('selected', map.id === current);
    card.addEventListener('click', () => {
      for (const c of cards) c.classList.toggle('selected', c === card);
      onSelect(map.id);
    });
    return card;
  });
  return h('div.map-picker', {}, ...cards);
}

export function createMainMenu(actions: {
  play(): void;
  configure(): void;
  decks(): void;
  /** Currently selected map id. */
  map: string;
  selectMap(id: string): void;
}): HTMLDivElement {
  return h(
    'div.screen',
    {},
    h(
      'div.panel.screen-panel.menu',
      {},
      h('h1.title', {}, 'Math Mage'),
      h('p.tagline', {}, 'Solve problems to regenerate mana. Survive as long as you can.'),
      mapPicker(actions.map, actions.selectMap),
      h(
        'div.menu-buttons',
        {},
        h('button.primary.big', { onclick: actions.play }, 'Play survival'),
        h('button.big', { onclick: actions.configure }, 'Configure match'),
        h('button.big', { onclick: actions.decks }, 'Question decks'),
      ),
      h(
        'div.controls-help',
        {},
        h('div', {}, h('span.key', {}, 'WASD'), ' or ', h('span.key', {}, 'Arrow keys'), ' move'),
        h('div', {}, h('span.key', {}, 'Mouse'), ' aim · hold left click to cast'),
        h('div', {}, h('span.key', {}, '1'), h('span.key', {}, '2'), ' select spell'),
        h('div', {}, h('span.key', {}, 'Space'), ' open / close a question (mostly easy, sometimes hard)'),
        h('div', {}, 'Click the answer field to type · ', h('span.key', {}, 'Enter'), ' submit'),
        h('div', {}, h('span.key', {}, 'P'), ' or ', h('span.key', {}, 'Esc'), ' pause'),
      ),
    ),
  );
}
