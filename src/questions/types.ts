import type { Rng } from '../util/rng';

export type AnswerSpec =
  /** Checked by evaluating the player's input (fractions, sqrt, pi, ^ allowed). */
  | { kind: 'numeric'; value: number; tolerance?: number; display: string }
  /** Checked by normalized string comparison against any accepted alternative. */
  | { kind: 'text'; accepted: string[]; caseSensitive?: boolean }
  /** Not yet supported by the UI. */
  | { kind: 'choice'; options: string[]; correct: number }
  /** Not yet supported by the UI. */
  | { kind: 'symbolic'; expr: string; variables: string[] };

export interface Question {
  id: string;
  /** Plain text with $inline$ / $$display$$ LaTeX and **bold**. */
  prompt: string;
  answer: AnswerSpec;
  solution?: string;
  steps?: string[];
  tags?: string[];
  difficulty?: number;
}

export interface QuestionSource {
  id: string;
  name: string;
  /** Short description for the config screen. */
  description: string;
  next(rng: Rng): Question;
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
      return answer.expr;
  }
}
