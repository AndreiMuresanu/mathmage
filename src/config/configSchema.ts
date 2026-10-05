/**
 * Labels, ranges and help text for every tunable. The config screen is generated from this,
 * so a new tunable only needs a field in GameConfig/DEFAULT_CONFIG plus one line here.
 */

export type FieldType = 'number' | 'boolean' | 'text' | 'color';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
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

export type GroupDef = ObjectGroupDef | ListGroupDef;

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
      num('manaCost', 'Mana cost', 0, 1000, 1),
      num('damage', 'Damage', 0, 10000, 1),
      num('projectileSpeed', 'Projectile speed', 50, 3000, 10),
      num('cooldown', 'Cooldown (s)', 0, 10, 0.05),
      num('radius', 'Projectile radius', 1, 64, 1),
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
      num('manaReward', 'Mana for a correct answer', 0, 10000, 1),
      num('stunSeconds', 'Stun on a wrong answer (s)', 0, 120, 0.5),
      bool('autoNextOnCorrect', 'Next question right after a correct answer'),
      num('timeLimit', 'Time limit (s)', 0, 600, 1, 'Fail and get stunned if not answered in time. The clock keeps running while the window is closed; 0 = no limit.'),
    ],
  },
  {
    kind: 'object',
    title: 'Arithmetic questions',
    path: 'arithmetic',
    fields: [
      bool('allowAdd', 'Addition'),
      bool('allowSubtract', 'Subtraction'),
      bool('allowMultiply', 'Multiplication'),
      bool('allowDivide', 'Division'),
      num('minOperand', 'Smallest number', -1000, 1000, 1),
      num('maxOperand', 'Largest number', -1000, 10000, 1),
      num('minTerms', 'Min numbers per expression', 1, 8, 1),
      num('maxTerms', 'Max numbers per expression', 1, 8, 1),
      bool('allowParens', 'Allow parentheses'),
      bool('integerOnly', 'Whole-number results only', 'Every intermediate result must be an integer.'),
      num('maxAbsResult', 'Largest allowed result', 1, 1000000, 1),
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
    title: 'Stun',
    path: 'stun',
    fields: [
      bool('blocksCasting', 'Stun blocks casting'),
      bool('showSolution', 'Show the solution while stunned'),
      bool('autoRevealSolution', 'Reveal the solution automatically', 'Off: the correct answer and steps stay hidden until you click "Show solution".'),
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
