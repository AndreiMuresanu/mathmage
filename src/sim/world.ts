import { ARENA_HEIGHT, ARENA_WIDTH, type GameConfig } from '../config/gameConfig';
import { createRng, type Rng } from '../util/rng';
import type {
  EnemyKind,
  EnemyState,
  MatchStats,
  PlayerIntent,
  PlayerState,
  ProjectileState,
  SimEvent,
  WaveState,
} from './types';
import { buildWaveQueue, damageScale, hpScale } from './waves';

const SPAWN_MARGIN = 30;
const PROJECTILE_TTL = 3;
/** Delay before the "not enough mana" feedback can repeat while the cast button is held. */
const NO_MANA_FEEDBACK_DELAY = 0.4;

/**
 * The whole match state and rules, independent of Phaser. The scene feeds it intents and
 * renders its state; co-op will run this on the host only.
 */
export class World {
  readonly cfg: GameConfig;
  readonly rng: Rng;
  readonly width = ARENA_WIDTH;
  readonly height = ARENA_HEIGHT;
  players: PlayerState[];
  enemies: EnemyState[] = [];
  projectiles: ProjectileState[] = [];
  wave: WaveState;
  stats: MatchStats;
  over = false;
  /** Events since the last drainEvents() call. */
  private events: SimEvent[] = [];
  private nextId = 1;

  constructor(cfg: GameConfig, seed?: number, playerIds: string[] = ['local']) {
    this.cfg = cfg;
    this.rng = createRng(seed);
    this.players = playerIds.map((id, i) => ({
      id,
      x: this.width / 2 + i * 60,
      y: this.height / 2,
      radius: cfg.player.radius,
      hp: cfg.player.maxHp,
      maxHp: cfg.player.maxHp,
      mana: Math.min(cfg.player.startMana, cfg.player.maxMana),
      maxMana: cfg.player.maxMana,
      aim: 0,
      selectedSpell: 0,
      cooldowns: cfg.spells.map(() => 0),
      stunRemaining: 0,
      invulnRemaining: 0,
      alive: true,
    }));
    this.wave = { round: 0, phase: 'break', timer: cfg.waves.breakSeconds, queue: [] };
    this.stats = {
      kills: 0,
      timeSurvived: 0,
      manaSpent: 0,
      damageDealt: 0,
      slots: cfg.questionSlots.map(() => ({ attempts: 0, correct: 0, manaEarned: 0 })),
    };
  }

  player(id: string): PlayerState | undefined {
    return this.players.find((p) => p.id === id);
  }

  drainEvents(): SimEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  // ---- Player actions outside the tick ----

  selectSpell(playerId: string, index: number): void {
    const p = this.player(playerId);
    if (p && index >= 0 && index < this.cfg.spells.length) p.selectedSpell = index;
  }

  /** Players can't start new questions while stunned (they can only read the solution). */
  canAnswer(playerId: string): boolean {
    const p = this.player(playerId);
    return !!p && p.alive && p.stunRemaining <= 0 && !this.over;
  }

  /** Apply the result of an answered question. Returns the mana actually gained. */
  answerQuestion(playerId: string, slotIndex: number, correct: boolean): number {
    const p = this.player(playerId);
    const slot = this.cfg.questionSlots[slotIndex];
    if (!p || !slot || !this.canAnswer(playerId)) return 0;
    const stats = this.stats.slots[slotIndex];
    stats.attempts++;
    if (!correct) {
      p.stunRemaining = slot.stunSeconds;
      this.events.push({ type: 'stunned', playerId, seconds: slot.stunSeconds });
      return 0;
    }
    stats.correct++;
    const gained = Math.max(0, Math.min(slot.manaReward, p.maxMana - p.mana));
    p.mana += gained;
    stats.manaEarned += gained;
    this.events.push({ type: 'mana', playerId, amount: gained });
    return gained;
  }

  // ---- Tick ----

  step(dt: number, intents: Record<string, PlayerIntent>): void {
    if (this.over) return;
    this.stats.timeSurvived += dt;
    for (const p of this.players) this.updatePlayer(p, dt, intents[p.id]);
    this.updateWaves(dt);
    for (const e of this.enemies) this.updateEnemy(e, dt);
    this.separateEnemies();
    this.updateProjectiles(dt);
    if (this.players.every((p) => !p.alive)) {
      this.over = true;
      this.events.push({ type: 'gameOver' });
    }
  }

  private updatePlayer(p: PlayerState, dt: number, intent: PlayerIntent | undefined): void {
    if (!p.alive) return;
    p.stunRemaining = Math.max(0, p.stunRemaining - dt);
    p.invulnRemaining = Math.max(0, p.invulnRemaining - dt);
    for (let i = 0; i < p.cooldowns.length; i++) p.cooldowns[i] = Math.max(0, p.cooldowns[i] - dt);
    if (!intent) return;
    p.aim = intent.aim;
    const stunned = p.stunRemaining > 0;

    if (!stunned) {
      const len = Math.hypot(intent.move.x, intent.move.y);
      if (len > 0) {
        p.x += (intent.move.x / len) * this.cfg.player.speed * dt;
        p.y += (intent.move.y / len) * this.cfg.player.speed * dt;
        p.x = clamp(p.x, p.radius, this.width - p.radius);
        p.y = clamp(p.y, p.radius, this.height - p.radius);
      }
    }

    if (intent.casting && !(stunned && this.cfg.stun.blocksCasting)) this.tryCast(p);
  }

  private tryCast(p: PlayerState): void {
    const index = p.selectedSpell;
    const spell = this.cfg.spells[index];
    if (!spell || p.cooldowns[index] > 0) return;
    if (p.mana < spell.manaCost) {
      p.cooldowns[index] = NO_MANA_FEEDBACK_DELAY;
      this.events.push({ type: 'noMana', playerId: p.id });
      return;
    }
    p.mana -= spell.manaCost;
    this.stats.manaSpent += spell.manaCost;
    p.cooldowns[index] = spell.cooldown;
    const dx = Math.cos(p.aim);
    const dy = Math.sin(p.aim);
    this.projectiles.push({
      id: this.nextId++,
      team: 'player',
      ownerId: p.id,
      x: p.x + dx * (p.radius + spell.radius),
      y: p.y + dy * (p.radius + spell.radius),
      vx: dx * spell.projectileSpeed,
      vy: dy * spell.projectileSpeed,
      radius: spell.radius,
      damage: spell.damage * this.cfg.player.damageDealtMult,
      ttl: PROJECTILE_TTL,
      color: spell.color,
    });
    this.events.push({ type: 'cast', playerId: p.id, spell: index });
  }

  private updateWaves(dt: number): void {
    const w = this.wave;
    w.timer -= dt;
    if (w.phase === 'break') {
      if (w.timer > 0) return;
      w.round++;
      w.phase = 'active';
      w.queue = buildWaveQueue(this.cfg, w.round, this.rng);
      w.timer = 0;
      this.events.push({ type: 'roundStart', round: w.round });
      return;
    }
    if (w.queue.length > 0) {
      if (w.timer <= 0) {
        this.spawnEnemy(w.queue.pop()!);
        w.timer = this.cfg.waves.spawnInterval;
      }
    } else if (this.enemies.length === 0) {
      this.events.push({ type: 'roundCleared', round: w.round });
      w.phase = 'break';
      w.timer = this.cfg.waves.breakSeconds;
    }
  }

  private spawnEnemy(kind: EnemyKind): void {
    const base = this.cfg.enemies[kind];
    const round = this.wave.round;
    const hp = base.hp * hpScale(this.cfg, round);
    // Pick a point on a random edge, just inside the arena.
    const edge = this.rng.int(0, 3);
    const along = this.rng.next();
    const x = edge === 0 ? SPAWN_MARGIN : edge === 1 ? this.width - SPAWN_MARGIN : along * this.width;
    const y = edge === 2 ? SPAWN_MARGIN : edge === 3 ? this.height - SPAWN_MARGIN : along * this.height;
    this.enemies.push({
      id: this.nextId++,
      kind,
      x,
      y,
      radius: base.radius,
      hp,
      maxHp: hp,
      speed: base.speed * this.cfg.enemies.speedMult,
      damage: base.damage * damageScale(this.cfg, round),
      // Stagger casters so they don't all fire at once.
      attackTimer: kind === 'caster' ? this.cfg.enemies.caster.fireInterval * (0.5 + this.rng.next()) : 0,
      strafe: this.rng.next() < 0.5 ? -1 : 1,
    });
  }

  private nearestPlayer(x: number, y: number): PlayerState | undefined {
    let best: PlayerState | undefined;
    let bestDist = Infinity;
    for (const p of this.players) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return best;
  }

  private updateEnemy(e: EnemyState, dt: number): void {
    e.attackTimer = Math.max(0, e.attackTimer - dt);
    const target = this.nearestPlayer(e.x, e.y);
    if (!target) return;
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;

    if (e.kind === 'chaser') {
      const reach = e.radius + target.radius;
      if (dist > reach) {
        const stepLen = Math.min(e.speed * dt, dist - reach);
        e.x += ux * stepLen;
        e.y += uy * stepLen;
      }
      if (dist <= reach + 2 && e.attackTimer <= 0) {
        this.damagePlayer(target, e.damage);
        e.attackTimer = this.cfg.enemies.chaser.attackCooldown;
      }
    } else {
      const range = this.cfg.enemies.caster.range;
      let mx = 0;
      let my = 0;
      if (dist > range) {
        mx = ux;
        my = uy;
      } else if (dist < range * 0.7) {
        mx = -ux;
        my = -uy;
      } else {
        mx = -uy * e.strafe * 0.5;
        my = ux * e.strafe * 0.5;
      }
      e.x = clamp(e.x + mx * e.speed * dt, e.radius, this.width - e.radius);
      e.y = clamp(e.y + my * e.speed * dt, e.radius, this.height - e.radius);
      if (e.attackTimer <= 0 && dist < range * 1.3) {
        const speed = this.cfg.enemies.caster.projectileSpeed;
        this.projectiles.push({
          id: this.nextId++,
          team: 'enemy',
          ownerId: e.id,
          x: e.x + ux * e.radius,
          y: e.y + uy * e.radius,
          vx: ux * speed,
          vy: uy * speed,
          radius: 6,
          damage: e.damage,
          ttl: PROJECTILE_TTL * 2,
          color: '#ff4d6d',
        });
        e.attackTimer = this.cfg.enemies.caster.fireInterval;
      }
    }
  }

  /** Push overlapping enemies apart so they don't stack into one blob. */
  private separateEnemies(): void {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minDist * minDist) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = (minDist - d) / 2;
        const nx = d2 === 0 ? 1 : dx / d;
        const ny = d2 === 0 ? 0 : dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }

  private updateProjectiles(dt: number): void {
    const survivors: ProjectileState[] = [];
    for (const pr of this.projectiles) {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.ttl -= dt;
      if (pr.ttl <= 0 || pr.x < -50 || pr.y < -50 || pr.x > this.width + 50 || pr.y > this.height + 50) continue;
      if (pr.team === 'player' ? this.hitEnemy(pr) : this.hitPlayer(pr)) continue;
      survivors.push(pr);
    }
    this.projectiles = survivors;
  }

  private hitEnemy(pr: ProjectileState): boolean {
    const target = this.enemies.find((e) => overlaps(pr, e));
    if (!target) return false;
    const amount = Math.min(pr.damage, target.hp);
    target.hp -= pr.damage;
    this.stats.damageDealt += amount;
    this.events.push({ type: 'enemyHit', enemyId: target.id, x: target.x, y: target.y, amount: pr.damage });
    if (target.hp <= 0) {
      this.enemies = this.enemies.filter((e) => e !== target);
      this.stats.kills++;
      this.events.push({ type: 'enemyDied', x: target.x, y: target.y, kind: target.kind });
    }
    return true;
  }

  private hitPlayer(pr: ProjectileState): boolean {
    const target = this.players.find((p) => p.alive && overlaps(pr, p));
    if (!target) return false;
    this.damagePlayer(target, pr.damage);
    return true;
  }

  private damagePlayer(p: PlayerState, rawDamage: number): void {
    if (!p.alive || p.invulnRemaining > 0) return;
    const amount = rawDamage * this.cfg.player.damageTakenMult;
    p.hp = Math.max(0, p.hp - amount);
    p.invulnRemaining = this.cfg.player.invulnAfterHit;
    this.events.push({ type: 'playerHit', playerId: p.id, amount });
    if (p.hp <= 0) {
      p.alive = false;
      this.events.push({ type: 'playerDied', playerId: p.id });
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function overlaps(a: { x: number; y: number; radius: number }, b: { x: number; y: number; radius: number }): boolean {
  const r = a.radius + b.radius;
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= r * r;
}
