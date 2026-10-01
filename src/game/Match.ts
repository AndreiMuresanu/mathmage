import type { GameConfig } from '../config/gameConfig';
import type { QuestionRegistry } from '../questions/registry';
import type { PlayerIntent, SimEvent } from '../sim/types';
import { World } from '../sim/world';
import { createRng } from '../util/rng';
import { createGameOverScreen } from '../ui/GameOverScreen';
import { Hud } from '../ui/Hud';
import { QuestionWindow } from '../ui/QuestionWindow';
import { StunPanel } from '../ui/StunPanel';

export const LOCAL_PLAYER = 'local';

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
  private stun = new StunPanel();
  private layer: HTMLDivElement;
  private callbacks: MatchCallbacks;
  private gameOverShown = false;

  constructor(cfg: GameConfig, registry: QuestionRegistry, root: HTMLElement, callbacks: MatchCallbacks) {
    this.world = new World(cfg);
    this.callbacks = callbacks;
    registry.setArithmeticConfig(() => cfg.arithmetic);
    const questionRng = createRng();
    this.hud = new Hud(cfg);
    this.questions = new QuestionWindow({
      slots: cfg.questionSlots,
      draw: (slot) => registry.nextFor(cfg.questionSlots[slot].sources, questionRng),
      onResult: (slot, question, correct, given) => {
        this.world.answerQuestion(LOCAL_PLAYER, slot, correct);
        if (!correct) {
          this.stun.show(question, given, cfg.questionSlots[slot].stunSeconds, cfg.stun.showSolution);
        }
      },
      onFocusChange: (focused) => callbacks.onTypingChange(focused),
    });
    this.layer = document.createElement('div');
    this.layer.className = 'match-layer';
    this.layer.append(this.hud.el, this.questions.el, this.stun.el);
    root.append(this.layer);
  }

  /** Keyboard action from the scene (never called while the answer field is focused). */
  onKey(code: string): void {
    if (this.world.over) return;
    const digit = /^Digit([1-9])$/.exec(code);
    if (digit) {
      this.world.selectSpell(LOCAL_PLAYER, Number(digit[1]) - 1);
      return;
    }
    if (code === 'Escape') {
      this.questions.close();
      return;
    }
    const slot = this.world.cfg.questionSlots.findIndex((s) => s.key === code);
    if (slot >= 0 && this.world.canAnswer(LOCAL_PLAYER)) this.questions.toggle(slot);
  }

  /** Clicking the arena hands control back to the game. */
  onArenaPointerDown(): void {
    this.questions.blurInput();
  }

  get typing(): boolean {
    return this.questions.inputFocused;
  }

  update(dt: number, intent: PlayerIntent): SimEvent[] {
    this.world.step(dt, { [LOCAL_PLAYER]: intent });
    const events = this.world.drainEvents();
    for (const e of events) {
      if (e.type === 'mana' && e.amount > 0) this.hud.showManaGain(Math.round(e.amount));
      if (e.type === 'noMana') this.hud.showNoMana();
      if (e.type === 'stunned') this.questions.close();
      if (e.type === 'gameOver') this.showGameOver();
    }
    const p = this.world.player(LOCAL_PLAYER)!;
    if (this.stun.visible) this.stun.update(p.stunRemaining);
    this.hud.update(this.world, LOCAL_PLAYER);
    return events;
  }

  private showGameOver(): void {
    if (this.gameOverShown) return;
    this.gameOverShown = true;
    this.questions.close();
    this.stun.update(0);
    this.layer.append(
      createGameOverScreen(this.world, {
        playAgain: () => this.callbacks.playAgain(),
        menu: () => this.callbacks.exitToMenu(),
      }),
    );
  }

  destroy(): void {
    this.questions.blurInput();
    this.layer.remove();
  }
}
