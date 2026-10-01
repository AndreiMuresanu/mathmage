import { parseNumber } from '../answerCheck';
import type { AnswerSpec } from '../types';

const MATH_WORDS = /(?<![a-z])(sqrt|cbrt|pi|e|log|ln|exp|sin|cos|tan)(?![a-z])/gi;

/**
 * Decide how a raw answer string should be checked. It is numeric only if it contains a digit
 * (or pi/sqrt), has no letters besides a few math function names, and evaluates to a number.
 * A lone "e" stays text, since flashcard answers are often single letters. Everything else
 * is text, with alternatives separated by `|` or `;`.
 */
export function inferAnswer(raw: string): AnswerSpec {
  const trimmed = raw.trim();
  const lettersLeft = trimmed.replace(MATH_WORDS, '');
  const numberish = /[\dπ√]/.test(trimmed) || /(?<![a-z])(pi|sqrt)(?![a-z])/i.test(trimmed);
  if (numberish && !/[a-z]/i.test(lettersLeft)) {
    const value = parseNumber(trimmed);
    if (value !== undefined) return { kind: 'numeric', value, display: trimmed };
  }
  const accepted = trimmed
    .split(/[|;]/)
    .map((a) => a.trim())
    .filter(Boolean);
  return { kind: 'text', accepted: accepted.length ? accepted : [trimmed] };
}
