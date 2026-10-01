import { create, all } from 'mathjs';
import type { AnswerSpec } from './types';

// Sandboxed evaluator, following the mathjs security guidance: keep a reference to evaluate,
// then disable functions that could alter the instance or parse arbitrary code.
const math = create(all);
const limitedEvaluate = math.evaluate;
const disabled = () => {
  throw new Error('disabled');
};
math.import(
  { import: disabled, createUnit: disabled, evaluate: disabled, parse: disabled, simplify: disabled, derivative: disabled },
  { override: true },
);

export type CheckResult = 'correct' | 'wrong' | 'invalid';

const DEFAULT_TOLERANCE = 1e-6;

/** Turn typed math into something mathjs understands: unicode symbols, thousands separators. */
function normalizeMathInput(input: string): string {
  return input
    .trim()
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/√\s*(\d+(?:\.\d+)?|[a-z]+)/gi, 'sqrt($1)')
    .replace(/√/g, 'sqrt')
    .replace(/π/g, 'pi')
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
}

/** Evaluate a numeric answer string. Returns undefined if it isn't a finite real number. */
export function parseNumber(input: string): number | undefined {
  const text = normalizeMathInput(input);
  if (!text) return undefined;
  try {
    const result = limitedEvaluate(text, {});
    const value = typeof result === 'number' ? result : Number(result?.valueOf?.());
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function numbersMatch(actual: number, expected: number, tolerance = DEFAULT_TOLERANCE): boolean {
  return Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected));
}

export function normalizeText(text: string, caseSensitive = false): string {
  const collapsed = text
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^["'](.*)["']$/, '$1');
  return caseSensitive ? collapsed : collapsed.toLowerCase();
}

/** 'invalid' means the input couldn't be understood (e.g. a typo) — the player isn't penalized. */
export function checkAnswer(spec: AnswerSpec, input: string): CheckResult {
  if (!input.trim()) return 'invalid';
  switch (spec.kind) {
    case 'numeric': {
      const value = parseNumber(input);
      if (value === undefined) return 'invalid';
      return numbersMatch(value, spec.value, spec.tolerance) ? 'correct' : 'wrong';
    }
    case 'text': {
      const given = normalizeText(input, spec.caseSensitive);
      return spec.accepted.some((a) => normalizeText(a, spec.caseSensitive) === given) ? 'correct' : 'wrong';
    }
    case 'choice': {
      const index = Number.parseInt(input, 10) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= spec.options.length) return 'invalid';
      return index === spec.correct ? 'correct' : 'wrong';
    }
    case 'symbolic':
      // TODO: symbolic equivalence (compare by evaluating at random points).
      return 'invalid';
  }
}
