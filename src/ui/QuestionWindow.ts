import type { QuestionTypeConfig } from '../config/gameConfig';
import { checkAnswer } from '../questions/answerCheck';
import type { Question } from '../questions/types';
import { h } from './dom';
import { renderRich } from './markup';

export interface DrawnQuestion {
  typeIndex: number;
  question: Question;
}

export interface QuestionWindowDeps {
  types: QuestionTypeConfig[];
  /** Draw a fresh question: a weighted-random type, then a question of that type. */
  draw(): DrawnQuestion | undefined;
  /** Called after an answer is judged (or time runs out); `given` is what the player typed. */
  onResult(typeIndex: number, question: Question, correct: boolean, given: string, timedOut: boolean): void;
  /** The game should stop reading keys while the answer field has focus. */
  onFocusChange(focused: boolean): void;
}

/**
 * Translucent question panel. The answer field only receives keys once clicked; while focused,
 * every key goes to it (Enter submits, Esc closes). An unanswered question is kept when the
 * window closes, so closing and reopening can't be used to reroll for an easier type.
 */
export class QuestionWindow {
  readonly el: HTMLDivElement;
  private deps: QuestionWindowDeps;
  private title = h('div.qwin-title');
  private reward = h('div.qwin-reward');
  private timer = h('div.qwin-timer');
  private timerFill = h('div.qwin-timer-fill');
  private timerBar = h('div.qwin-timer-bar', {}, this.timerFill);
  private prompt = h('div.qwin-prompt');
  private message = h('div.qwin-message');
  private input = h('input.qwin-input', {
    type: 'text',
    autocomplete: 'off',
    spellcheck: false,
    placeholder: 'Click here to type your answer',
  });
  private current: DrawnQuestion | undefined;
  /** Seconds left on the current question (Infinity = no limit). */
  private timeLeft = Infinity;
  private timeTotal = Infinity;
  private open = false;

  constructor(deps: QuestionWindowDeps) {
    this.deps = deps;
    this.el = h(
      'div.qwin.panel.translucent.hidden',
      {},
      h('div.qwin-header', {}, this.title, this.timer, this.reward),
      this.timerBar,
      this.prompt,
      this.message,
      this.input,
      h('div.qwin-footer', {}, 'Enter: submit · Esc / Space: close'),
    );
    this.input.addEventListener('focus', () => deps.onFocusChange(true));
    this.input.addEventListener('blur', () => deps.onFocusChange(false));
    this.input.addEventListener('keydown', (e) => {
      // Keep keys away from the game while typing.
      e.stopPropagation();
      if (e.key === 'Enter') this.submit();
      else if (e.key === 'Backspace') {
        // Clear the whole answer at once — faster than deleting characters mid-fight.
        e.preventDefault();
        this.input.value = '';
      }
      else if (e.key === 'Escape') this.close();
    });
  }

  get isOpen(): boolean {
    return this.open;
  }

  get inputFocused(): boolean {
    return document.activeElement === this.input;
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(): void {
    this.open = true;
    if (!this.current) this.drawNext();
    this.render();
    this.el.classList.remove('hidden');
  }

  close(): void {
    if (this.inputFocused) this.input.blur();
    this.open = false;
    this.el.classList.add('hidden');
  }

  /** Hide (without closing) while the game is paused; the current question is kept. */
  setSuspended(suspended: boolean): void {
    if (suspended) this.blurInput();
    this.el.classList.toggle('suspended', suspended);
  }

  /** Seconds left on an unanswered question (shown in the HUD while the window is closed). */
  get pendingTimeLeft(): number | undefined {
    return this.current && !this.open && Number.isFinite(this.timeLeft) ? this.timeLeft : undefined;
  }

  /** Advance the question clock (call every unpaused frame, window open or not). */
  tick(dt: number): void {
    const drawn = this.current;
    if (!drawn || !Number.isFinite(this.timeLeft)) return;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.current = undefined;
      const given = this.open ? this.input.value : '';
      this.close();
      this.deps.onResult(drawn.typeIndex, drawn.question, false, given, true);
      return;
    }
    if (this.open) this.renderTimer();
  }

  private drawNext(): void {
    this.current = this.deps.draw();
    const limit = this.current ? this.deps.types[this.current.typeIndex].timeLimit : 0;
    this.timeTotal = this.timeLeft = limit > 0 ? limit : Infinity;
  }

  private renderTimer(): void {
    const limited = Number.isFinite(this.timeLeft);
    this.timer.textContent = limited ? `${Math.ceil(this.timeLeft)}s` : '';
    this.timerBar.classList.toggle('hidden', !limited);
    if (!limited) return;
    this.timerFill.style.width = `${(100 * this.timeLeft) / this.timeTotal}%`;
    const urgent = this.timeLeft <= 10;
    this.timer.classList.toggle('urgent', urgent);
    this.timerBar.classList.toggle('urgent', urgent);
  }

  blurInput(): void {
    if (this.inputFocused) this.input.blur();
  }

  private render(): void {
    const drawn = this.current;
    const type = drawn && this.deps.types[drawn.typeIndex];
    this.title.textContent = type ? type.label : 'Question';
    this.title.dataset.tier = String(drawn?.typeIndex ?? 0);
    this.reward.textContent = type ? `+${type.manaReward} mana` : '';
    this.prompt.innerHTML = drawn
      ? renderRich(drawn.question.prompt)
      : '<em>No question sources available. Pick some in Configure match → Question types.</em>';
    this.input.value = '';
    this.input.disabled = !drawn;
    this.setMessage('');
    this.renderTimer();
  }

  private setMessage(text: string, kind: 'info' | 'good' | 'bad' = 'info'): void {
    this.message.textContent = text;
    this.message.className = `qwin-message ${kind}`;
  }

  private submit(): void {
    const drawn = this.current;
    if (!this.open || !drawn) return;
    const { typeIndex, question } = drawn;
    const result = checkAnswer(question.answer, this.input.value);
    if (result === 'invalid') {
      this.setMessage(
        question.answer.kind === 'numeric' ? "Couldn't read that as a number. Try e.g. 12, 3/2, sqrt(2), pi/4." : 'Type an answer first.',
      );
      return;
    }
    const correct = result === 'correct';
    this.current = undefined;
    this.timeLeft = Infinity;
    this.deps.onResult(typeIndex, question, correct, this.input.value, false);
    if (correct && this.deps.types[typeIndex].autoNextOnCorrect && this.open) {
      this.drawNext();
      this.render();
      // Hand the keyboard back to the game so the player can move right away.
      this.blurInput();
      this.setMessage('Correct!', 'good');
      this.el.classList.remove('correct-flash');
      void this.el.offsetWidth;
      this.el.classList.add('correct-flash');
    } else {
      this.close();
    }
  }
}
