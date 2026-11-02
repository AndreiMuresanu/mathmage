import { ARENA_HEIGHT, ARENA_WIDTH } from '../config/gameConfig';

/** Axis-aligned wall rectangle (top-left corner + size), in arena pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A line segment, used for the stretches of screen edge that enemies spawn along. */
export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MapDef {
  id: string;
  name: string;
  /** Solid walls: block movement, projectiles (fireballs explode on them) and lasers. */
  walls: Rect[];
  playerSpawn: { x: number; y: number };
  /** Where enemies enter, just inside the gaps in the edge walls. Undefined = anywhere on any edge. */
  spawnGaps?: Segment[];
}

/** Thickness of the walls along the screen edges. */
const EDGE_WALL = 20;
/** Width of each gap in the edge walls. */
const GAP = 160;
/** How far inside the screen edge enemies appear. */
const SPAWN_DEPTH = 30;
/** Keep spawn points this far from a gap's sides so enemies don't clip the wall ends. */
const SPAWN_INSET = 24;

type Edge = 'top' | 'bottom' | 'left' | 'right';
/** A gap in an edge wall: just the edge (centred, GAP wide), or an explicit span along it in px. */
type Gap = Edge | { edge: Edge; from: number; to: number };

/** Walls along all four screen edges, with a gap wherever `gaps` lists one. */
function edgeWalls(gaps: Gap[]): { walls: Rect[]; spawnGaps: Segment[] } {
  const W = ARENA_WIDTH;
  const H = ARENA_HEIGHT;
  const walls: Rect[] = [];
  const spawnGaps: Segment[] = [];
  /** The gap span on `edge` (whose length is `length`), if it has one. */
  const span = (edge: Edge, length: number): [number, number] | undefined => {
    const gap = gaps.find((g) => (typeof g === 'string' ? g : g.edge) === edge);
    if (gap === undefined) return undefined;
    return typeof gap === 'string' ? [(length - GAP) / 2, (length + GAP) / 2] : [gap.from, gap.to];
  };
  const horizontal = (edge: Edge, y: number, spawnY: number) => {
    const g = span(edge, W);
    if (!g) return void walls.push({ x: 0, y, w: W, h: EDGE_WALL });
    walls.push({ x: 0, y, w: g[0], h: EDGE_WALL }, { x: g[1], y, w: W - g[1], h: EDGE_WALL });
    spawnGaps.push({ x1: g[0] + SPAWN_INSET, y1: spawnY, x2: g[1] - SPAWN_INSET, y2: spawnY });
  };
  const vertical = (edge: Edge, x: number, spawnX: number) => {
    // Side walls run between the top and bottom walls.
    const top = EDGE_WALL;
    const bottom = H - EDGE_WALL;
    const g = span(edge, H);
    if (!g) return void walls.push({ x, y: top, w: EDGE_WALL, h: bottom - top });
    if (g[0] > top) walls.push({ x, y: top, w: EDGE_WALL, h: g[0] - top });
    if (g[1] < bottom) walls.push({ x, y: g[1], w: EDGE_WALL, h: bottom - g[1] });
    spawnGaps.push({ x1: spawnX, y1: g[0] + SPAWN_INSET, x2: spawnX, y2: g[1] - SPAWN_INSET });
  };
  horizontal('top', 0, SPAWN_DEPTH);
  horizontal('bottom', H - EDGE_WALL, H - SPAWN_DEPTH);
  vertical('left', 0, SPAWN_DEPTH);
  vertical('right', W - EDGE_WALL, W - SPAWN_DEPTH);
  return { walls, spawnGaps };
}

/** A square pillar centred on (cx, cy). */
function pillar(cx: number, cy: number, size = 72): Rect {
  return { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
}

const boxy = edgeWalls(['top', 'bottom']);
const buttons = edgeWalls(['top', 'bottom', 'left', 'right']);
// Mazy: enemies enter at the top-left, bottom and bottom-right; everything sits on a 20px grid
// so walls meet cleanly (T-junctions and corners line up exactly).
const mazy = edgeWalls([
  { edge: 'left', from: 20, to: 160 },
  { edge: 'bottom', from: 940, to: 1060 },
  { edge: 'right', from: 600, to: 700 },
]);
/** Straight 20px-thick wall pieces for Mazy, as [x1, y1, x2, y2] outer corners. */
const MAZY_WALLS: [number, number, number, number][] = [
  [20, 160, 720, 180], //    shelf under the top-left entrance
  [520, 180, 540, 340], //   hangs down from that shelf
  [740, 260, 1260, 280], //  shelf out from the right wall
  [260, 260, 280, 620], //   long post on the left
  [280, 440, 840, 460], //   arm off that post
  [1060, 380, 1080, 700], // post up from the bottom wall, beside the bottom entrance
  [580, 600, 1060, 620], //  arm off that post
];

export const MAPS: MapDef[] = [
  { id: 'empty', name: 'Empty', walls: [], playerSpawn: { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 } },
  { id: 'boxy', name: 'Boxy', ...boxy, playerSpawn: { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 } },
  {
    id: 'buttons',
    name: 'Buttons',
    walls: [...buttons.walls, ...[380, 640, 900].flatMap((x) => [200, 360, 520].map((y) => pillar(x, y)))],
    spawnGaps: buttons.spawnGaps,
    // The centre pillar is where the player would normally start; start just below it.
    playerSpawn: { x: ARENA_WIDTH / 2, y: 440 },
  },
  {
    id: 'mazy',
    name: 'Mazy',
    walls: [...mazy.walls, ...MAZY_WALLS.map(([x1, y1, x2, y2]) => ({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }))],
    spawnGaps: mazy.spawnGaps,
    playerSpawn: { x: ARENA_WIDTH / 2, y: 360 },
  },
];

/** The map with this id, or the empty map if there is none. */
export function getMap(id: string): MapDef {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}

/**
 * How far to move a circle so it no longer overlaps `rect` (away from the rectangle's closest
 * point), or undefined if they don't overlap.
 */
export function circleRectPush(c: { x: number; y: number; radius: number }, rect: Rect): { x: number; y: number } | undefined {
  const nx = Math.max(rect.x, Math.min(c.x, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(c.y, rect.y + rect.h));
  const dx = c.x - nx;
  const dy = c.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= c.radius * c.radius) return undefined;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return { x: (dx / d) * (c.radius - d), y: (dy / d) * (c.radius - d) };
  }
  // Centre is inside the rectangle: leave through the nearest side.
  const exits = [
    { x: rect.x - c.radius - c.x, y: 0 },
    { x: rect.x + rect.w + c.radius - c.x, y: 0 },
    { x: 0, y: rect.y - c.radius - c.y },
    { x: 0, y: rect.y + rect.h + c.radius - c.y },
  ];
  return exits.reduce((best, e) => (Math.abs(e.x + e.y) < Math.abs(best.x + best.y) ? e : best));
}

/**
 * Whether the segment (x1, y1)-(x2, y2), widened to `radius` on each side, touches none of
 * `walls` (radius 0 = a thin ray).
 */
export function lineOfSight(walls: Rect[], x1: number, y1: number, x2: number, y2: number, radius = 0): boolean {
  return !walls.some(
    (w) => segmentRectHit(x1, y1, x2, y2, { x: w.x - radius, y: w.y - radius, w: w.w + 2 * radius, h: w.h + 2 * radius }) !== undefined,
  );
}

/**
 * Where the segment (x1, y1)-(x2, y2) first enters `rect`, as a fraction 0..1 along it, or
 * undefined if it misses (slab method).
 */
export function segmentRectHit(x1: number, y1: number, x2: number, y2: number, rect: Rect): number | undefined {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  for (const [d, start, lo, hi] of [
    [dx, x1, rect.x, rect.x + rect.w],
    [dy, y1, rect.y, rect.y + rect.h],
  ]) {
    if (Math.abs(d) < 1e-12) {
      if (start < lo || start > hi) return undefined;
      continue;
    }
    let a = (lo - start) / d;
    let b = (hi - start) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return undefined;
  }
  return t0;
}
