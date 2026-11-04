import { leaderboardEnabled, savedPlayerName, savePlayerName, submitScore } from '../online/leaderboard';
import { NAME_MAX_LENGTH, type SubmitScoreRequest, type SubmitScoreResponse } from '../online/leaderboardTypes';
import type { TeamScoring } from '../game/drivers';
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

/**
 * Ranked co-op game-over box. The host sees every player's name and peak ELO (as they arrive),
 * submits one team entry, and shares the result; other players see the outcome.
 */
export function createTeamScoreSubmit(
  team: TeamScoring,
  score: Omit<SubmitScoreRequest, 'players'> & { fallbackElo: number },
  onViewLeaderboard: () => void,
): HTMLElement {
  const box = h('div.score-submit');
  if (!leaderboardEnabled) {
    box.append(h('p.muted', {}, 'The leaderboard is offline.'));
    return box;
  }
  const done = (text: string) =>
    box.replaceChildren(h('p.score-submit-done', {}, text), h('button', { type: 'button', onclick: onViewLeaderboard }, 'View leaderboard'));

  if (!team.isHost) {
    box.append(h('h3', {}, 'Team score'), h('p.muted', {}, 'Waiting for the host to submit the team score…'));
    team.onSubmitted = (msg) => {
      if (msg.result) done(`Submitted by the host! ${rankText(msg.result)}`);
      else box.replaceChildren(h('p.muted', {}, msg.error ?? 'The host chose not to submit this run.'));
    };
    return box;
  }

  const list = h('ul.team-scores');
  const submit = h('button.primary', { type: 'button', disabled: true }, 'Submit');
  const skip = h('button', { type: 'button' }, 'Skip');
  const message = h('p.score-submit-message', {}, 'Collecting everyone’s scores…');
  let waited = false;
  const render = () => {
    list.replaceChildren(
      ...team.players.map((p) => {
        const elo = team.peaks.get(p.id);
        return h('li', {}, h('strong', {}, p.name), ` — ${elo === undefined ? '…' : `${Math.round(elo)} ELO`}`);
      }),
    );
    const all = team.players.every((p) => team.peaks.has(p.id));
    submit.disabled = !(all || waited);
    if (all || waited) message.textContent = all ? '' : 'Some players didn’t report a score; they count as the starting rating.';
  };
  team.onPeaksChanged = render;
  // Don't wait forever for someone who disconnected.
  setTimeout(() => {
    waited = true;
    render();
  }, 3000);
  render();

  submit.addEventListener('click', async () => {
    submit.disabled = skip.disabled = true;
    message.textContent = 'Submitting…';
    const players = team.players.map((p) => ({ name: p.name, elo: Math.round(team.peaks.get(p.id) ?? score.fallbackElo) }));
    const { fallbackElo: _unused, ...request } = score;
    try {
      const result = await submitScore({ ...request, players });
      team.broadcastSubmitted({ result });
      done(`Submitted! ${rankText(result)}`);
    } catch (e) {
      message.textContent = (e as Error).message;
      submit.disabled = skip.disabled = false;
    }
  });
  skip.addEventListener('click', () => {
    team.broadcastSubmitted({ result: null });
    box.replaceChildren(h('p.muted', {}, 'Not submitted.'));
  });

  box.append(h('h3', {}, 'Submit team score'), list, h('div.button-row', {}, submit, skip), message);
  return box;
}
