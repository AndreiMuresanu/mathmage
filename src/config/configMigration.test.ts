import { describe, expect, it } from 'vitest';
import { mergeWithDefaults, type GameConfig } from './gameConfig';

describe('saved config migration', () => {
  it('renames a saved "Spark" spell to "Star" (keeping its customised values)', () => {
    const saved = { version: 3, spells: [{ name: 'Spark', damage: 99 }, { name: 'Fireball' }] };
    const cfg = mergeWithDefaults(saved) as GameConfig;
    expect(cfg.spells.map((s) => s.name)).toEqual(['Star', 'Fireball']);
    expect(cfg.spells[0].damage).toBe(99);
  });
});
