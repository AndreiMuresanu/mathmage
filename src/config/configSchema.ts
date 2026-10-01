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
  path: 'spells' | 'questionSlots';
  itemTitle: string;
  maxItems: number;
  fields: FieldDef[];
}

export type GroupDef = ObjectGroupDef | ListGroupDef;

const num = (key: string, label: string, min: number, max: number, step: number, help?: string): FieldDef => ({
  key, label, type: 'number', min, max, step, help,
});
const bool = (key: string, label: string, help?: string): FieldDef => ({ key, label, type: 'boolean', help });

/** Keys for question slots, assigned by position. */
export const SLOT_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyV'];

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
    title: 'Question slots',
    path: 'questionSlots',
    itemTitle: 'Slot',
    maxItems: SLOT_KEYS.length,
    fields: [
      { key: 'label', label: 'Label', type: 'text' },
      num('manaReward', 'Mana for a correct answer', 0, 10000, 1),
      num('stunSeconds', 'Stun on a wrong answer (s)', 0, 120, 0.5),
      bool('autoNextOnCorrect', 'Next question right after a correct answer'),
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
    title: 'Stun',
    path: 'stun',
    fields: [
      bool('blocksCasting', 'Stun blocks casting'),
      bool('showSolution', 'Show the solution while stunned'),
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
      num('range', 'Preferred range', 50, 1200, 10),
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
      num('breakSeconds', 'Break between rounds (s)', 0, 120, 0.5),
      num('spawnInterval', 'Time between spawns (s)', 0, 10, 0.05),
      num('casterStartRound', 'Casters appear from round', 1, 100, 1),
      num('casterFraction', 'Fraction of casters', 0, 1, 0.05),
    ],
  },
];

export function getPath(obj: unknown, path: string): any {
  return path.split('.').reduce<any>((o, key) => (o == null ? o : o[key]), obj);
}
