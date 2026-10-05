import { answerDisplay, type Question } from '../questions/types';
import { h } from './dom';
import { renderRich } from './markup';

/** Shown while stunned after a wrong answer: countdown, correct answer, and worked solution. */
export class StunPanel {
  readonly el: HTMLDivElement;
  private countdown = h('div.stun-countdown');
  private timerFill = h('div.stun-timer-fill');
  private body = h('div.stun-body');
  private title = h('div.stun-title', {}, 'Wrong answer!');
  private pauseButton = h('button.small.stun-pause', { textContent: 'Pause (P)' });
  private total = 1;

  constructor(onPauseClick: () => void) {
    this.pauseButton.addEventListener('click', () => {
      // Don't keep focus, or Space/Enter would re-trigger the button.
      this.pauseButton.blur();
      onPauseClick();
    });
    this.el = h(
      'div.stun.panel.translucent.hidden',
      {},
      h('div.stun-timer', {}, this.timerFill),
      h('div.stun-header', {}, h('span'), this.countdown, this.pauseButton),
      this.title,
      this.body,
    );
  }

  setPaused(paused: boolean): void {
    this.pauseButton.textContent = paused ? 'Resume (P)' : 'Pause (P)';
  }

  /**
   * @param showSolution whether the solution is available at all
   * @param autoReveal show it immediately instead of behind a "Show solution" button
   * @param timedOut the player ran out of time rather than answering wrong
   */
  show(question: Question, given: string, seconds: number, showSolution: boolean, autoReveal: boolean, timedOut = false): void {
    this.total = Math.max(seconds, 0.001);
    this.title.textContent = timedOut ? "Time's up!" : 'Wrong answer!';
    this.body.replaceChildren();
    if (showSolution) {
      const intro: string[] = [`<div class="stun-section"><div class="label">Question</div>${renderRich(question.prompt)}</div>`];
      if (given) intro.push(`<div class="stun-given">You answered: <code>${escape(given)}</code></div>`);

      const parts: string[] = [
        `<div class="stun-section"><div class="label">Correct answer</div><div class="stun-answer">${renderRich(answerDisplay(question.answer))}</div></div>`,
      ];
      if (question.solution) parts.push(`<div class="stun-section"><div class="label">Solution</div>${renderRich(question.solution)}</div>`);
      if (question.steps?.length) {
        parts.push(
          `<div class="stun-section"><div class="label">Steps</div><ol>${question.steps.map((s) => `<li>${renderRich(s)}</li>`).join('')}</ol></div>`,
        );
      }

      const solution = h('div.stun-solution', { innerHTML: parts.join('') });
      const reveal = h('button.stun-reveal', { textContent: 'Show solution' });
      reveal.addEventListener('click', () => {
        reveal.replaceWith(solution);
      });
      this.body.append(h('div', { innerHTML: intro.join('') }), autoReveal ? solution : reveal);
    }
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
