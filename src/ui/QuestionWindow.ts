import type { QuestionSlotConfig } from '../config/gameConfig';
import { checkAnswer } from '../questions/answerCheck';
import type { Question } from '../questions/types';
import { h, keyLabel } from './dom';
import { renderRich } from './markup';

export interface QuestionWindowDeps {
  slots: QuestionSlotConfig[];
  /** Draw a fresh question for a slot (undefined if the slot has no usable sources). */
  draw(slotIndex: number): Question | undefined;
  /** Called after an answer is judged; `given` is what the player typed. */
  onResult(slotIndex: number, question: Question, correct: boolean, given: string): void;
  /** The game should stop reading keys while the answer field has focus. */
  onFocusChange(focused: boolean): void;
}

/**
 * Translucent question panel. The answer field only receives keys once clicked; while focused,
 * every key goes to it (Enter submits, Esc closes). Each slot keeps its unanswered question.
 */
export class QuestionWindow {
  readonly el: HTMLDivElement;
  private deps: QuestionWindowDeps;
  private title = h('div.qwin-title');
  private reward = h('div.qwin-reward');
  private prompt = h('div.qwin-prompt');
  private message = h('div.qwin-message');
  private input = h('input.qwin-input', {
    type: 'text',
    autocomplete: 'off',
    spellcheck: false,
    placeholder: 'Click here to type your answer',
  });
  private current: (Question | undefined)[];
  private openSlot: number | null = null;

  constructor(deps: QuestionWindowDeps) {
    this.deps = deps;
    this.current = deps.slots.map(() => undefined);
    this.el = h(
      'div.qwin.panel.translucent.hidden',
      {},
      h('div.qwin-header', {}, this.title, this.reward),
      this.prompt,
      this.message,
      this.input,
      h('div.qwin-footer', {}, 'Enter: submit · Esc: close'),
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
    return this.openSlot !== null;
  }

  get inputFocused(): boolean {
    return document.activeElement === this.input;
  }

  toggle(slotIndex: number): void {
    if (this.openSlot === slotIndex) this.close();
    else this.open(slotIndex);
  }

  open(slotIndex: number): void {
    const slot = this.deps.slots[slotIndex];
    if (!slot) return;
    this.openSlot = slotIndex;
    this.current[slotIndex] ??= this.deps.draw(slotIndex);
    this.title.innerHTML = `<span class="key">${keyLabel(slot.key)}</span> ${slot.label}`;
    this.reward.textContent = `+${slot.manaReward} mana`;
    this.render();
    this.el.classList.remove('hidden');
  }

  close(): void {
    if (this.inputFocused) this.input.blur();
    this.openSlot = null;
    this.el.classList.add('hidden');
  }

  blurInput(): void {
    if (this.inputFocused) this.input.blur();
  }

  private render(): void {
    const q = this.openSlot === null ? undefined : this.current[this.openSlot];
    this.prompt.innerHTML = q
      ? renderRich(q.prompt)
      : '<em>No question sources available for this slot. Pick some in Configure match.</em>';
    this.input.value = '';
    this.input.disabled = !q;
    this.setMessage('');
  }

  private setMessage(text: string, kind: 'info' | 'good' | 'bad' = 'info'): void {
    this.message.textContent = text;
    this.message.className = `qwin-message ${kind}`;
  }

  private submit(): void {
    if (this.openSlot === null) return;
    const slotIndex = this.openSlot;
    const question = this.current[slotIndex];
    if (!question) return;
    const result = checkAnswer(question.answer, this.input.value);
    if (result === 'invalid') {
      this.setMessage(
        question.answer.kind === 'numeric' ? "Couldn't read that as a number. Try e.g. 12, 3/2, sqrt(2), pi/4." : 'Type an answer first.',
      );
      return;
    }
    const correct = result === 'correct';
    this.current[slotIndex] = undefined;
    this.deps.onResult(slotIndex, question, correct, this.input.value);
    if (correct && this.deps.slots[slotIndex].autoNextOnCorrect && this.openSlot === slotIndex) {
      this.current[slotIndex] = this.deps.draw(slotIndex);
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
