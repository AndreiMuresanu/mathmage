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

/** Walls along all four screen edges, each with a centred gap where listed in `gaps`. */
function edgeWalls(gaps: Edge[]): { walls: Rect[]; spawnGaps: Segment[] } {
  const W = ARENA_WIDTH;
  const H = ARENA_HEIGHT;
  const walls: Rect[] = [];
  const spawnGaps: Segment[] = [];
  const horizontal = (edge: Edge, y: number, spawnY: number) => {
    if (!gaps.includes(edge)) return void walls.push({ x: 0, y, w: W, h: EDGE_WALL });
    const g0 = (W - GAP) / 2;
    walls.push({ x: 0, y, w: g0, h: EDGE_WALL }, { x: g0 + GAP, y, w: W - g0 - GAP, h: EDGE_WALL });
    spawnGaps.push({ x1: g0 + SPAWN_INSET, y1: spawnY, x2: g0 + GAP - SPAWN_INSET, y2: spawnY });
  };
  const vertical = (edge: Edge, x: number, spawnX: number) => {
    // Side walls run between the top and bottom walls.
    const top = EDGE_WALL;
    const len = H - 2 * EDGE_WALL;
    if (!gaps.includes(edge)) return void walls.push({ x, y: top, w: EDGE_WALL, h: len });
    const g0 = (H - GAP) / 2;
    walls.push({ x, y: top, w: EDGE_WALL, h: g0 - top }, { x, y: g0 + GAP, w: EDGE_WALL, h: H - EDGE_WALL - g0 - GAP });
    spawnGaps.push({ x1: spawnX, y1: g0 + SPAWN_INSET, x2: spawnX, y2: g0 + GAP - SPAWN_INSET });
  };
  horizontal('top', 0, SPAWN_DEPTH);
  horizontal('bottom', H - EDGE_WALL, H - SPAWN_DEPTH);
  vertical('left', 0, SPAWN_DEPTH);
  vertical('right', W - EDGE_WALL, W - SPAWN_DEPTH);
  return { walls, spawnGaps };
}

/** A square pillar centred on (cx, cy). */
function pillar(cx: number, cy: number, size = 56): Rect {
  return { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
}

const boxy = edgeWalls(['top', 'bottom']);
const buttons = edgeWalls(['top', 'bottom', 'left', 'right']);

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
