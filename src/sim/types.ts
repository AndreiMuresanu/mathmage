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
  /** True while the revive key (F) is held: revives a downed teammate in range (co-op). */
  reviving?: boolean;
  /** Selected spell index; lets remote players switch spells through their intents. */
  spell?: number;
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
  /** Stun from a wrong answer: rooted and can't open questions. */
  stunRemaining: number;
  /** Short stun from enemy projectiles: rooted only. */
  hitStunRemaining: number;
  invulnRemaining: number;
  /** False while downed (0 HP). Downed mages stay in the world until revived or the match ends. */
  alive: boolean;
  /** While downed: seconds of revive progress so far (resets when nobody is reviving). */
  reviveProgress: number;
  /** This player's answers, indexed like cfg.questionTypes (the game-over table shows your own). */
  questionStats: QuestionTypeStats[];
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
  /** Seconds of hit-stun applied to a player on impact. */
  stun: number;
  /** Area damage radius on impact (0 = single target). */
  explosionRadius: number;
  ttl: number;
  color: string;
}

/** A heal orb dropped by a defeated enemy. */
export interface PickupState {
  id: number;
  x: number;
  y: number;
  radius: number;
  heal: number;
  /** Seconds until it disappears (Infinity = never). */
  ttl: number;
}

export interface WaveState {
  round: number;
  phase: 'break' | 'active';
  /** Break: seconds until the next round. Active: seconds until the next spawn. */
  timer: number;
  /** Enemies still to spawn this round. */
  queue: EnemyKind[];
  /** Active: seconds until the next wave starts regardless of survivors (Infinity = no limit). */
  roundTimeLeft: number;
}

export interface QuestionTypeStats {
  attempts: number;
  correct: number;
  manaEarned: number;
}

export interface MatchStats {
  kills: number;
  timeSurvived: number;
  manaSpent: number;
  damageDealt: number;
  /** Indexed like cfg.questionTypes. */
  questionTypes: QuestionTypeStats[];
}

export type SimEvent =
  | { type: 'cast'; playerId: string; spell: number }
  | { type: 'noMana'; playerId: string }
  | { type: 'mana'; playerId: string; amount: number; /** Question type answered (index into cfg.questionTypes). */ typeIndex: number }
  | { type: 'stunned'; playerId: string; seconds: number }
  | { type: 'playerHit'; playerId: string; amount: number }
  | { type: 'hitStunned'; playerId: string; seconds: number }
  /** The player went down (0 HP). In co-op a teammate can still revive them. */
  | { type: 'playerDied'; playerId: string }
  | { type: 'revived'; playerId: string; byId: string; x: number; y: number }
  | { type: 'enemyHit'; enemyId: number; x: number; y: number; amount: number }
  | { type: 'enemyDied'; x: number; y: number; kind: EnemyKind }
  | { type: 'healed'; playerId: string; amount: number; x: number; y: number }
  | { type: 'explosion'; x: number; y: number; radius: number; color: string; targets: { id: number; x: number; y: number; radius: number }[] }
  | { type: 'beam'; x1: number; y1: number; x2: number; y2: number; width: number; color: string }
  | { type: 'roundStart'; round: number }
  | { type: 'roundCleared'; round: number }
  | { type: 'gameOver' };
