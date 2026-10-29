import type { GameConfig } from '../config/gameConfig';
import { DEFAULT_DIFFICULTY, SkillRatings, type AnswerResult } from '../questions/rating';
import type { QuestionRegistry } from '../questions/registry';
import type { PlayerIntent, SimEvent } from '../sim/types';
import { World } from '../sim/world';
import { createRng } from '../util/rng';
import { createGameOverScreen } from '../ui/GameOverScreen';
import { Hud } from '../ui/Hud';
import { QuestionWindow } from '../ui/QuestionWindow';
import { h } from '../ui/dom';
import { StunPanel } from '../ui/StunPanel';

export const LOCAL_PLAYER = 'local';
/** Opens / closes the question window. */
export const QUESTION_KEY = 'Space';
/** Pause / resume. */
export const PAUSE_KEYS = ['KeyP', 'Escape'];

export interface MatchCallbacks {
  /** The answer field gained/lost focus: the scene should stop/resume reading game keys. */
  onTypingChange(typing: boolean): void;
  playAgain(): void;
  exitToMenu(): void;
}

/**
 * One survival match: owns the sim World and the in-game DOM UI, and routes input actions
 * between them. The Phaser scene drives update() and renders world state.
 */
export class Match {
  readonly world: World;
  private hud: Hud;
  private questions: QuestionWindow;
  private stun = new StunPanel(() => this.togglePause());
  private pauseOverlay: HTMLDivElement;
  private layer: HTMLDivElement;
  private callbacks: MatchCallbacks;
  private gameOverShown = false;
  private _paused = false;
  /** The player's skill ratings; they start fresh every match and recalibrate from answers. */
  readonly ratings: SkillRatings;
  private registry: QuestionRegistry;

  constructor(cfg: GameConfig, registry: QuestionRegistry, root: HTMLElement, callbacks: MatchCallbacks) {
    this.world = new World(cfg);
    this.callbacks = callbacks;
    this.registry = registry;
    this.ratings = new SkillRatings(cfg.adaptive);
    registry.setConfig(() => cfg);
    const questionRng = createRng();
    this.hud = new Hud(cfg);
    this.questions = new QuestionWindow({
      types: cfg.questionTypes,
      draw: () => registry.drawQuestion(cfg.questionTypes, cfg.questionSources, this.ratings, questionRng, cfg.adaptive.spread),
      onResult: (drawn, correct, given, outcome, elapsed) => {
        const { typeIndex, question } = drawn;
        // Rating update (only while the player can still answer, i.e. the answer actually counts).
        if (this.world.canAnswer(LOCAL_PLAYER)) {
          const result: AnswerResult = outcome === 'answered' ? (correct ? 'correct' : 'wrong') : outcome;
          const change = this.ratings.record(
            drawn.skill,
            question.difficulty ?? DEFAULT_DIFFICULTY,
            result,
            elapsed,
            cfg.questionTypes[typeIndex].timeLimit,
          );
          this.hud.showRating(registry.skillName(change.skill), change.after, change.after - change.before);
        }
        const stunMultiplier = outcome === 'skipped' ? cfg.stun.skipStunMultiplier : 1;
        this.world.answerQuestion(LOCAL_PLAYER, typeIndex, correct, stunMultiplier);
        if (!correct) {
          this.stun.show(question, given, cfg.questionTypes[typeIndex].stunSeconds * stunMultiplier, cfg.stun.showSolution, cfg.stun.autoRevealSolution, outcome);
        }
      },
      onFocusChange: (focused) => callbacks.onTypingChange(focused),
      onEscape: () => this.setPaused(true),
    });
    this.pauseOverlay = h(
      'div.pause-overlay.hidden',
      {},
      h(
        'div.pause-banner.panel',
        {},
        h('h2', {}, 'Paused'),
        h(
          'div.button-row',
          {},
          h('button.primary', { onclick: () => this.setPaused(false) }, 'Resume (P / Esc)'),
          h('button', { onclick: () => callbacks.exitToMenu() }, 'Main menu'),
        ),
      ),
    );
    this.layer = document.createElement('div');
    this.layer.className = 'match-layer';
    // The stun panel sits above the pause overlay so the solution stays readable while paused.
    this.layer.append(this.hud.el, this.questions.el, this.pauseOverlay, this.stun.el);
    root.append(this.layer);
    const start = this.ratings.get('math');
    this.hud.showRating('Math', start.rating, 0);
  }

  /** Keyboard action from the scene (never called while the answer field is focused). */
  onKey(code: string): void {
    if (this.world.over) return;
    // Pause keys are handled directly by the scene's DOM listener.
    if (PAUSE_KEYS.includes(code) || this._paused) return;
    const digit = /^Digit([1-9])$/.exec(code);
    if (digit) {
      this.world.selectSpell(LOCAL_PLAYER, Number(digit[1]) - 1);
      return;
    }
    if (code === QUESTION_KEY && this.world.canAnswer(LOCAL_PLAYER)) this.questions.toggle();
  }

  /** Clicking the arena hands control back to the game. */
  onArenaPointerDown(): void {
    this.questions.blurInput();
  }

  get paused(): boolean {
    return this._paused;
  }

  togglePause(): void {
    this.setPaused(!this._paused);
  }

  setPaused(paused: boolean): void {
    if (this.world.over || paused === this._paused) return;
    this._paused = paused;
    this.questions.setSuspended(paused);
    this.stun.setPaused(paused);
    this.pauseOverlay.classList.toggle('hidden', !paused);
  }

  /** Screen coordinates of the end of the mana bar's fill (target for mana orbs). */
  manaBarTarget(): { x: number; y: number } {
    return this.hud.manaFillEnd();
  }

  /** A mana orb reached the bar. */
  manaOrbAbsorbed(): void {
    this.hud.pulseMana();
  }

  get typing(): boolean {
    return this.questions.inputFocused;
  }

  update(dt: number, intent: PlayerIntent): SimEvent[] {
    if (this._paused) return [];
    this.world.step(dt, { [LOCAL_PLAYER]: intent });
    // The question clock runs in real time (not slow motion), whether or not the window is open.
    if (!this.world.over) this.questions.tick(dt);
    const events = this.world.drainEvents();
    for (const e of events) {
      if (e.type === 'mana' && e.amount > 0) this.hud.showManaGain(Math.round(e.amount));
      if (e.type === 'noMana') this.hud.showNoMana();
      if (e.type === 'stunned') this.questions.close();
      if (e.type === 'gameOver') this.showGameOver();
    }
    const p = this.world.player(LOCAL_PLAYER)!;
    if (this.stun.visible) this.stun.update(p.stunRemaining);
    this.hud.update(this.world, LOCAL_PLAYER, this.questions.pendingTimeLeft);
    return events;
  }

  private showGameOver(): void {
    if (this.gameOverShown) return;
    this.gameOverShown = true;
    this.questions.close();
    this.stun.update(0);
    this.layer.append(
      createGameOverScreen(
        this.world,
        {
          playAgain: () => this.callbacks.playAgain(),
          menu: () => this.callbacks.exitToMenu(),
        },
        this.ratings.all().map(([skill, r]) => ({ name: this.registry.skillName(skill), ...r })),
      ),
    );
  }

  destroy(): void {
    this.questions.blurInput();
    this.layer.remove();
  }
}
