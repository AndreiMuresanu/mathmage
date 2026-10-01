import Phaser from 'phaser';
import type { EnemyKind, SimEvent } from '../sim/types';
import { LOCAL_PLAYER, type Match } from './Match';
import { CIRCLE_RADIUS, colorToInt, ensureTextures } from './textures';

const PLAYER_COLOR = 0xb48cff;
const ENEMY_COLORS: Record<EnemyKind, number> = { chaser: 0xff5c5c, caster: 0xe05cff };
const HIT_FLASH_MS = 70;
/** Cap on the frame delta so a stalled tab doesn't teleport everything. */
const MAX_DT = 0.05;

type WasdKeys = Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

/** Reads input into intents, steps the match, and renders the sim state with tinted circles. */
export class GameScene extends Phaser.Scene {
  private match!: Match;
  private keys!: WasdKeys;
  private playerView!: Phaser.GameObjects.Image;
  private aimView!: Phaser.GameObjects.Image;
  private overlay!: Phaser.GameObjects.Graphics;
  private enemyViews = new Map<number, Phaser.GameObjects.Image>();
  private projectileViews = new Map<number, Phaser.GameObjects.Image>();
  private flashUntil = new Map<number, number>();

  constructor() {
    super('game');
  }

  init(data: { match: Match }): void {
    this.match = data.match;
    this.enemyViews = new Map();
    this.projectileViews = new Map();
    this.flashUntil = new Map();
  }

  create(): void {
    ensureTextures(this);
    this.add.image(0, 0, 'arena').setOrigin(0);

    const kb = this.input.keyboard!;
    // No capture: the answer field must still receive these letters when focused.
    this.keys = kb.addKeys('W,A,S,D', false) as WasdKeys;
    kb.on('keydown', (e: KeyboardEvent) => {
      if (!e.repeat) this.match.onKey(e.code);
    });
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', () => this.match.onArenaPointerDown());

    const p = this.match.world.player(LOCAL_PLAYER)!;
    this.playerView = this.add.image(p.x, p.y, 'circle').setTint(PLAYER_COLOR).setScale(p.radius / CIRCLE_RADIUS).setDepth(10);
    this.aimView = this.add.image(p.x, p.y, 'circle').setTint(0xffffff).setScale(4 / CIRCLE_RADIUS).setDepth(11);
    this.overlay = this.add.graphics().setDepth(20);

    this.events.once('shutdown', () => {
      kb.removeAllListeners('keydown');
      kb.removeAllKeys(true);
      kb.enabled = true;
      this.input.off('pointerdown');
    });
  }

  /** While the answer field is focused, every key belongs to it. */
  setTyping(typing: boolean): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.enabled = !typing;
    if (typing) kb.resetKeys();
  }

  update(_time: number, deltaMs: number): void {
    const world = this.match.world;
    const p = world.player(LOCAL_PLAYER)!;
    const pointer = this.input.activePointer;
    const typing = this.match.typing;
    const move = typing
      ? { x: 0, y: 0 }
      : {
          x: (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0),
          y: (this.keys.S.isDown ? 1 : 0) - (this.keys.W.isDown ? 1 : 0),
        };
    const events = this.match.update(Math.min(deltaMs / 1000, MAX_DT), {
      move,
      aim: Math.atan2(pointer.worldY - p.y, pointer.worldX - p.x),
      casting: pointer.leftButtonDown(),
    });
    for (const e of events) this.handleEvent(e);
    this.render();
  }

  private handleEvent(e: SimEvent): void {
    const p = this.match.world.player(LOCAL_PLAYER)!;
    switch (e.type) {
      case 'enemyHit':
        this.flashUntil.set(e.enemyId, this.time.now + HIT_FLASH_MS);
        break;
      case 'enemyDied':
        this.burst(e.x, e.y, ENEMY_COLORS[e.kind], 10);
        break;
      case 'playerHit':
        this.cameras.main.shake(120, 0.006);
        break;
      case 'mana':
        if (e.amount > 0) this.floatText(p.x, p.y - 30, `+${Math.round(e.amount)} mana`, '#7df9ff');
        break;
      case 'stunned':
        this.floatText(p.x, p.y - 30, 'Stunned!', '#ffd166');
        break;
      case 'playerDied':
        this.burst(p.x, p.y, PLAYER_COLOR, 24);
        break;
      case 'roundStart':
        this.banner(`Round ${e.round}`);
        break;
    }
  }

  private render(): void {
    const world = this.match.world;
    const p = world.player(LOCAL_PLAYER)!;

    this.playerView.setPosition(p.x, p.y).setVisible(p.alive);
    this.playerView.setAlpha(p.invulnRemaining > 0 && Math.floor(this.time.now / 60) % 2 === 0 ? 0.4 : 1);
    this.aimView
      .setPosition(p.x + Math.cos(p.aim) * (p.radius + 10), p.y + Math.sin(p.aim) * (p.radius + 10))
      .setVisible(p.alive);

    syncViews(this, this.enemyViews, world.enemies, (e, view) => {
      const flashing = (this.flashUntil.get(e.id) ?? 0) > this.time.now;
      view.setPosition(e.x, e.y).setScale(e.radius / CIRCLE_RADIUS).setTint(flashing ? 0xffffff : ENEMY_COLORS[e.kind]);
    });
    syncViews(this, this.projectileViews, world.projectiles, (pr, view, created) => {
      if (created) view.setTint(colorToInt(pr.color)).setScale(pr.radius / CIRCLE_RADIUS).setBlendMode(Phaser.BlendModes.ADD);
      view.setPosition(pr.x, pr.y);
    });

    const g = this.overlay.clear();
    for (const e of world.enemies) {
      if (e.hp >= e.maxHp) continue;
      const w = e.radius * 2;
      g.fillStyle(0x000000, 0.6).fillRect(e.x - w / 2, e.y - e.radius - 9, w, 4);
      g.fillStyle(0xff5c5c, 1).fillRect(e.x - w / 2, e.y - e.radius - 9, (w * Math.max(0, e.hp)) / e.maxHp, 4);
    }
    if (p.alive && p.stunRemaining > 0) {
      const pulse = 4 + Math.sin(this.time.now / 80) * 2;
      g.lineStyle(3, 0xffd166, 0.9).strokeCircle(p.x, p.y, p.radius + pulse + 4);
    }
  }

  private burst(x: number, y: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 20 + Math.random() * 40;
      const dot = this.add.image(x, y, 'circle').setTint(color).setScale(3 / CIRCLE_RADIUS).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        duration: 400,
        onComplete: () => dot.destroy(),
      });
    }
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const label = this.add
      .text(x, y, text, { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({ targets: label, y: y - 40, alpha: 0, duration: 900, onComplete: () => label.destroy() });
  }

  private banner(text: string): void {
    const label = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 120, text, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '48px',
        color: '#00ffcc',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(30);
    this.tweens.chain({
      targets: label,
      tweens: [
        { alpha: 1, duration: 250 },
        { alpha: 0, duration: 600, delay: 700 },
      ],
      onComplete: () => label.destroy(),
    });
  }
}

/** Keep one Image per sim entity: create new ones, update live ones, destroy removed ones. */
function syncViews<T extends { id: number; x: number; y: number }>(
  scene: Phaser.Scene,
  views: Map<number, Phaser.GameObjects.Image>,
  entities: readonly T[],
  apply: (entity: T, view: Phaser.GameObjects.Image, created: boolean) => void,
): void {
  const alive = new Set<number>();
  for (const entity of entities) {
    alive.add(entity.id);
    let view = views.get(entity.id);
    const created = !view;
    if (!view) {
      view = scene.add.image(entity.x, entity.y, 'circle');
      views.set(entity.id, view);
    }
    apply(entity, view, created);
  }
  for (const [id, view] of views) {
    if (!alive.has(id)) {
      view.destroy();
      views.delete(id);
    }
  }
}
