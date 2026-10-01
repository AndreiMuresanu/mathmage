export interface Vec2 {
  x: number;
  y: number;
}

/** What a player wants to do this tick. In co-op, clients send these to the host. */
export interface PlayerIntent {
  /** Raw direction from input; normalized by the sim. */
  move: Vec2;
  /** Aim angle in radians. */
  aim: number;
  /** True while the cast button is held. */
  casting: boolean;
}

export interface PlayerState {
  id: string;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  aim: number;
  selectedSpell: number;
  /** Remaining cooldown per spell, in seconds. */
  cooldowns: number[];
  stunRemaining: number;
  invulnRemaining: number;
  alive: boolean;
}

export type EnemyKind = 'chaser' | 'caster';

export interface EnemyState {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  /** Chaser: contact cooldown. Caster: time until next shot. */
  attackTimer: number;
  /** Caster strafing direction (+1 / -1). */
  strafe: number;
}

export interface ProjectileState {
  id: number;
  team: 'player' | 'enemy';
  ownerId: string | number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  ttl: number;
  color: string;
}

export interface WaveState {
  round: number;
  phase: 'break' | 'active';
  /** Break: seconds until the next round. Active: seconds until the next spawn. */
  timer: number;
  /** Enemies still to spawn this round. */
  queue: EnemyKind[];
}

export interface SlotStats {
  attempts: number;
  correct: number;
  manaEarned: number;
}

export interface MatchStats {
  kills: number;
  timeSurvived: number;
  manaSpent: number;
  damageDealt: number;
  slots: SlotStats[];
}

export type SimEvent =
  | { type: 'cast'; playerId: string; spell: number }
  | { type: 'noMana'; playerId: string }
  | { type: 'mana'; playerId: string; amount: number }
  | { type: 'stunned'; playerId: string; seconds: number }
  | { type: 'playerHit'; playerId: string; amount: number }
  | { type: 'playerDied'; playerId: string }
  | { type: 'enemyHit'; enemyId: number; x: number; y: number; amount: number }
  | { type: 'enemyDied'; x: number; y: number; kind: EnemyKind }
  | { type: 'roundStart'; round: number }
  | { type: 'roundCleared'; round: number }
  | { type: 'gameOver' };
