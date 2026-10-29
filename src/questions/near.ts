import type { Rng } from '../util/rng';

/** How well a rating matches a target: 1 when equal, falling off like a bell curve over `spread`. */
export function closeness(rating: number, target: number, spread: number): number {
  const z = (rating - target) / Math.max(1, spread);
  return Math.exp(-0.5 * z * z);
}

/**
 * Pick an item whose rating is near `target`: random, weighted by closeness (and an optional
 * extra weight). If nothing is anywhere close, take the nearest item.
 */
export function pickNear<T>(
  rng: Rng,
  items: readonly T[],
  rating: (item: T) => number,
  target: number,
  spread: number,
  weight: (item: T) => number = () => 1,
): T | undefined {
  if (items.length === 0) return undefined;
  const weights = items.map((item) => Math.max(0, weight(item)) * closeness(rating(item), target, spread));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total > 1e-9) {
    let roll = rng.next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i];
      if (roll < 0) return items[i];
    }
    return items[items.length - 1];
  }
  const usable = items.filter((item) => weight(item) > 0);
  const pool = usable.length ? usable : items;
  return pool.reduce((best, item) => (Math.abs(rating(item) - target) < Math.abs(rating(best) - target) ? item : best));
}
