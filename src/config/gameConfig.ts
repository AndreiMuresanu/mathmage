/**
 * Every tunable gameplay number lives here. The config screen edits a copy of this object
 * before each match (see configSchema.ts for labels and ranges).
 */

export type SpellKind = 'projectile' | 'laser';

export interface SpellConfig {
  name: string;
  /** projectile: a moving bolt that hits the first enemy. laser: an instant beam that hits every enemy along it. */
  kind: SpellKind;
  manaCost: number;
  damage: number;
  projectileSpeed: number;
  /** Seconds between casts of this spell. */
  cooldown: number;
  radius: number;
  color: string;
  /** On hitting the first enemy, damage every enemy within this radius of the impact (0 = single target). */
  explosionRadius: number;
  /** Laser only: how far the beam reaches. */
  beamLength: number;
}

export interface SlotSource {
  /** Id of a QuestionSource in the registry (e.g. "arithmetic", "deck:hard-math"). */
  sourceId: string;
  weight: number;
}

/**
 * A difficulty tier of questions, relative to the player's current rating. Each new question
 * first picks a type by `weight`, then the question nearest (player rating + `ratingOffset`).
 */
export interface QuestionTypeConfig {
  label: string;
  /** Relative chance of picking this type (weights are normalized across types). */
  weight: number;
  /** Target question rating relative to the player's: −382 = 90% success, −147 = 70%, 0 = 50%. */
  ratingOffset: number;
  manaReward: number;
  stunSeconds: number;
  /** Load the next question right away after a correct answer (otherwise the window closes). */
  autoNextOnCorrect: boolean;
  /** Seconds to answer before the question counts as failed (0 = no limit). Runs while the window is closed. */
  timeLimit: number;
}

/** Elo-style adaptive difficulty (see src/questions/rating.ts). Ratings reset every match. */
export interface AdaptiveConfig {
  /** Every skill starts each match at this rating (100 ≈ 1 + 1, 2000 ≈ AMC). */
  startRating: number;
  /** Rating step for the first answers, and the floor it settles to as answers accumulate. */
  kMax: number;
  kMin: number;
  /** After this many answers (counted from the first miss) the step is halfway from kMax to kMin. */
  kDecayAnswers: number;
  /** Questions are pitched right at the rating until the player has missed this many, then tiers fan out. */
  calibrationMisses: number;
  /** 0 = only right/wrong counts; higher = answers faster/slower than the player's usual pace count more/less. */
  timeWeight: number;
  /** Score for a skip or timeout, on the scale where wrong = 0 and correct = 1. */
  skipScore: number;
  /** Seconds used to judge speed when a question type has no time limit. */
  referenceTime: number;
  /** How closely a question's rating must match its target (rating points, ~1 standard deviation). */
  spread: number;
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

/** Which families of "solve for x" trick questions to include. */
export interface AlgebraTricksConfig {
  completeSquare: boolean;
  substitution: boolean;
  radicals: boolean;
  factoring: boolean;
  fractions: boolean;
  absoluteValue: boolean;
  exponentsLogs: boolean;
  structural: boolean;
  /** Trig equations: hidden quadratics in sin/cos, a sin x + b cos x, double angles. */
  trig: boolean;
  /** Solve a formula for one letter; the answer is an expression. */
  rearranging: boolean;
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
  /** Saved-config format version (see migrateSavedConfig). */
  version: number;
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
  /** Which question sources are in play (and how often, among questions of similar difficulty). */
  questionSources: SlotSource[];
  adaptive: AdaptiveConfig;
  medium: MediumConfig;
  algebraTricks: AlgebraTricksConfig;
  stun: {
    blocksCasting: boolean;
    showSolution: boolean;
    /** Show the solution right away instead of behind a "Show solution" button. */
    autoRevealSolution: boolean;
    /** Game speed while reading the solution after a wrong answer (1 = normal, 0 = frozen). */
    slowMotion: number;
    /** Skipping a question stuns for the question type's stun length × this. */
    skipStunMultiplier: number;
  };
  enemies: {
    hpMult: number;
    damageMult: number;
    speedMult: number;
    /** Casters spread out to evenly spaced angles around the player instead of all coming from one side. */
    surround: boolean;
    /** Chance (0–1) that a defeated enemy drops a heal orb. */
    healDropChance: number;
    /** Health restored by touching a heal orb. */
    healAmount: number;
    /** Seconds before an uncollected heal orb disappears (0 = never). */
    healOrbLifetime: number;
    /** Heal orbs within this distance (px, beyond touching) drift toward a hurt player (0 = no drift). */
    healOrbDriftRange: number;
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

/** Bump when saved configs need migrating (see migrateSavedConfig). */
export const CONFIG_VERSION = 2;

export const ARENA_WIDTH = 1280;
export const ARENA_HEIGHT = 720;

export const DEFAULT_CONFIG: GameConfig = {
  version: CONFIG_VERSION,
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
    { name: 'Spark', kind: 'projectile', manaCost: 1, damage: 10, projectileSpeed: 650, cooldown: 0.2, radius: 5, color: '#7df9ff', explosionRadius: 0, beamLength: 0 },
    { name: 'Fireball', kind: 'projectile', manaCost: 3, damage: 55, projectileSpeed: 450, cooldown: 0.6, radius: 10, color: '#ff7b3a', explosionRadius: 150, beamLength: 0 },
    { name: 'Laser', kind: 'laser', manaCost: 3, damage: 30, projectileSpeed: 0, cooldown: 0.8, radius: 12, color: '#b6ff3a', explosionRadius: 0, beamLength: 900 },
  ],
  // Tiers target a 90% / 70% / 50% chance of success; the weights make ~85% of questions
  // answered correctly overall once the rating has settled (0.80·90% + 0.15·70% + 0.05·50% = 85%).
  questionTypes: [
    {
      label: 'Easy',
      weight: 80,
      ratingOffset: -382, // 90% success
      manaReward: 10,
      stunSeconds: 5,
      autoNextOnCorrect: false,
      timeLimit: 30,
    },
    {
      label: 'Medium',
      weight: 15,
      ratingOffset: -147, // 70% success
      manaReward: 24,
      stunSeconds: 5,
      autoNextOnCorrect: false,
      timeLimit: 45,
    },
    {
      label: 'Hard',
      weight: 5,
      ratingOffset: 0, // 50% success
      manaReward: 100,
      stunSeconds: 5,
      autoNextOnCorrect: false,
      timeLimit: 60,
    },
  ],
  questionSources: [
    { sourceId: 'arithmetic', weight: 1 },
    { sourceId: 'medium', weight: 1 },
    { sourceId: 'algebra_tricks', weight: 1 },
    { sourceId: 'deck:hard-math', weight: 1 },
    { sourceId: 'deck:contest', weight: 1 },
  ],
  adaptive: {
    startRating: 300,
    kMax: 300,
    kMin: 40,
    kDecayAnswers: 8,
    calibrationMisses: 2,
    timeWeight: 0.5,
    skipScore: 0.35,
    referenceTime: 30,
    spread: 100,
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
  algebraTricks: {
    completeSquare: true,
    substitution: true,
    radicals: true,
    factoring: true,
    fractions: true,
    absoluteValue: true,
    exponentsLogs: true,
    structural: true,
    trig: true,
    rearranging: true,
  },
  stun: {
    blocksCasting: true,
    showSolution: true,
    autoRevealSolution: false,
    slowMotion: 0.3,
    skipStunMultiplier: 0.5,
  },
  enemies: {
    hpMult: 1,
    damageMult: 1,
    speedMult: 1,
    surround: true,
    healDropChance: 0.33,
    healAmount: 3,
    healOrbLifetime: 40,
    healOrbDriftRange: 50,
    chaser: { hp: 10, speed: 50, damage: 5, radius: 14, attackCooldown: 0.8 },
    caster: { hp: 10, speed: 70, damage: 4, radius: 13, fireInterval: 2.2, stunSeconds: 0.1, range: 320, spacing: 140, projectileSpeed: 350 },
  },
  waves: {
    baseCount: 12,
    countGrowth: 4,
    hpGrowthPerRound: 0.0,
    damageGrowthPerRound: 0.05,
    firstWaveDelay: 0,
    breakSeconds: 5,
    roundTimeLimit: 30,
    roundTimeGrowth: 2,
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
  if (defaults === DEFAULT_CONFIG) partial = migrateSavedConfig(partial);
  if (Array.isArray(defaults)) {
    if (!Array.isArray(partial)) return structuredClone(defaults);
    // Arrays of objects (spells, question types): fill each element from the default with the same
    // name/label (so a saved "Fireball" gets Fireball's new fields), else from the first default.
    const identity = (x: unknown) =>
      x && typeof x === 'object' ? ((x as Record<string, unknown>).name ?? (x as Record<string, unknown>).label) : undefined;
    return partial.map((item) => {
      const id = identity(item);
      const template = (id !== undefined && defaults.find((d) => identity(d) === id)) || defaults[0];
      return template && typeof template === 'object' ? mergeWithDefaults(item, template) : item;
    });
  }
  if (defaults && typeof defaults === 'object') {
    const src = partial && typeof partial === 'object' ? (partial as Record<string, unknown>) : {};
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(defaults)) out[key] = mergeWithDefaults(src[key], value);
    return out;
  }
  return typeof partial === typeof defaults ? partial : defaults;
}

/**
 * Upgrade configs saved by older versions. Before adaptive difficulty, question types each had
 * their own `sources` (and there was a "Solve for x" type); those tiers don't map onto rating
 * offsets, so they're replaced with the new defaults.
 */
function migrateSavedConfig(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const cfg = { ...(raw as Record<string, unknown>) };
  const types = cfg.questionTypes;
  if (Array.isArray(types) && types.some((t) => t && typeof t === 'object' && 'sources' in t)) delete cfg.questionTypes;
  const version = typeof cfg.version === 'number' ? cfg.version : 1;
  // Version 2 added the built-in Contest Mix deck: switch it on in configs saved before it existed.
  if (version < 2 && Array.isArray(cfg.questionSources) && !cfg.questionSources.some((s) => s?.sourceId === 'deck:contest')) {
    cfg.questionSources = [...cfg.questionSources, { sourceId: 'deck:contest', weight: 1 }];
  }
  cfg.version = CONFIG_VERSION;
  return cfg;
}
