import type { Rng } from '../util/rng';

export type AnswerSpec =
  /** Checked by evaluating the player's input (fractions, sqrt, pi, ^ allowed). */
  | { kind: 'numeric'; value: number; tolerance?: number; display: string }
  /** Checked by normalized string comparison against any accepted alternative. */
  | { kind: 'text'; accepted: string[]; caseSensitive?: boolean }
  /** Not yet supported by the UI. */
  | { kind: 'choice'; options: string[]; correct: number }
  /**
   * An expression in `variables` (mathjs syntax), checked by evaluating the player's input and
   * `expr` at sample points drawn from `ranges` (default [0.5, 3.5] per variable).
   */
  | { kind: 'symbolic'; expr: string; variables: string[]; ranges?: Record<string, [number, number]>; display?: string };

export interface Question {
  id: string;
  /** Plain text with $inline$ / $$display$$ LaTeX and **bold**. */
  prompt: string;
  answer: AnswerSpec;
  solution?: string;
  steps?: string[];
  tags?: string[];
  /** Elo-style rating (see questions/rating.ts): ~100 = 1 + 1, ~2000 = AMC-level. */
  difficulty?: number;
}

export interface QuestionSource {
  id: string;
  name: string;
  /** Short description for the config screen. */
  description: string;
  /**
   * Which player rating answers count toward: "math" for all built-in math content, or the
   * deck's own skill for imported flashcards (being good at Spanish says nothing about math).
   */
  skill: string;
  next(rng: Rng): Question;
  /**
   * A question whose `difficulty` is close to `target` (within roughly `spread` rating points).
   * Sources without this are sampled: several `next()` questions, keeping the closest.
   */
  nextNear?(rng: Rng, target: number, spread: number): Question;
}

export interface Deck {
  id: string;
  name: string;
  questions: Question[];
}

export function answerDisplay(answer: AnswerSpec): string {
  switch (answer.kind) {
    case 'numeric':
      return answer.display;
    case 'text':
      return answer.accepted.join(' / ');
    case 'choice':
      return answer.options[answer.correct];
    case 'symbolic':
      return answer.display ?? answer.expr;
  }
}
