/**
 * Every tunable gameplay number lives here. The config screen edits a copy of this object
 * before each match (see configSchema.ts for labels and ranges).
 */

export interface SpellConfig {
  name: string;
  manaCost: number;
  damage: number;
  projectileSpeed: number;
  /** Seconds between casts of this spell. */
  cooldown: number;
  radius: number;
  color: string;
}

export interface SlotSource {
  /** Id of a QuestionSource in the registry (e.g. "arithmetic", "deck:hard-math"). */
  sourceId: string;
  weight: number;
}

export interface QuestionSlotConfig {
  /** Keyboard code that toggles this slot's window, e.g. "KeyZ". */
  key: string;
  label: string;
  sources: SlotSource[];
  manaReward: number;
  stunSeconds: number;
  /** Load the next question right away after a correct answer (otherwise the window closes). */
  autoNextOnCorrect: boolean;
}

export interface ArithmeticConfig {
  allowAdd: boolean;
  allowSubtract: boolean;
  allowMultiply: boolean;
  allowDivide: boolean;
  minOperand: number;
  maxOperand: number;
  minTerms: number;
  maxTerms: number;
  allowParens: boolean;
  /** Reject expressions whose intermediate results are not integers. */
  integerOnly: boolean;
  /** Reject expressions whose intermediate results exceed this magnitude. */
  maxAbsResult: number;
}

export interface ChaserConfig {
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  /** Seconds between contact hits. */
  attackCooldown: number;
}

export interface CasterConfig {
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  /** Seconds between shots. */
  fireInterval: number;
  /** Preferred distance from the player. */
  range: number;
  projectileSpeed: number;
}

export interface GameConfig {
  player: {
    maxHp: number;
    speed: number;
    radius: number;
    maxMana: number;
    startMana: number;
    damageDealtMult: number;
    damageTakenMult: number;
    /** Seconds of invulnerability after taking a hit. */
    invulnAfterHit: number;
  };
  spells: SpellConfig[];
  questionSlots: QuestionSlotConfig[];
  arithmetic: ArithmeticConfig;
  stun: {
    blocksCasting: boolean;
    showSolution: boolean;
  };
  enemies: {
    hpMult: number;
    damageMult: number;
    speedMult: number;
    chaser: ChaserConfig;
    caster: CasterConfig;
  };
  waves: {
    baseCount: number;
    countGrowth: number;
    hpGrowthPerRound: number;
    damageGrowthPerRound: number;
    breakSeconds: number;
    spawnInterval: number;
    casterStartRound: number;
    /** Fraction of each wave (from casterStartRound on) that are casters. */
    casterFraction: number;
  };
}

export const ARENA_WIDTH = 1280;
export const ARENA_HEIGHT = 720;

export const DEFAULT_CONFIG: GameConfig = {
  player: {
    maxHp: 100,
    speed: 220,
    radius: 16,
    maxMana: 100,
    startMana: 30,
    damageDealtMult: 1,
    damageTakenMult: 1,
    invulnAfterHit: 0.5,
  },
  spells: [
    { name: 'Spark', manaCost: 4, damage: 10, projectileSpeed: 650, cooldown: 0.2, radius: 5, color: '#7df9ff' },
    { name: 'Fireball', manaCost: 20, damage: 55, projectileSpeed: 450, cooldown: 0.6, radius: 10, color: '#ff7b3a' },
  ],
  questionSlots: [
    {
      key: 'KeyZ',
      label: 'Easy',
      sources: [{ sourceId: 'arithmetic', weight: 1 }],
      manaReward: 12,
      stunSeconds: 3,
      autoNextOnCorrect: true,
    },
    {
      key: 'KeyX',
      label: 'Hard',
      sources: [{ sourceId: 'deck:hard-math', weight: 1 }],
      manaReward: 70,
      stunSeconds: 8,
      autoNextOnCorrect: false,
    },
  ],
  arithmetic: {
    allowAdd: true,
    allowSubtract: true,
    allowMultiply: true,
    allowDivide: true,
    minOperand: 1,
    maxOperand: 12,
    minTerms: 2,
    maxTerms: 3,
    allowParens: true,
    integerOnly: true,
    maxAbsResult: 200,
  },
  stun: {
    blocksCasting: true,
    showSolution: true,
  },
  enemies: {
    hpMult: 1,
    damageMult: 1,
    speedMult: 1,
    chaser: { hp: 30, speed: 90, damage: 10, radius: 14, attackCooldown: 0.8 },
    caster: { hp: 25, speed: 70, damage: 8, radius: 13, fireInterval: 2.2, range: 320, projectileSpeed: 220 },
  },
  waves: {
    baseCount: 4,
    countGrowth: 2,
    hpGrowthPerRound: 0.12,
    damageGrowthPerRound: 0.05,
    breakSeconds: 5,
    spawnInterval: 0.6,
    casterStartRound: 2,
    casterFraction: 0.3,
  },
};

export function cloneConfig(config: GameConfig): GameConfig {
  return structuredClone(config);
}

/**
 * Fill in any fields missing from a saved/imported config with defaults, so presets
 * keep working after new tunables are added.
 */
export function mergeWithDefaults(partial: unknown, defaults: unknown = DEFAULT_CONFIG): any {
  if (Array.isArray(defaults)) {
    if (!Array.isArray(partial)) return structuredClone(defaults);
    // Arrays of objects (spells, slots): merge each element with the first default as a template.
    const template = defaults[0];
    return partial.map((item) =>
      template && typeof template === 'object' ? mergeWithDefaults(item, template) : item,
    );
  }
  if (defaults && typeof defaults === 'object') {
    const src = partial && typeof partial === 'object' ? (partial as Record<string, unknown>) : {};
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(defaults)) out[key] = mergeWithDefaults(src[key], value);
    return out;
  }
  return typeof partial === typeof defaults ? partial : defaults;
}
