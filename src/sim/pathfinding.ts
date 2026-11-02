import { circleRectPush, segmentRectHit, type Rect } from './maps';

const SQRT2 = Math.SQRT2;
/** Neighbour offsets: four straight, then four diagonal. */
const STEPS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

/**
 * A flow field over the arena for enemy pathfinding. The arena is split into square cells; a cell
 * is blocked if an enemy-sized circle at its centre would touch a wall. `update` runs one
 * Dijkstra search outward from the targets (the players), so every cell knows its path distance
 * to the nearest one, and an enemy anywhere just steps to its lowest-distance neighbour.
 * One search serves every enemy, so the cost doesn't grow with the enemy count.
 */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  /** 1 = an enemy can't stand here. */
  readonly blocked: Uint8Array;
  /** Path distance (in cells) to the nearest target; Infinity = blocked or unreachable. */
  readonly dist: Float64Array;
  private readonly walls: Rect[];
  /** The target cells the field was last computed for (recompute only when they change). */
  private targetsKey = '';

  constructor(walls: Rect[], width: number, height: number, cellSize: number, clearance: number) {
    this.walls = walls;
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.dist = new Float64Array(this.cols * this.rows).fill(Infinity);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const probe = { x: (c + 0.5) * cellSize, y: (r + 0.5) * cellSize, radius: clearance };
        if (walls.some((w) => circleRectPush(probe, w))) this.blocked[r * this.cols + c] = 1;
      }
    }
  }

  /** Index of the cell containing (x, y), clamped to the grid. */
  cellAt(x: number, y: number): number {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.cellSize)));
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cellSize)));
    return r * this.cols + c;
  }

  /** Recompute the field if any target moved to a different cell. Returns whether it did. */
  update(targets: { x: number; y: number }[]): boolean {
    const cells = targets.map((t) => this.cellAt(t.x, t.y));
    const key = cells.join(',');
    if (key === this.targetsKey) return false;
    this.targetsKey = key;
    this.search(cells);
    return true;
  }

  /**
   * Unit vector an enemy at (x, y) should move along to follow the field, or undefined when
   * there's nothing better to do (it's already in a target's cell, or there's no path).
   */
  directionFrom(x: number, y: number): [number, number] | undefined {
    const here = this.cellAt(x, y);
    let best = -1;
    let bestDist = this.dist[here];
    this.forEachNeighbour(here, (n) => {
      if (this.dist[n] < bestDist) {
        bestDist = this.dist[n];
        best = n;
      }
    });
    if (best < 0) return undefined;
    const tx = ((best % this.cols) + 0.5) * this.cellSize;
    const ty = (Math.floor(best / this.cols) + 0.5) * this.cellSize;
    const len = Math.hypot(tx - x, ty - y);
    return len < 1e-6 ? undefined : [(tx - x) / len, (ty - y) / len];
  }

  /** Whether a circle of `radius` could travel in a straight line from (x1, y1) to (x2, y2) without touching a wall. */
  clearPath(x1: number, y1: number, x2: number, y2: number, radius: number): boolean {
    return !this.walls.some(
      (w) => segmentRectHit(x1, y1, x2, y2, { x: w.x - radius, y: w.y - radius, w: w.w + 2 * radius, h: w.h + 2 * radius }) !== undefined,
    );
  }

  /** Open neighbours of `cell`; diagonals only when both straight cells beside them are open (no corner cutting). */
  private forEachNeighbour(cell: number, visit: (n: number, cost: number) => void): void {
    const c = cell % this.cols;
    const r = Math.floor(cell / this.cols);
    for (const [dc, dr, cost] of STEPS) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
      const n = nr * this.cols + nc;
      if (this.blocked[n]) continue;
      if (dc !== 0 && dr !== 0 && (this.blocked[r * this.cols + nc] || this.blocked[nr * this.cols + c])) continue;
      visit(n, cost);
    }
  }

  /** Multi-source Dijkstra from the target cells. */
  private search(targetCells: number[]): void {
    this.dist.fill(Infinity);
    const heap = new MinHeap();
    for (const cell of targetCells) {
      // A player hugging a wall can stand in a blocked cell: start from the nearest open cells instead.
      for (const [start, d] of this.openCellsNear(cell)) {
        if (d < this.dist[start]) {
          this.dist[start] = d;
          heap.push(start, d);
        }
      }
    }
    while (heap.size) {
      const [cell, d] = heap.pop();
      if (d > this.dist[cell]) continue; // stale entry
      this.forEachNeighbour(cell, (n, cost) => {
        const nd = d + cost;
        if (nd < this.dist[n]) {
          this.dist[n] = nd;
          heap.push(n, nd);
        }
      });
    }
  }

  /** `cell` itself if open, else the open cells in the nearest ring around it (with their distance). */
  private openCellsNear(cell: number): [number, number][] {
    if (!this.blocked[cell]) return [[cell, 0]];
    const c = cell % this.cols;
    const r = Math.floor(cell / this.cols);
    for (let ring = 1; ring <= 4; ring++) {
      const found: [number, number][] = [];
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
          const n = nr * this.cols + nc;
          if (!this.blocked[n]) found.push([n, Math.hypot(dc, dr)]);
        }
      }
      if (found.length) return found;
    }
    return [];
  }
}

/** Binary min-heap of (cell, priority) pairs. */
class MinHeap {
  private cells: number[] = [];
  private keys: number[] = [];

  get size(): number {
    return this.cells.length;
  }

  push(cell: number, key: number): void {
    const { cells, keys } = this;
    let i = cells.length;
    cells.push(cell);
    keys.push(key);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      cells[i] = cells[parent];
      keys[i] = keys[parent];
      i = parent;
    }
    cells[i] = cell;
    keys[i] = key;
  }

  pop(): [number, number] {
    const { cells, keys } = this;
    const top: [number, number] = [cells[0], keys[0]];
    const lastCell = cells.pop()!;
    const lastKey = keys.pop()!;
    if (cells.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        let mKey = lastKey;
        if (l < cells.length && keys[l] < mKey) {
          m = l;
          mKey = keys[l];
        }
        if (r < cells.length && keys[r] < mKey) m = r;
        if (m === i) break;
        cells[i] = cells[m];
        keys[i] = keys[m];
        i = m;
      }
      cells[i] = lastCell;
      keys[i] = lastKey;
    }
    return top;
  }
}
