import Phaser from 'phaser';
import type { EnemyKind, PickupState, SimEvent } from '../sim/types';
import { LOCAL_PLAYER, PAUSE_KEYS, type Match } from './Match';
import { BLOCK_SIZE, CIRCLE_RADIUS, colorToInt, ensureTextures } from './textures';

const PLAYER_COLOR = 0xb48cff;
const ENEMY_COLORS: Record<EnemyKind, number> = { chaser: 0xff5c5c, caster: 0xe05cff };
const HIT_FLASH_MS = 70;
/** Glowing red of heal orbs: a bright core with a softer glow. */
const HEAL_COLOR = 0xff4545;
const HEAL_GLOW_COLOR = 0xff3030;
/** Fire palette over a particle's life, in hard steps: yellow → orange → red → dark red. */
const FIRE_COLORS = [0xffe14d, 0xff9a1f, 0xe8401a, 0x8a1a08];
/** Mana orb colors (twinkle between them). */
const MANA_ORB_COLORS = [0x7df9ff, 0x4d9dff, 0xc8f6ff];
/** Extra orb colors mixed in for harder questions. */
const RARE_ORB_COLORS = [0xffe27a, 0xc69cff];
/** Mana restore timeline per orb, in seconds: pop out, spiral up around the player, fly to the bar. */
const ORB_APPEAR = 0.17;
const ORB_SPIRAL = 0.75;
const ORB_FLY = 0.20;
/** Vertical squash of the orbit ellipse: a horizontal circle seen from a 3/4 (Diablo-style) camera. */
const ORBIT_SQUASH = 0.35;
/** How high the orbs rise above the player while spiralling, in px. */
const ORB_RISE = 15;
/** Orb core radius and glow halo radius, in px. */
const ORB_SIZE = 6;
const ORB_HALO = 15;

interface ManaOrb {
  img: Phaser.GameObjects.Image;
  colors: number[];
  /** Core radius (px) and rise height (px) for this orb; both grow with question difficulty. */
  size: number;
  rise: number;
  /** Leaves a sparkle trail (harder questions). */
  trail: boolean;
  /** Faint glow drawn behind the orb. */
  halo: Phaser.GameObjects.Image;
  /** Seconds since the effect started (negative = waiting for its stagger delay). */
  age: number;
  theta: number;
  omega: number;
  radius: number;
  /** The vortex tightens from `radius` down to this, hugging the player by the end. */
  minRadius: number;
  seed: number;
  /** Where the spiral ended; the fly-to-bar phase starts from here. */
  flyFrom?: { x: number; y: number };
}

/** How long an enemy caught in an explosion keeps burning (visual only), in ms. */
const BURN_MS = 1100;
/** Flames on a burning enemy. */
const FLAME_COLORS = [0xffb43c, 0xff7a1a, 0xd9310f, 0x5a0f04];

/** Particle scale for a square `px` pixels wide. */
const block = (px: number) => px / BLOCK_SIZE;
/** Ease that jumps in `n` hard steps instead of changing smoothly (retro look). */
const stepped = (n: number) => (t: number) => Math.floor(t * n) / n;
/** Tint that walks through `colors` in hard steps over the particle's life. */
const steppedColors = (colors: number[]) => ({
  onEmit: () => colors[0],
  onUpdate: (_particle: unknown, _key: string, t: number) => colors[Math.min(colors.length - 1, Math.floor(t * colors.length))],
});
/** Cap on the frame delta so a stalled tab doesn't teleport everything. */
const MAX_DT = 0.05;

type MoveKeys = Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT', Phaser.Input.Keyboard.Key>;

/** Reads input into intents, steps the match, and renders the sim state with tinted circles. */
export class GameScene extends Phaser.Scene {
  private match!: Match;
  private keys!: MoveKeys;
  private playerView!: Phaser.GameObjects.Image;
  private aimView!: Phaser.GameObjects.Image;
  private overlay!: Phaser.GameObjects.Graphics;
  private enemyViews = new Map<number, Phaser.GameObjects.Image>();
  private projectileViews = new Map<number, Phaser.GameObjects.Image>();
  /** Heal orbs: a bright core plus a soft glow behind it. */
  private healOrbViews = new Map<number, Phaser.GameObjects.Image>();
  private healGlowViews = new Map<number, Phaser.GameObjects.Image>();
  private flashUntil = new Map<number, number>();
  private fire!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private flames!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Short-lived flame emitters that follow burning enemies. */
  private burning: { emitter: Phaser.GameObjects.Particles.ParticleEmitter; enemyId: number; msLeft: number }[] = [];
  private orbs: ManaOrb[] = [];
  /** Sparkle trail left by mana orbs on harder questions. */
  private orbSparkles!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super('game');
  }

  init(data: { match: Match }): void {
    this.match = data.match;
    this.enemyViews = new Map();
    this.projectileViews = new Map();
    this.healOrbViews = new Map();
    this.healGlowViews = new Map();
    this.flashUntil = new Map();
    this.burning = [];
    this.orbs = [];
  }

  create(): void {
    ensureTextures(this);
    this.add.image(0, 0, 'arena').setOrigin(0);

    const kb = this.input.keyboard!;
    // No capture: the answer field must still receive these letters when focused.
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT', false) as MoveKeys;
    // Space opens questions; capture it so it doesn't also "click" a focused button.
    kb.addCapture('SPACE');
    kb.on('keydown', (e: KeyboardEvent) => {
      if (!e.repeat) this.match.onKey(e.code);
    });
    // Pause keys use a plain DOM listener so they work immediately and regardless of Phaser's
    // keyboard state (P/Esc typed into the answer field never get here: it stops propagation).
    const onPauseKey = (e: KeyboardEvent) => {
      if (e.repeat || !PAUSE_KEYS.includes(e.code)) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      e.preventDefault();
      this.match.togglePause();
    };
    window.addEventListener('keydown', onPauseKey);
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', () => this.match.onArenaPointerDown());

    const p = this.match.world.player(LOCAL_PLAYER)!;
    this.playerView = this.add.image(p.x, p.y, 'circle').setTint(PLAYER_COLOR).setScale(p.radius / CIRCLE_RADIUS).setDepth(10);
    this.aimView = this.add.image(p.x, p.y, 'circle').setTint(0xffffff).setScale(4 / CIRCLE_RADIUS).setDepth(11);
    this.overlay = this.add.graphics().setDepth(20);
    this.createFireEmitters();
    this.orbSparkles = this.add
      .particles(0, 0, 'block', {
        emitting: false,
        lifespan: { min: 180, max: 340 },
        speed: { min: 0, max: 20 },
        scale: { start: block(3), end: block(1), ease: stepped(2) },
        alpha: { start: 0.9, end: 0 },
        tint: [0xc8f6ff, 0x7df9ff, 0xffe27a],
      })
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(13);

    this.events.once('shutdown', () => {
      kb.removeAllListeners('keydown');
      kb.removeAllKeys(true);
      kb.removeCapture('SPACE');
      kb.enabled = true;
      window.removeEventListener('keydown', onPauseKey);
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
        x: (this.keys.D.isDown || this.keys.RIGHT.isDown ? 1 : 0) - (this.keys.A.isDown || this.keys.LEFT.isDown ? 1 : 0),
        y: (this.keys.S.isDown || this.keys.DOWN.isDown ? 1 : 0) - (this.keys.W.isDown || this.keys.UP.isDown ? 1 : 0),
      };
    const events = this.match.update(Math.min(deltaMs / 1000, MAX_DT), {
      move,
      aim: Math.atan2(pointer.worldY - p.y, pointer.worldX - p.x),
      // Only presses that started on the arena cast: Phaser also tracks presses on page elements over
      // the canvas (the answer box, panels, buttons), and clicking those shouldn't fire a spell.
      casting: pointer.leftButtonDown() && pointer.downElement === this.game.canvas,
    });
    for (const e of events) this.handleEvent(e);
    // Effects (bursts, floating text) follow the game speed: frozen when paused, slow during slow motion.
    const effectSpeed = this.match.paused ? 0 : world.timeScale();
    this.tweens.timeScale = effectSpeed;
    for (const emitter of [this.fire, this.smoke, this.flames, this.orbSparkles]) emitter.timeScale = effectSpeed;
    this.updateBurning(effectSpeed, deltaMs);
    this.updateManaOrbs((deltaMs / 1000) * effectSpeed);
    this.render();
  }

  private handleEvent(e: SimEvent): void {
    const p = this.match.world.player(LOCAL_PLAYER)!;
    switch (e.type) {
      case 'enemyHit':
        this.flashUntil.set(e.enemyId, this.time.now + HIT_FLASH_MS);
        break;
      case 'healed':
        this.burst(e.x, e.y, HEAL_COLOR, 10);
        this.floatText(p.x, p.y - 30, `+${Math.round(e.amount)} HP`, '#ff5c5c');
        break;
      case 'enemyDied':
        this.burst(e.x, e.y, ENEMY_COLORS[e.kind], 10);
        break;
      case 'beam':
        this.beam(e.x1, e.y1, e.x2, e.y2, e.width, colorToInt(e.color));
        break;
      case 'explosion':
        this.explosion(e.x, e.y, e.radius, colorToInt(e.color));
        for (const t of e.targets) this.setAblaze(t.id, t.x, t.y, t.radius, e.x, e.y);
        break;
      case 'playerHit':
        this.cameras.main.shake(120, 0.006);
        break;
      case 'mana':
        if (e.amount > 0) {
          const intensity = this.questionIntensity(e.typeIndex);
          this.floatText(p.x, p.y - 30, `+${Math.round(e.amount)} mana`, intensity >= 0.75 ? '#ffe27a' : '#7df9ff');
          this.manaRestore(p.x, p.y, p.radius, e.amount, intensity);
        }
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
    // Heal orbs pulse gently, and flicker during their last 3 seconds.
    const pulse = 1 + 0.15 * Math.sin(this.time.now / 160);
    const orbAlpha = (orb: PickupState) => (orb.ttl < 3 && Math.floor(this.time.now / 120) % 2 === 0 ? 0.25 : 1);
    syncViews(this, this.healGlowViews, world.pickups, (orb, view, created) => {
      if (created) view.setTint(HEAL_GLOW_COLOR).setBlendMode(Phaser.BlendModes.ADD).setDepth(5);
      view.setPosition(orb.x, orb.y).setScale((orb.radius / CIRCLE_RADIUS) * pulse).setAlpha(0.45 * orbAlpha(orb));
    });
    syncViews(this, this.healOrbViews, world.pickups, (orb, view, created) => {
      if (created) view.setTint(HEAL_COLOR).setDepth(6);
      view.setPosition(orb.x, orb.y).setScale(((orb.radius * 0.5) / CIRCLE_RADIUS) * (0.85 + 0.15 * pulse)).setAlpha(orbAlpha(orb));
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
    if (p.alive && (p.stunRemaining > 0 || p.hitStunRemaining > 0)) {
      // Yellow ring for a wrong-answer stun, pink for a projectile hit-stun.
      const pulse = 4 + Math.sin(this.time.now / 80) * 2;
      const color = p.stunRemaining > 0 ? 0xffd166 : 0xff4d6d;
      g.lineStyle(3, color, 0.9).strokeCircle(p.x, p.y, p.radius + pulse + 4);
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

  /** A bright line that fades quickly: wide colored glow with a thin white core. */
  private beam(x1: number, y1: number, x2: number, y2: number, width: number, color: number): void {
    const g = this.add.graphics().setDepth(15).setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(width * 2.5, color, 0.35).lineBetween(x1, y1, x2, y2);
    g.lineStyle(width, color, 0.9).lineBetween(x1, y1, x2, y2);
    g.lineStyle(Math.max(1, width / 3), 0xffffff, 1).lineBetween(x1, y1, x2, y2);
    this.tweens.add({ targets: g, alpha: 0, duration: 220, ease: 'Quad.easeIn', onComplete: () => g.destroy() });
  }

  /** Expanding flash + ring the size of the blast radius. */
  private explosion(x: number, y: number, radius: number, color: number): void {
    const flash = this.add.image(x, y, 'circle').setTint(color).setAlpha(0.55).setScale(0.2).setBlendMode(Phaser.BlendModes.ADD).setDepth(15);
    const ring = this.add.image(x, y, 'ring').setTint(color).setAlpha(0.9).setScale(0.2).setDepth(15);
    const full = radius / CIRCLE_RADIUS;
    this.tweens.add({ targets: flash, scale: full, alpha: 0, duration: 280, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
    this.tweens.add({ targets: ring, scale: full, alpha: 0, duration: 330, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    // Fire flies outward from the impact point; speeds are sized so particles end up around
    // 0.7–1.5× the blast radius over their ~0.6s life.
    this.fire.setParticleSpeed(radius * 1.2, radius * 2.5);
    this.fire.setEmitterAngle({ min: 0, max: 360 });
    this.fire.explode(Math.round(28 + radius / 4), x, y);
    this.smoke.setEmitterAngle({ min: 0, max: 360 });
    this.smoke.explode(10, x, y);
    this.cameras.main.shake(90, 0.004);
  }

  /**
   * An enemy caught in a blast: a gout of flame thrown away from the impact, then the enemy keeps
   * burning (flames licking upward, following it) for a moment.
   */
  private setAblaze(enemyId: number, x: number, y: number, radius: number, fromX: number, fromY: number): void {
    const away = Phaser.Math.RadToDeg(Math.atan2(y - fromY, x - fromX));
    this.flames.setEmitterAngle({ min: away - 30, max: away + 30 });
    this.flames.setParticleSpeed(120, 260);
    this.flames.explode(16, x, y);

    const emitter = this.add
      .particles(x, y, 'block', {
        frequency: 50,
        quantity: 1,
        lifespan: { min: 300, max: 560 },
        speed: { min: 10, max: 40 },
        angle: { min: 245, max: 295 }, // mostly upward
        // Spawn across the top of the body so flames lick up off it and the enemy stays visible.
        x: { min: -radius * 0.7, max: radius * 0.7 },
        y: { min: -radius * 0.9, max: -radius * 0.2 },
        scale: { start: block(Math.max(4, radius * 0.5)), end: block(2), ease: stepped(3) },
        tint: steppedColors(FLAME_COLORS),
        gravityY: -160,
      })
      .setDepth(16);
    this.burning.push({ emitter, enemyId, msLeft: BURN_MS });
  }

  /**
   * Mana restore (like Minecraft XP orbs): a burst of light, then orbs pop out around the player,
   * spiral around them in a rising vortex, and stream into the mana bar.
   */
  /**
   * How "hard" a question type is, 0 (easiest) to 1 (hardest), ranked by mana reward so it works
   * for any number/order of types.
   */
  private questionIntensity(typeIndex: number): number {
    const rewards = [...new Set(this.match.world.cfg.questionTypes.map((t) => t.manaReward))].sort((a, b) => a - b);
    const reward = this.match.world.cfg.questionTypes[typeIndex]?.manaReward;
    if (reward === undefined || rewards.length < 2) return 0;
    return rewards.indexOf(reward) / (rewards.length - 1);
  }

  /**
   * Mana restore (like Minecraft XP orbs), scaled by `intensity` (0 = easy … 1 = hardest):
   * harder questions get more and bigger orbs, a bigger burst, extra rings, a pillar of light,
   * sparkle trails, gold/violet orbs and a double-helix vortex.
   */
  private manaRestore(x: number, y: number, playerRadius: number, amount: number, intensity: number): void {
    // Burst of light (bigger for harder questions) plus one ring per tier.
    const flash = this.add.image(x, y, 'circle').setTint(0x7df9ff).setAlpha(0.6).setScale(0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(11);
    this.tweens.add({ targets: flash, scale: (70 * (1 + intensity)) / CIRCLE_RADIUS, alpha: 0, duration: 380 + 200 * intensity, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
    const rings = 1 + Math.round(intensity * 2);
    for (let i = 0; i < rings; i++) {
      const ring = this.add.image(x, y, 'ring').setTint(i === 2 ? 0xffe27a : 0xc8f6ff).setAlpha(0.9).setScale(0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(11);
      this.tweens.add({
        targets: ring,
        scale: ((85 + 45 * i) * (1 + 0.5 * intensity)) / CIRCLE_RADIUS,
        alpha: 0,
        delay: i * 90,
        duration: 450 + 100 * i,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy(),
      });
    }
    if (intensity >= 0.5) this.lightPillar(x, y, intensity);
    if (intensity >= 0.75) {
      this.cameras.main.flash(180, 120, 200, 255);
      this.cameras.main.shake(160, 0.004);
    }

    const count = Phaser.Math.Clamp(Math.round((4 + amount / 3) * (1 + intensity)), 6, 44);
    const colors = intensity >= 0.75 ? [...MANA_ORB_COLORS, ...RARE_ORB_COLORS] : MANA_ORB_COLORS;
    const helix = intensity >= 0.75; // alternate orbs spin the other way: two interleaved streams
    for (let i = 0; i < count; i++) {
      const img = this.add.image(x, y, 'circle').setBlendMode(Phaser.BlendModes.ADD).setScale(0).setDepth(12);
      const halo = this.add.image(x, y, 'circle').setBlendMode(Phaser.BlendModes.ADD).setTint(0x4d9dff).setScale(0).setDepth(12);
      const spin = 8.5 + Math.random() * 3;
      this.orbs.push({
        img,
        halo,
        colors,
        size: ORB_SIZE * (1 + 0.35 * intensity),
        rise: ORB_RISE * (1 + 1.5 * intensity),
        trail: intensity >= 0.5,
        age: -i * (0.03 - 0.012 * intensity), // stagger so they stream rather than move in lockstep
        theta: (i / count) * Math.PI * 2 + Math.random() * 0.6,
        omega: helix && i % 2 === 1 ? -spin : spin,
        radius: playerRadius + 28 + Math.random() * 30 + 20 * intensity,
        minRadius: playerRadius + 4 + Math.random() * 6,
        seed: Math.random() * 100,
      });
    }
  }

  /** A column of light shooting up from the player (medium/hard questions). */
  private lightPillar(x: number, y: number, intensity: number): void {
    const height = 260 + 200 * intensity;
    const color = intensity >= 0.75 ? 0xffe9a0 : 0x9fe8ff;
    const pillar = this.add
      .image(x, y + 10, 'block')
      .setOrigin(0.5, 1)
      .setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.55)
      .setDisplaySize(26 + 14 * intensity, 0)
      .setDepth(11);
    const core = this.add
      .image(x, y + 10, 'block')
      .setOrigin(0.5, 1)
      .setTint(0xffffff)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.8)
      .setDisplaySize(6 + 4 * intensity, 0)
      .setDepth(11);
    for (const img of [pillar, core]) {
      this.tweens.chain({
        targets: img,
        tweens: [
          { displayHeight: height, duration: 140, ease: 'Cubic.easeOut' },
          { displayWidth: 0, alpha: 0, duration: 420 + 150 * intensity, ease: 'Quad.easeIn' },
        ],
        onComplete: () => img.destroy(),
      });
    }
  }

  /** Advance mana orbs along their pop → vortex → mana-bar path. `dt` is game seconds. */
  private updateManaOrbs(dt: number): void {
    if (this.orbs.length === 0) return;
    const p = this.match.world.player(LOCAL_PLAYER)!;
    const target = this.screenToWorld(this.match.manaBarTarget());
    this.orbs = this.orbs.filter((orb) => {
      orb.age += dt;
      const { img } = orb;
      if (orb.age < 0) return true;
      const twinkle = 0.75 + 0.25 * Math.sin(orb.age * 30 + orb.seed);
      img.setTint(orb.colors[Math.floor(orb.age * 12 + orb.seed) % orb.colors.length]);
      const size = orb.size / CIRCLE_RADIUS;
      if (orb.trail && Math.random() < 0.5) this.orbSparkles.emitParticleAt(img.x, img.y, 1);
      // Keep the halo glued to the orb, slightly larger and fainter.
      const syncHalo = () =>
        orb.halo
          .setPosition(img.x, img.y)
          .setDepth(img.depth - 0.5)
          .setScale(img.scale * (ORB_HALO / ORB_SIZE))
          .setAlpha(img.alpha * 0.3);

      // Position on the rising vortex at spiral progress s (0..1): an ellipse around the player.
      const orbit = (s: number) => {
        const spin = orb.theta + orb.omega * s * ORB_SPIRAL * (1 + s); // speeds up as it rises
        // Tighten gradually (smoothstep) from the wide starting ring to just outside the player.
        const tighten = s * s * (3 - 2 * s);
        const r = orb.radius + (orb.minRadius - orb.radius) * tighten;
        const h = orb.rise * Math.pow(s, 1.3);
        return { x: p.x + r * Math.cos(spin), y: p.y - h + r * ORBIT_SQUASH * Math.sin(spin), depthSin: Math.sin(spin) };
      };

      if (orb.age < ORB_APPEAR) {
        // Pop out from the player to its spot on the orbit.
        const u = Phaser.Math.Easing.Back.Out(orb.age / ORB_APPEAR);
        const start = orbit(0);
        img.setPosition(p.x + (start.x - p.x) * u, p.y + (start.y - p.y) * u);
        img.setScale(size * Math.min(1, u)).setAlpha(twinkle).setDepth(12);
        syncHalo();
        return true;
      }
      if (orb.age < ORB_APPEAR + ORB_SPIRAL) {
        const pos = orbit((orb.age - ORB_APPEAR) / ORB_SPIRAL);
        // Far side of the ellipse is "behind" the player: drawn underneath, smaller and dimmer.
        const behind = pos.depthSin < 0;
        img
          .setPosition(pos.x, pos.y)
          .setDepth(behind ? 9 : 12)
          .setScale(size * (1 + 0.3 * pos.depthSin))
          .setAlpha(twinkle * (behind ? 0.55 : 1));
        syncHalo();
        return true;
      }
      // Fly into the mana bar.
      if (!orb.flyFrom) {
        const end = orbit(1);
        orb.flyFrom = { x: end.x, y: end.y };
      }
      const f = Math.min(1, (orb.age - ORB_APPEAR - ORB_SPIRAL) / ORB_FLY);
      const e = Phaser.Math.Easing.Cubic.In(f);
      const arc = Math.sin(f * Math.PI) * 40; // slight upward arc
      img
        .setPosition(orb.flyFrom.x + (target.x - orb.flyFrom.x) * e, orb.flyFrom.y + (target.y - orb.flyFrom.y) * e - arc)
        .setDepth(30)
        .setScale(size * (1 - 0.35 * f))
        .setAlpha(twinkle);
      syncHalo();
      if (f >= 1) {
        img.destroy();
        orb.halo.destroy();
        this.match.manaOrbAbsorbed();
        return false;
      }
      return true;
    });
  }

  /** Convert page (client) coordinates to game world coordinates. */
  private screenToWorld(point: { x: number; y: number }): { x: number; y: number } {
    const rect = this.game.canvas.getBoundingClientRect();
    return {
      x: ((point.x - rect.left) / rect.width) * this.scale.width,
      y: ((point.y - rect.top) / rect.height) * this.scale.height,
    };
  }

  /** Move burning emitters with their enemies; stop them when the burn ends or the enemy dies. */
  private updateBurning(effectSpeed: number, deltaMs: number): void {
    this.burning = this.burning.filter((b) => {
      b.emitter.timeScale = effectSpeed;
      b.msLeft -= deltaMs * effectSpeed; // game time: frozen when paused, slow in slow motion
      const view = this.enemyViews.get(b.enemyId);
      if (view) b.emitter.setPosition(view.x, view.y);
      if (!view || b.msLeft <= 0) {
        // Let the remaining flames finish, then clean up.
        b.emitter.stop();
        b.emitter.once('complete', () => b.emitter.destroy());
        return false;
      }
      return true;
    });
  }

  /**
   * Blocky, retro-style fire: solid square particles (no rotation, no glow blending) whose
   * color, size and fade all change in hard steps rather than smoothly.
   */
  private createFireEmitters(): void {
    this.fire = this.add
      .particles(0, 0, 'block', {
        emitting: false,
        lifespan: { min: 430, max: 720 },
        speed: { min: 80, max: 200 },
        scale: { start: block(12), end: block(4), ease: stepped(4) },
        tint: steppedColors(FIRE_COLORS),
        gravityY: -90, // hot air rises
      })
      .setDepth(16);
    this.smoke = this.add
      .particles(0, 0, 'block', {
        emitting: false,
        lifespan: { min: 700, max: 1200 },
        speed: { min: 20, max: 90 },
        scale: { start: block(8), end: block(16), ease: stepped(3) },
        alpha: { start: 0.5, end: 0, ease: stepped(3) },
        tint: 0x3a302c,
        gravityY: -50,
      })
      .setDepth(14);
    this.flames = this.add
      .particles(0, 0, 'block', {
        emitting: false,
        lifespan: { min: 300, max: 600 },
        speed: { min: 40, max: 160 },
        scale: { start: block(8), end: block(2), ease: stepped(3) },
        tint: steppedColors(FLAME_COLORS),
        gravityY: -220, // flames lick upward
      })
      .setDepth(16);
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
      .text(this.scale.width / 2, this.scale.height * 0.2, text, {
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
