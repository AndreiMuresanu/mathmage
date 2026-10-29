import type { Rng } from '../../util/rng';
import { pickNear } from '../near';
import { DEFAULT_DIFFICULTY } from '../rating';
import type { Deck, Question, QuestionSource } from '../types';

/** Cards shown this recently aren't repeated (capped at half the deck so small decks still work). */
const RECENT_LIMIT = 30;

/**
 * Draws cards from a deck. `next` cycles through every card before repeating; `nextNear` picks a
 * card rated near the target, avoiding recently shown ones. Cards without a `difficulty` count as
 * DEFAULT_DIFFICULTY.
 */
export function createDeckSource(deck: Deck, description: string, skill: string): QuestionSource {
  let bag: Question[] = [];
  let last: Question | undefined;
  const recent: string[] = [];
  const remember = (q: Question) => {
    recent.push(q.id);
    while (recent.length > Math.min(RECENT_LIMIT, Math.floor(deck.questions.length / 2))) recent.shift();
    return q;
  };
  const rated = (q: Question): Question => (q.difficulty === undefined ? { ...q, difficulty: DEFAULT_DIFFICULTY } : q);
  const empty = (): Question => ({
    id: `${deck.id}:empty`,
    prompt: `The deck **${deck.name}** has no cards.`,
    answer: { kind: 'text', accepted: ['ok'] },
    difficulty: DEFAULT_DIFFICULTY,
  });
  return {
    id: `deck:${deck.id}`,
    name: deck.name,
    description,
    skill,
    next(rng: Rng) {
      if (deck.questions.length === 0) return empty();
      if (bag.length === 0) {
        bag = [...deck.questions];
        // Fisher–Yates shuffle; avoid repeating the previous card across reshuffles.
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(rng.next() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        if (bag.length > 1 && bag[bag.length - 1] === last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      }
      last = bag.pop()!;
      return rated(remember(last));
    },
    nextNear(rng: Rng, target: number, spread: number) {
      if (deck.questions.length === 0) return empty();
      const fresh = deck.questions.filter((q) => !recent.includes(q.id));
      const pool = fresh.length ? fresh : deck.questions;
      const card = pickNear(rng, pool, (q) => q.difficulty ?? DEFAULT_DIFFICULTY, target, spread)!;
      return rated(remember(card));
    },
  };
}
