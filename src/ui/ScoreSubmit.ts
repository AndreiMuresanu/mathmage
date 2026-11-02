import { leaderboardEnabled, savedPlayerName, savePlayerName, submitScore } from '../online/leaderboard';
import { NAME_MAX_LENGTH, type SubmitScoreRequest, type SubmitScoreResponse } from '../online/leaderboardTypes';
import { h } from './dom';

/**
 * "Submit to leaderboard" box for the game-over screen of a ranked solo run: a name field
 * (remembering the last name used), Submit and Skip, then the resulting ranks.
 */
export function createScoreSubmit(score: Omit<SubmitScoreRequest, 'players'> & { elo: number }, onViewLeaderboard: () => void): HTMLElement {
  const box = h('div.score-submit');
  if (!leaderboardEnabled) {
    box.append(h('p.muted', {}, 'The leaderboard is offline.'));
    return box;
  }
  const input = h('input.name-input', { type: 'text', maxLength: NAME_MAX_LENGTH, placeholder: 'Your name', value: savedPlayerName() });
  const submit = h('button.primary', { type: 'button' }, 'Submit');
  const skip = h('button', { type: 'button' }, 'Skip');
  const message = h('p.score-submit-message');

  const send = async () => {
    const name = input.value.trim();
    if (!name) {
      message.textContent = 'Enter a name first.';
      input.focus();
      return;
    }
    submit.disabled = skip.disabled = input.disabled = true;
    message.textContent = 'Submitting…';
    try {
      const result = await submitScore({ ...score, players: [{ name, elo: score.elo }] });
      savePlayerName(name);
      box.replaceChildren(
        h('p.score-submit-done', {}, `Submitted! ${rankText(result)}`),
        h('button', { type: 'button', onclick: onViewLeaderboard }, 'View leaderboard'),
      );
    } catch (e) {
      message.textContent = (e as Error).message;
      submit.disabled = skip.disabled = input.disabled = false;
    }
  };
  submit.addEventListener('click', send);
  skip.addEventListener('click', () => box.replaceChildren(h('p.muted', {}, 'Not submitted.')));
  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // keep Space/P/Esc etc. away from the game's key handlers
    if (e.key === 'Enter') void send();
  });

  box.append(h('h3', {}, 'Submit to leaderboard'), h('div.button-row', {}, input, submit, skip), message);
  return box;
}

function rankText(r: SubmitScoreResponse): string {
  const part = (rank: number | null, by: string) => (rank ? `#${rank} by ${by}` : `not in the top 1000 by ${by}`);
  return `${part(r.rankByWave, 'wave')} · ${part(r.rankByElo, 'ELO')}`;
}
