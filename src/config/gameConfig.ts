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

/**
 * A difficulty tier of questions. Each new question first picks a type by `weight`, then draws
 * a question from that type's sources.
 */
export interface QuestionTypeConfig {
  label: string;
  /** Relative chance of picking this type (weights are normalized across types). */
  weight: number;
  sources: SlotSource[];
  manaReward: number;
  stunSeconds: number;
  /** Load the next question right away after a correct answer (otherwise the window closes). */
  autoNextOnCorrect: boolean;
  /** Seconds to answer before the question counts as failed (0 = no limit). Runs while the window is closed. */
  timeLimit: number;
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

/** Which kinds of generated medium questions to include. */
export interface MediumConfig {
  linearEquations: boolean;
  percentages: boolean;
  powersAndRoots: boolean;
  fractions: boolean;
  bigMultiplication: boolean;
  orderOfOperations: boolean;
  averages: boolean;
  quadraticRoots: boolean;
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
  /** Seconds the player is rooted when hit by a caster projectile. */
  stunSeconds: number;
  /** Preferred distance from the player. */
  range: number;
  /** Casters steer away from other casters closer than this, so they spread out. */
  spacing: number;
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
  questionTypes: QuestionTypeConfig[];
  arithmetic: ArithmeticConfig;
  medium: MediumConfig;
  stun: {
    blocksCasting: boolean;
    showSolution: boolean;
    /** Show the solution right away instead of behind a "Show solution" button. */
    autoRevealSolution: boolean;
    /** Game speed while reading the solution after a wrong answer (1 = normal, 0 = frozen). */
    slowMotion: number;
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
    /** Seconds before round 1 starts. */
    firstWaveDelay: number;
    breakSeconds: number;
    /** Seconds after a round starts before the next one starts anyway, even with enemies left (0 = never). */
    roundTimeLimit: number;
    /** Seconds added to the round time limit each round. */
    roundTimeGrowth: number;
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
    speed: 180,
    radius: 16,
    maxMana: 100,
    startMana: 5,
    damageDealtMult: 1,
    damageTakenMult: 1,
    invulnAfterHit: 0.2,
  },
  spells: [
    { name: 'Spark', manaCost: 1, damage: 10, projectileSpeed: 650, cooldown: 0.2, radius: 5, color: '#7df9ff' },
    { name: 'Fireball', manaCost: 5, damage: 55, projectileSpeed: 450, cooldown: 0.6, radius: 10, color: '#ff7b3a' },
  ],
  questionTypes: [
    {
      label: 'Easy',
      weight: 7,
      sources: [{ sourceId: 'arithmetic', weight: 1 }],
      manaReward: 6,
      stunSeconds: 8,
      autoNextOnCorrect: false,
      timeLimit: 30,
    },
    {
      label: 'Medium',
      weight: 2,
      sources: [{ sourceId: 'medium', weight: 1 }],
      manaReward: 12,
      stunSeconds: 8,
      autoNextOnCorrect: false,
      timeLimit: 30,
    },
    {
      label: 'Hard',
      weight: 1,
      sources: [{ sourceId: 'deck:hard-math', weight: 1 }],
      manaReward: 100,
      stunSeconds: 8,
      autoNextOnCorrect: false,
      timeLimit: 30,
    },
  ],
  arithmetic: {
    allowAdd: true,
    allowSubtract: true,
    allowMultiply: true,
    allowDivide: true,
    minOperand: 2,
    maxOperand: 12,
    minTerms: 2,
    maxTerms: 3,
    allowParens: true,
    integerOnly: true,
    maxAbsResult: 200,
  },
  medium: {
    linearEquations: true,
    percentages: true,
    powersAndRoots: true,
    fractions: true,
    bigMultiplication: true,
    orderOfOperations: true,
    averages: true,
    quadraticRoots: true,
  },
  stun: {
    blocksCasting: true,
    showSolution: true,
    autoRevealSolution: false,
    slowMotion: 0.3,
  },
  enemies: {
    hpMult: 1,
    damageMult: 1,
    speedMult: 1,
    chaser: { hp: 10, speed: 50, damage: 5, radius: 14, attackCooldown: 0.8 },
    caster: { hp: 20, speed: 70, damage: 4, radius: 13, fireInterval: 2.2, stunSeconds: 0.1, range: 320, spacing: 140, projectileSpeed: 350 },
  },
  waves: {
    baseCount: 6,
    countGrowth: 4,
    hpGrowthPerRound: 0.0,
    damageGrowthPerRound: 0.05,
    firstWaveDelay: 0,
    breakSeconds: 5,
    roundTimeLimit: 30,
    roundTimeGrowth: 2,
    spawnInterval: 0.6,
    casterStartRound: 2,
    casterFraction: 0.5,
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
    // Arrays of objects (spells, question types): merge each element with the first default as a template.
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
