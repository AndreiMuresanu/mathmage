import { answerDisplay, type Question } from '../questions/types';
import { h } from './dom';
import { renderRich } from './markup';

/** Shown while stunned after a wrong answer: countdown, correct answer, and worked solution. */
export class StunPanel {
  readonly el: HTMLDivElement;
  private countdown = h('div.stun-countdown');
  private timerFill = h('div.stun-timer-fill');
  private body = h('div.stun-body');
  private total = 1;

  constructor() {
    this.el = h(
      'div.stun.panel.translucent.hidden',
      {},
      h('div.stun-timer', {}, this.timerFill),
      this.countdown,
      h('div.stun-title', {}, 'Wrong answer!'),
      this.body,
    );
  }

  show(question: Question, given: string, seconds: number, showSolution: boolean): void {
    this.total = Math.max(seconds, 0.001);
    const parts: string[] = [];
    if (showSolution) {
      parts.push(`<div class="stun-section"><div class="label">Question</div>${renderRich(question.prompt)}</div>`);
      if (given) parts.push(`<div class="stun-given">You answered: <code>${escape(given)}</code></div>`);
      parts.push(
        `<div class="stun-section"><div class="label">Correct answer</div><div class="stun-answer">${renderRich(answerDisplay(question.answer))}</div></div>`,
      );
      if (question.solution) parts.push(`<div class="stun-section"><div class="label">Solution</div>${renderRich(question.solution)}</div>`);
      if (question.steps?.length) {
        parts.push(
          `<div class="stun-section"><div class="label">Steps</div><ol>${question.steps.map((s) => `<li>${renderRich(s)}</li>`).join('')}</ol></div>`,
        );
      }
    }
    this.body.innerHTML = parts.join('');
    this.update(seconds);
    this.el.classList.remove('hidden');
  }

  /** Call every frame with the remaining stun time; hides itself when it reaches 0. */
  update(remaining: number): void {
    if (remaining <= 0) {
      this.el.classList.add('hidden');
      return;
    }
    this.countdown.textContent = `Stunned · ${remaining.toFixed(1)}s`;
    this.timerFill.style.width = `${(100 * remaining) / this.total}%`;
  }

  get visible(): boolean {
    return !this.el.classList.contains('hidden');
  }
}

function escape(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
