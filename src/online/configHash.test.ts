import { describe, expect, it } from 'vitest';
import { cloneConfig, DEFAULT_CONFIG } from '../config/gameConfig';
import { configHash } from './configHash';

describe('configHash', () => {
  const base = configHash(DEFAULT_CONFIG);

  it('is stable, and ignores the map, the saved-config version and key order', () => {
    expect(configHash(cloneConfig(DEFAULT_CONFIG))).toBe(base);
    expect(configHash({ ...cloneConfig(DEFAULT_CONFIG), map: 'mazy' })).toBe(base);
    expect(configHash({ ...cloneConfig(DEFAULT_CONFIG), version: 999 })).toBe(base);
    const reordered = Object.fromEntries(Object.entries(cloneConfig(DEFAULT_CONFIG)).reverse()) as typeof DEFAULT_CONFIG;
    expect(configHash(reordered)).toBe(base);
  });

  it('changes when any setting changes', () => {
    const tweaks: ((c: typeof DEFAULT_CONFIG) => void)[] = [
      (c) => { c.player.maxHp += 1; },
      (c) => { c.spells[1].damage += 1; },
      (c) => { c.questionTypes[0].weight += 1; },
      (c) => { c.questionSources[0].weight = 0; },
      (c) => { c.enemies.pathfinding = !c.enemies.pathfinding; },
      (c) => { c.adaptive.startRating += 1; },
    ];
    for (const tweak of tweaks) {
      const c = cloneConfig(DEFAULT_CONFIG);
      tweak(c);
      expect(configHash(c)).not.toBe(base);
    }
  });
});
