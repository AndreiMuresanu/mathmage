/**
 * Labels, ranges and help text for every tunable. The config screen is generated from this,
 * so a new tunable only needs a field in GameConfig/DEFAULT_CONFIG plus one line here.
 */

export type FieldType = 'number' | 'boolean' | 'text' | 'color' | 'select';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
  /** For 'select': [value, label] pairs. */
  options?: [string, string][];
}

export interface ObjectGroupDef {
  kind: 'object';
  title: string;
  /** Dot path to the object inside GameConfig, e.g. "enemies.chaser". */
  path: string;
  fields: FieldDef[];
}

export interface ListGroupDef {
  kind: 'list';
  title: string;
  path: 'spells' | 'questionTypes';
  itemTitle: string;
  maxItems: number;
  fields: FieldDef[];
}

/** The global list of question sources (custom editor in ConfigScreen). */
export interface SourcesGroupDef {
  kind: 'sources';
  title: string;
}

export type GroupDef = ObjectGroupDef | ListGroupDef | SourcesGroupDef;

const num = (key: string, label: string, min: number, max: number, step: number, help?: string): FieldDef => ({
  key, label, type: 'number', min, max, step, help,
});
const bool = (key: string, label: string, help?: string): FieldDef => ({ key, label, type: 'boolean', help });


export const CONFIG_GROUPS: GroupDef[] = [
  {
    kind: 'object',
    title: 'Player',
    path: 'player',
    fields: [
      num('maxHp', 'Max HP', 1, 10000, 1),
      num('speed', 'Move speed (px/s)', 10, 1000, 10),
      num('radius', 'Size (radius)', 4, 64, 1),
      num('maxMana', 'Max mana', 1, 10000, 1),
      num('startMana', 'Starting mana', 0, 10000, 1),
      num('damageDealtMult', 'Damage dealt ×', 0, 20, 0.05),
      num('damageTakenMult', 'Damage taken ×', 0, 20, 0.05),
      num('invulnAfterHit', 'Invulnerability after hit (s)', 0, 5, 0.05),
    ],
  },
  {
    kind: 'list',
    title: 'Spells',
    path: 'spells',
    itemTitle: 'Spell',
    maxItems: 9,
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      {
        key: 'kind',
        label: 'Type',
        type: 'select',
        options: [['projectile', 'Projectile'], ['laser', 'Laser (instant line)']],
        help: 'Projectile: a bolt that hits the first enemy (or explodes). Laser: an instant beam that hits every enemy along it.',
      },
      num('manaCost', 'Mana cost', 0, 1000, 1),
      num('damage', 'Damage', 0, 10000, 1),
      num('projectileSpeed', 'Projectile speed', 0, 3000, 10, 'Projectiles only.'),
      num('cooldown', 'Cooldown (s)', 0, 10, 0.05),
      num('radius', 'Projectile radius / beam half-width', 1, 64, 1),
      num('explosionRadius', 'Explosion radius', 0, 600, 5, 'Explodes on the first enemy hit, dealing full damage to every enemy within this radius. 0 = hits one enemy only. Projectiles only.'),
      num('beamLength', 'Beam length', 0, 3000, 10, 'Lasers only: how far the beam reaches.'),
      { key: 'color', label: 'Color', type: 'color' },
    ],
  },
  {
    kind: 'list',
    title: 'Question types',
    path: 'questionTypes',
    itemTitle: 'Question type',
    maxItems: 8,
    fields: [
      { key: 'label', label: 'Label', type: 'text' },
      num('weight', 'Chance weight', 0, 1000, 0.5, 'Relative odds of this type when Space draws a new question. Weights 6 / 3 / 1 = 60% / 30% / 10%.'),
      num('ratingOffset', 'Difficulty vs your rating', -1500, 1500, 10, 'Questions are rated near your rating + this. −382 = 90% chance of success, −147 = 70%, 0 = 50%, +150 ≈ 30%.'),
      num('manaReward', 'Mana for a correct answer', 0, 10000, 1),
      num('stunSeconds', 'Stun on a wrong answer (s)', 0, 120, 0.5),
      bool('autoNextOnCorrect', 'Next question right after a correct answer'),
      num('timeLimit', 'Time limit (s)', 0, 600, 1, 'Fail and get stunned if not answered in time. The clock keeps running while the window is closed; 0 = no limit.'),
    ],
  },
  { kind: 'sources', title: 'Question sources' },
  {
    kind: 'object',
    title: 'Adaptive difficulty',
    path: 'adaptive',
    fields: [
      num('startRating', 'Starting rating', 0, 3000, 10, 'Every match starts here and recalibrates from your answers. ~100 = 1 + 1, ~900 = fractions and percentages, ~1500 = algebra tricks, ~2000 = AMC.'),
      num('kMax', 'Rating step at the start', 1, 1000, 5, 'How far one answer moves your rating while it is still uncertain.'),
      num('kMin', 'Rating step once settled', 1, 500, 1, 'How far one answer moves your rating after many answers.'),
      num('kDecayAnswers', 'Answers to settle halfway', 1, 200, 1, 'Counted from your first miss: after this many answers the step is halfway from the start value to the settled value.'),
      num('calibrationMisses', 'Calibration misses', 0, 20, 1, 'Until you have missed this many questions, every question is pitched right at your rating so it climbs fast; the Easy/Hard offsets fade in with each miss.'),
      num('timeWeight', 'Speed weight', 0, 1, 0.05, '0 = only right/wrong counts. Higher = answers faster than your usual pace count for more, slower ones for less (and the reverse for wrong answers). Measured against your own pace, so it never inflates the rating.'),
      num('skipScore', 'Skip / timeout score', 0, 1, 0.05, 'How a skip or timeout counts, where a wrong answer = 0 and a correct one = 1.'),
      num('referenceTime', 'Reference time (s)', 1, 600, 1, 'Used to judge speed when a question type has no time limit.'),
      num('spread', 'Question match spread', 10, 1000, 10, 'How closely a question’s rating must match its target (rating points). Smaller = more precise, larger = more variety.'),
    ],
  },
  {
    kind: 'object',
    title: 'Medium questions',
    path: 'medium',
    fields: [
      bool('linearEquations', 'Linear equations', 'Solve 7x - 12 = 30, or x on both sides.'),
      bool('percentages', 'Percentages', '15% of 240; 36 is 15% of what?'),
      bool('powersAndRoots', 'Powers and roots', '17², √324, 2⁹, 3⁵, ∛343'),
      bool('fractions', 'Fractions', 'Add, subtract or multiply two fractions.'),
      bool('bigMultiplication', 'Multi-digit multiplication', '47 × 38, 356 × 7'),
      bool('orderOfOperations', 'Order of operations', '5 + 3 × 4², 2 × (−3)² − 4²'),
      bool('averages', 'Averages', 'Mean of a list, or the missing number for a given mean.'),
      bool('quadraticRoots', 'Quadratic roots', 'Larger solution of x² − 5x + 6 = 0'),
    ],
  },
  {
    kind: 'object',
    title: 'Algebra tricks (solve for x)',
    path: 'algebraTricks',
    fields: [
      bool('completeSquare', 'Completing the square', 'x² + 6x = 2; minimum of 2x² − 12x + 7; circle radius; factor x⁴ + 4'),
      bool('substitution', 'Hidden quadratics (substitution)', 'x⁴ − 5x² + 4, 4ˣ − 6·2ˣ + 8, x − 5√x + 6, x^(2/3), x(x+1)(x+2)(x+3) = 24, palindromic quartics'),
      bool('radicals', 'Square roots', 'Isolate and square (reject fake roots), conjugates, telescoping sums, rationalizing'),
      bool('factoring', 'Factoring', 'Grouping, factor instead of dividing, rational roots, cube identities, factor/remainder theorem'),
      bool('fractions', 'Fractions', 'Clear denominators and reject bad roots, partial-fraction cover-up, telescoping'),
      bool('absoluteValue', 'Absolute values', 'Split into cases and check each; |A| = |B|; |x| as the unknown; integer counts'),
      bool('exponentsLogs', 'Exponents and logs', 'Same base, combine logs, ln both sides, change of base, nested logs'),
      bool('structural', 'Structural tricks', 'Sum and product, Vieta, sum of squares = 0, guess and prove, plug in x = 1, self-similar'),
      bool('trig', 'Trig equations', 'Quadratics in sin/cos, a sin x + b cos x = R sin(x + φ), double angles'),
      bool('rearranging', 'Rearranging formulas', 'Solve y = (2x+1)/(3x−4) for x (answer is an expression), inverse functions, initial conditions'),
    ],
  },
  {
    kind: 'object',
    title: 'Stun',
    path: 'stun',
    fields: [
      bool('blocksCasting', 'Stun blocks casting'),
      bool('showSolution', 'Show the solution while stunned'),
      bool('autoRevealSolution', 'Reveal the solution automatically', 'Off: the correct answer and steps stay hidden until you click "Show solution".'),
      num('skipStunMultiplier', 'Skip stun multiplier', 0, 2, 0.05, 'Skipping a question stuns for the stun length × this (0.5 = half as long as a wrong answer).'),
      num('slowMotion', 'Game speed while reading the solution', 0, 1, 0.05, '1 = normal speed, 0.3 = slow motion, 0 = frozen. The stun countdown always runs in real time.'),
    ],
  },
  {
    kind: 'object',
    title: 'Enemies (global)',
    path: 'enemies',
    fields: [
      num('hpMult', 'Enemy HP ×', 0.05, 50, 0.05),
      num('damageMult', 'Enemy damage ×', 0, 50, 0.05),
      num('speedMult', 'Enemy speed ×', 0.05, 10, 0.05),
      bool('surround', 'Casters surround the player', 'Casters spread out to evenly spaced angles around the player instead of all coming from one side.'),
    ],
  },
  {
    kind: 'object',
    title: 'Chaser enemy',
    path: 'enemies.chaser',
    fields: [
      num('hp', 'HP', 1, 10000, 1),
      num('speed', 'Speed', 1, 1000, 5),
      num('damage', 'Contact damage', 0, 1000, 1),
      num('radius', 'Size (radius)', 4, 64, 1),
      num('attackCooldown', 'Time between hits (s)', 0.05, 10, 0.05),
    ],
  },
  {
    kind: 'object',
    title: 'Caster enemy',
    path: 'enemies.caster',
    fields: [
      num('hp', 'HP', 1, 10000, 1),
      num('speed', 'Speed', 1, 1000, 5),
      num('damage', 'Projectile damage', 0, 1000, 1),
      num('radius', 'Size (radius)', 4, 64, 1),
      num('fireInterval', 'Time between shots (s)', 0.1, 20, 0.1),
      num('stunSeconds', 'Stun when hit (s)', 0, 10, 0.1, 'Roots the player; does not close the question window.'),
      num('range', 'Preferred range', 50, 1200, 10),
      num('spacing', 'Spacing from other casters', 0, 600, 10, 'Casters steer away from each other inside this distance. 0 = no spreading.'),
      num('projectileSpeed', 'Projectile speed', 20, 2000, 10),
    ],
  },
  {
    kind: 'object',
    title: 'Waves',
    path: 'waves',
    fields: [
      num('baseCount', 'Enemies in round 1', 1, 500, 1),
      num('countGrowth', 'Extra enemies per round', 0, 100, 0.5),
      num('hpGrowthPerRound', 'Enemy HP growth per round', 0, 5, 0.01, '0.12 = +12% HP each round'),
      num('damageGrowthPerRound', 'Enemy damage growth per round', 0, 5, 0.01),
      num('firstWaveDelay', 'Delay before round 1 (s)', 0, 120, 0.5),
      num('breakSeconds', 'Break between rounds (s)', 0, 120, 0.5),
      num('roundTimeLimit', 'Round time limit (s)', 0, 600, 1, 'The next wave starts after this long even if enemies are left. 0 = only when all enemies are dead.'),
      num('roundTimeGrowth', 'Extra time per round (s)', 0, 60, 0.5, 'Added to the time limit each round: round N gets limit + growth × (N − 1).'),
      num('spawnInterval', 'Time between spawns (s)', 0, 10, 0.05),
      num('casterStartRound', 'Casters appear from round', 1, 100, 1),
      num('casterFraction', 'Fraction of casters', 0, 1, 0.05),
    ],
  },
];

export function getPath(obj: unknown, path: string): any {
  return path.split('.').reduce<any>((o, key) => (o == null ? o : o[key]), obj);
}
