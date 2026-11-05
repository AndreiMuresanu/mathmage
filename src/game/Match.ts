import type { GameConfig } from '../config/gameConfig';
import { DEFAULT_DIFFICULTY, SkillRatings, type AnswerResult } from '../questions/rating';
import type { QuestionRegistry } from '../questions/registry';
import type { PlayerIntent, SimEvent } from '../sim/types';
import type { World } from '../sim/world';
import { BackgroundTicker } from './backgroundTicker';
import type { MatchDriver } from './drivers';
import { setupLabel, type MatchSetup } from './matchSetup';
import { configHash } from '../online/configHash';
import { GAME_VERSION } from '../online/leaderboard';
import { createScoreSubmit, createTeamScoreSubmit } from '../ui/ScoreSubmit';
import { createRng } from '../util/rng';
import { createGameOverScreen } from '../ui/GameOverScreen';
import { Hud } from '../ui/Hud';
import { QuestionWindow } from '../ui/QuestionWindow';
import { h } from '../ui/dom';
import { StunPanel } from '../ui/StunPanel';

/** Opens / closes the question window. */
export const QUESTION_KEY = 'Space';
/** Pause / resume. */
export const PAUSE_KEYS = ['KeyP', 'Escape'];
/** Clients show "Waiting for the host…" after this long without an update. */
const HOST_SILENT_MS = 1500;
/** Longest step the background ticker takes at once (bigger gaps are split into these). */
const BACKGROUND_STEP = 1 / 30;
const IDLE_INTENT: PlayerIntent = { move: { x: 0, y: 0 }, aim: 0, casting: false };

export interface MatchCallbacks {
  /** The answer field gained/lost focus: the scene should stop/resume reading game keys. */
  onTypingChange(typing: boolean): void;
  /** Solo: start the same setup again. Multiplayer: go back to the game room. */
  playAgain(): void;
  /** Solo: main menu. Multiplayer: leave the room. */
  exitToMenu(): void;
  viewLeaderboard(): void;
}

/**
 * One survival match: owns the in-game DOM UI and routes input to the World through a driver
 * (solo, multiplayer host, or multiplayer client). The Phaser scene drives update() and renders
 * world state.
 */
export class Match {
  readonly driver: MatchDriver;
  private hud: Hud;
  /** Spell the local player has selected (sent with every intent). */
  private spell = 0;
  private resumeButton: HTMLButtonElement;
  private pauseTitle: HTMLHeadingElement;
  /** Host only: keeps the match running while this tab is hidden (the render loop stops then). */
  private ticker = new BackgroundTicker();
  private lastBackgroundTick = 0;
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

  /** Mode, ranked/custom and map this match was started with. */
  readonly setup: MatchSetup;

  constructor(cfg: GameConfig, setup: MatchSetup, registry: QuestionRegistry, root: HTMLElement, callbacks: MatchCallbacks, driver: MatchDriver) {
    this.driver = driver;
    this.setup = setup;
    driver.onRemotePause = (paused) => this.applyPause(paused);
    this.callbacks = callbacks;
    this.registry = registry;
    this.ratings = new SkillRatings(cfg.adaptive);
    registry.setConfig(() => cfg);
    const questionRng = createRng();
    this.hud = new Hud(cfg);
    this.questions = new QuestionWindow({
      types: cfg.questionTypes,
      draw: () => registry.drawQuestion(cfg.questionTypes, cfg.questionSources, this.ratings, questionRng, cfg.adaptive.spread, cfg.adaptive.mentalMathWeight),
      onResult: (drawn, correct, given, outcome, elapsed) => {
        const { typeIndex, question } = drawn;
        // Rating update (only while the player can still answer, i.e. the answer actually counts).
        if (this.world.canAnswer(this.localId)) {
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
        this.driver.answer(typeIndex, correct, stunMultiplier);
        if (!correct) {
          this.stun.show(question, given, cfg.questionTypes[typeIndex].stunSeconds * stunMultiplier, cfg.stun.showSolution, cfg.stun.autoRevealSolution, outcome);
        }
      },
      onFocusChange: (focused) => callbacks.onTypingChange(focused),
      onEscape: () => this.setPaused(true),
    });
    this.resumeButton = h('button.primary', { onclick: () => this.setPaused(false) }, 'Resume (P / Esc)');
    this.pauseTitle = h('h2', {}, 'Paused');
    this.pauseOverlay = h(
      'div.pause-overlay.hidden',
      {},
      h(
        'div.pause-banner.panel',
        {},
        this.pauseTitle,
        h(
          'div.button-row',
          {},
          this.resumeButton,
          h('button', { onclick: () => callbacks.exitToMenu() }, driver.multiplayer ? 'Leave game' : 'Main menu'),
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
    if (driver.multiplayer) {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      if (driver.canPause) this.hud.toast("You're hosting: keep this game open so it runs for everyone.", 4000);
    }
  }

  /**
   * Multiplayer: when the tab is hidden the browser stops drawing it, which would freeze the
   * host's match for everyone. The host keeps simulating from a background ticker (standing
   * still); a client tells the host it has stopped moving and casting.
   */
  private onVisibilityChange = (): void => {
    if (!document.hidden) {
      this.ticker.stop();
      return;
    }
    if (this.driver.canPause) {
      this.lastBackgroundTick = performance.now();
      this.ticker.start(() => this.backgroundTick());
    } else {
      this.driver.step(0, { ...IDLE_INTENT, spell: this.spell });
    }
  };

  private backgroundTick(): void {
    const now = performance.now();
    let dt = Math.min(0.25, (now - this.lastBackgroundTick) / 1000);
    this.lastBackgroundTick = now;
    while (dt > 1e-6) {
      const step = Math.min(dt, BACKGROUND_STEP);
      this.update(step, IDLE_INTENT, true);
      dt -= step;
    }
  }

  get world(): World {
    return this.driver.world;
  }

  /** Id of the player this machine controls. */
  get localId(): string {
    return this.driver.localId;
  }

  /** Keyboard action from the scene (never called while the answer field is focused). */
  onKey(code: string): void {
    if (this.world.over) return;
    // Pause keys are handled directly by the scene's DOM listener.
    if (PAUSE_KEYS.includes(code) || this._paused) return;
    const digit = /^Digit([1-9])$/.exec(code);
    if (digit) {
      const index = Number(digit[1]) - 1;
      if (index < this.world.cfg.spells.length) this.spell = index;
      return;
    }
    if (code === QUESTION_KEY && this.world.canAnswer(this.localId)) this.questions.toggle();
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

  /** The local player asked to (un)pause. In multiplayer only the host can, and it pauses everyone. */
  setPaused(paused: boolean): void {
    if (this.world.over || paused === this._paused) return;
    if (!this.driver.canPause) {
      this.hud.toast('Only the host can pause');
      return;
    }
    this.applyPause(paused);
    this.driver.setPaused(paused);
  }

  private applyPause(paused: boolean): void {
    if (this.world.over || paused === this._paused) return;
    this._paused = paused;
    this.questions.setSuspended(paused);
    this.stun.setPaused(paused);
    this.pauseOverlay.classList.toggle('hidden', !paused);
    // Clients can't resume a pause the host started.
    this.resumeButton.hidden = !this.driver.canPause;
    this.pauseTitle.textContent = this.driver.canPause ? 'Paused' : 'Paused by the host';
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

  /**
   * Advance the match. The scene calls this every frame; while the host's tab is hidden the
   * background ticker calls it instead (`background`), and stray frame calls are ignored.
   */
  update(dt: number, intent: PlayerIntent, background = false): SimEvent[] {
    if (this.ticker.running && !background) return [];
    if (this._paused) return [];
    const events = this.driver.step(dt, { ...intent, spell: this.spell });
    // The question clock runs in real time (not slow motion), whether or not the window is open.
    if (!this.world.over) this.questions.tick(dt);
    for (const e of events) {
      const mine = 'playerId' in e && e.playerId === this.localId;
      if (e.type === 'mana' && mine && e.amount > 0) this.hud.showManaGain(Math.round(e.amount));
      if (e.type === 'noMana' && mine) this.hud.showNoMana();
      if (e.type === 'stunned' && mine) this.questions.close();
      if (e.type === 'playerDied' && mine) {
        // Downed (co-op: until a teammate revives you): no questions, no solution panel.
        this.questions.close();
        this.stun.update(0);
      }
      if (e.type === 'gameOver') this.showGameOver();
    }
    if (this.driver.hostSilentMs) this.hud.setWaitingForHost(!this.world.over && this.driver.hostSilentMs() > HOST_SILENT_MS);
    if (this.driver.pingMs) this.hud.setPing(this.driver.pingMs(), this.driver.canPause);
    const p = this.world.player(this.localId);
    if (p && this.stun.visible) this.stun.update(p.stunRemaining);
    this.hud.update(this.world, this.localId, this.questions.pendingTimeLeft);
    return events;
  }

  private showGameOver(): void {
    if (this.gameOverShown) return;
    this.gameOverShown = true;
    this.questions.close();
    this.stun.update(0);
    const multiplayer = this.driver.multiplayer;
    this.layer.append(
      createGameOverScreen(
        this.world,
        {
          playAgain: () => this.callbacks.playAgain(),
          menu: () => this.callbacks.exitToMenu(),
          playAgainLabel: multiplayer ? 'Back to room' : 'Play again',
          menuLabel: multiplayer ? 'Leave' : 'Main menu',
        },
        this.ratings.all().map(([skill, r]) => ({ name: this.registry.skillName(skill), ...r })),
        `${setupLabel(this.setup)} · ${this.world.map.name}`,
        this.leaderboardSection(),
        this.world.player(this.localId)?.questionStats,
      ),
    );
  }

  /** This player's best rating this match (the start rating if no questions were answered). */
  private peakElo(): number {
    const peaks = this.ratings.all().map(([, r]) => r.peak);
    return peaks.length ? Math.max(...peaks) : this.world.cfg.adaptive.startRating;
  }

  /** Ranked: the submit box (solo) or the team submission (co-op). Custom: a note that it isn't ranked. */
  private leaderboardSection(): HTMLElement | null {
    if (!this.setup.ranked) return h('p.muted', {}, 'Custom game: not ranked.');
    const elo = this.peakElo();
    if (this.setup.mode === 'coop' && this.driver.team) {
      this.driver.team.sendPeak(elo);
      return createTeamScoreSubmit(
        this.driver.team,
        {
          map: this.world.map.id,
          mode: 'coop',
          wave: this.world.wave.round,
          version: GAME_VERSION,
          configHash: configHash(this.world.cfg),
          fallbackElo: this.world.cfg.adaptive.startRating,
        },
        () => this.callbacks.viewLeaderboard(),
      );
    }
    if (this.setup.mode !== 'solo') return null;
    return createScoreSubmit(
      {
        map: this.world.map.id,
        mode: 'solo',
        wave: this.world.wave.round,
        elo,
        version: GAME_VERSION,
        configHash: configHash(this.world.cfg),
      },
      () => this.callbacks.viewLeaderboard(),
    );
  }

  destroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.ticker.stop();
    this.driver.dispose();
    this.questions.blurInput();
    this.layer.remove();
  }
}
