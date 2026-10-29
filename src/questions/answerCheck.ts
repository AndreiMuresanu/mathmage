import { create, all } from 'mathjs';
import { createRng } from '../util/rng';
import type { AnswerSpec } from './types';

// Sandboxed evaluator, following the mathjs security guidance: keep a reference to evaluate,
// then disable functions that could alter the instance or parse arbitrary code.
const math = create(all);
const limitedEvaluate = math.evaluate;
const disabled = () => {
  throw new Error('disabled');
};
math.import(
  { ln: math.log, arcsin: math.asin, arccos: math.acos, arctan: math.atan, import: disabled, createUnit: disabled, evaluate: disabled, parse: disabled, simplify: disabled, derivative: disabled },
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

/** Evaluate already-normalized input. Throws on unreadable input; undefined if not a finite real. */
function evaluateReal(text: string, scope: Record<string, number>): number | undefined {
  const result = limitedEvaluate(text, scope);
  const value = typeof result === 'number' ? result : Number(result?.valueOf?.());
  return Number.isFinite(value) ? value : undefined;
}

/** Evaluate a numeric answer string. Returns undefined if it isn't a finite real number. */
export function parseNumber(input: string): number | undefined {
  const text = normalizeMathInput(input);
  if (!text) return undefined;
  try {
    return evaluateReal(text, {});
  } catch {
    return undefined;
  }
}

const KNOWN_WORDS = new Set(['sqrt', 'cbrt', 'ln', 'log', 'log2', 'log10', 'exp', 'abs', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'arcsin', 'arccos', 'arctan', 'pi', 'e']);

/**
 * Prepare an expression answer: drop a leading "x =", and split runs of single-letter
 * variables so "uf" or "BP" mean u·f and B·P (mathjs would read them as one unknown name).
 */
function normalizeExpression(input: string, variables: string[]): string {
  return normalizeMathInput(input)
    .replace(/^[a-z]\s*=(?!=)/i, '')
    .replace(/[a-z][a-z0-9]*/gi, (word) =>
      !KNOWN_WORDS.has(word) && [...word].every((ch) => variables.includes(ch)) ? [...word].join('*') : word,
    );
}

const SAMPLE_POINTS = 6;

/** Compare an expression answer with the expected one at sample points of its variables. */
function checkSymbolic(spec: Extract<AnswerSpec, { kind: 'symbolic' }>, input: string): CheckResult {
  const text = normalizeExpression(input, spec.variables);
  if (!text.trim()) return 'invalid';
  const rng = createRng(0x5eed);
  let compared = 0;
  for (let attempt = 0; attempt < 200 && compared < SAMPLE_POINTS; attempt++) {
    const scope: Record<string, number> = {};
    for (const v of spec.variables) {
      const [lo, hi] = spec.ranges?.[v] ?? [0.5, 3.5];
      scope[v] = lo + rng.next() * (hi - lo);
    }
    let expected: number | undefined;
    try {
      expected = evaluateReal(spec.expr, scope);
    } catch {
      expected = undefined;
    }
    // Skip points outside the expected expression's domain or next to one of its poles.
    if (expected === undefined || Math.abs(expected) > 1e6) continue;
    let actual: number | undefined;
    try {
      actual = evaluateReal(text, { ...scope });
    } catch {
      return 'invalid';
    }
    if (actual === undefined || !numbersMatch(actual, expected)) return 'wrong';
    compared++;
  }
  return compared ? 'correct' : 'invalid';
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
      return checkSymbolic(spec, input);
  }
}
