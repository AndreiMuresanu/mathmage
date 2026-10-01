import type { Rng } from '../../util/rng';
import type { Deck, Question, QuestionSource } from '../types';

/** Draws questions from a deck without repeats until every card has been seen, then reshuffles. */
export function createDeckSource(deck: Deck, description: string): QuestionSource {
  let bag: Question[] = [];
  let last: Question | undefined;
  return {
    id: `deck:${deck.id}`,
    name: deck.name,
    description,
    next(rng: Rng) {
      if (deck.questions.length === 0) {
        return {
          id: `${deck.id}:empty`,
          prompt: `The deck **${deck.name}** has no cards.`,
          answer: { kind: 'text', accepted: ['ok'] },
        };
      }
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
      return last;
    },
  };
}
