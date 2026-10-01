import { DEFAULT_CONFIG, cloneConfig, mergeWithDefaults, type GameConfig } from './gameConfig';

const CURRENT_KEY = 'mathmage.config';
const PRESETS_KEY = 'mathmage.presets';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** The config used for the next match (whatever was last edited). */
export function loadCurrentConfig(): GameConfig {
  const saved = read<unknown>(CURRENT_KEY, null);
  return saved ? mergeWithDefaults(saved) : cloneConfig(DEFAULT_CONFIG);
}

export function saveCurrentConfig(config: GameConfig): void {
  localStorage.setItem(CURRENT_KEY, JSON.stringify(config));
}

export function listPresets(): Record<string, GameConfig> {
  const presets = read<Record<string, unknown>>(PRESETS_KEY, {});
  return Object.fromEntries(Object.entries(presets).map(([name, cfg]) => [name, mergeWithDefaults(cfg)]));
}

export function savePreset(name: string, config: GameConfig): void {
  const presets = read<Record<string, unknown>>(PRESETS_KEY, {});
  presets[name] = config;
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

export function deletePreset(name: string): void {
  const presets = read<Record<string, unknown>>(PRESETS_KEY, {});
  delete presets[name];
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

/** Parse an exported config file; missing fields fall back to defaults. */
export function parseConfigJson(text: string): GameConfig {
  return mergeWithDefaults(JSON.parse(text));
}
