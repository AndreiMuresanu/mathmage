import { describe, expect, it } from 'vitest';
import { cloneConfig, DEFAULT_CONFIG } from '../config/gameConfig';
import { matchConfig, setupLabel } from './matchSetup';

describe('matchConfig', () => {
  const custom = cloneConfig(DEFAULT_CONFIG);
  custom.player.maxHp = 9999;
  custom.enemies.chaser.hp = 1;
  custom.map = 'boxy';

  it('ranked games ignore custom settings but use the chosen map', () => {
    const cfg = matchConfig({ mode: 'solo', ranked: true, map: 'mazy' }, custom);
    expect(cfg).toEqual({ ...cloneConfig(DEFAULT_CONFIG), map: 'mazy' });
  });

  it('custom games use the custom settings with the chosen map', () => {
    const cfg = matchConfig({ mode: 'solo', ranked: false, map: 'buttons' }, custom);
    expect(cfg.player.maxHp).toBe(9999);
    expect(cfg.enemies.chaser.hp).toBe(1);
    expect(cfg.map).toBe('buttons');
  });

  it('returns a copy, so the match cannot change the defaults or the saved settings', () => {
    const ranked = matchConfig({ mode: 'solo', ranked: true, map: 'empty' }, custom);
    ranked.player.maxHp = 1;
    const own = matchConfig({ mode: 'solo', ranked: false, map: 'empty' }, custom);
    own.player.maxHp = 1;
    expect(DEFAULT_CONFIG.player.maxHp).not.toBe(1);
    expect(custom.player.maxHp).toBe(9999);
    expect(custom.map).toBe('boxy');
  });

  it('labels setups for the game-over screen', () => {
    expect(setupLabel({ mode: 'solo', ranked: true, map: 'empty' })).toBe('Ranked solo');
    expect(setupLabel({ mode: 'coop', ranked: false, map: 'empty' })).toBe('Custom co-op PvE');
  });
});
