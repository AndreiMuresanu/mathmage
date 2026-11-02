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
 * One clickable card per map, with the selected one highlighted. Used by every match setup
 * screen (solo now; hosting a multiplayer game later).
 */
export function mapCards(selected: string, onSelect: (id: string) => void): HTMLDivElement {
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
