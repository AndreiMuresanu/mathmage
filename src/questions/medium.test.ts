import { evaluate } from 'mathjs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../config/gameConfig';
import { createRng } from '../util/rng';
import { checkAnswer } from './answerCheck';
import {
  averages,
  bigMultiplication,
  fractions,
  generateMedium,
  linearEquation,
  orderOfOperations,
  percentage,
  powersAndRoots,
  quadraticRoots,
} from './sources/medium';
import type { Question } from './types';

/** Convert the LaTeX we generate into a mathjs expression. */
function texToMath(tex: string): string {
  return tex
    .replace(/\$/g, '')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '(($1)/($2))')
    .replace(/\\sqrt\[3\]\{([^}]*)\}/g, 'cbrt($1)')
    .replace(/\\sqrt\{([^}]*)\}/g, 'sqrt($1)')
    .replace(/\^\{([^}]*)\}/g, '^($1)')
    .replace(/\\times/g, '*')
    .replace(/(\d)x/g, '$1*x');
}

function value(q: Question): number {
  if (q.answer.kind !== 'numeric') throw new Error(`${q.id}: expected numeric`);
  return q.answer.value;
}

function many(gen: (rng: ReturnType<typeof createRng>) => Question, n = 300): Question[] {
  const rng = createRng(99);
  return Array.from({ length: n }, () => gen(rng));
}

/** The last $...$ / $$...$$ segment of a prompt (the equation or expression). */
const mathPart = (prompt: string) => [...prompt.matchAll(/\$\$?([^$]+)\$\$?/g)].at(-1)![1];

describe('medium generators', () => {
  it('linear equations: the answer satisfies the equation', () => {
    for (const q of many(linearEquation)) {
      const [lhs, rhs] = mathPart(q.prompt).split('=').map(texToMath);
      const x = value(q);
      expect(evaluate(lhs, { x }), q.prompt).toBeCloseTo(evaluate(rhs, { x }), 9);
      expect(Number.isInteger(x)).toBe(true);
    }
  });

  it('quadratics: the answer is the larger root', () => {
    for (const q of many(quadraticRoots)) {
      const lhs = texToMath(mathPart(q.prompt).split('=')[0]);
      const x = value(q);
      expect(evaluate(lhs, { x }), q.prompt).toBeCloseTo(0, 9);
      // No larger integer root in range.
      for (let y = x + 1; y <= 10; y++) expect(evaluate(lhs, { x: y })).not.toBeCloseTo(0, 9);
    }
  });

  it('expression questions evaluate to their answer', () => {
    for (const gen of [powersAndRoots, fractions, bigMultiplication, orderOfOperations]) {
      for (const q of many(gen)) {
        expect(evaluate(texToMath(mathPart(q.prompt))), q.prompt).toBeCloseTo(value(q), 9);
      }
    }
  });

  it('fraction answers are shown in lowest terms and accepted in equivalent forms', () => {
    for (const q of many(fractions)) {
      if (q.answer.kind !== 'numeric') throw new Error();
      const [n, d] = q.answer.display.split('/').map(Number);
      if (d !== undefined) {
        let a = Math.abs(n);
        let b = d;
        while (b) [a, b] = [b, a % b];
        expect(a, q.answer.display).toBe(1);
        expect(checkAnswer(q.answer, `${n * 2}/${d * 2}`)).toBe('correct');
      }
      expect(checkAnswer(q.answer, q.answer.display)).toBe('correct');
    }
  });

  it('percentages have whole-number answers that match the prompt', () => {
    for (const q of many(percentage)) {
      const nums = q.prompt.match(/\d+/g)!.map(Number);
      const v = value(q);
      expect(Number.isInteger(v)).toBe(true);
      if (q.prompt.startsWith('What is')) expect(v).toBeCloseTo((nums[0] * nums[1]) / 100, 9);
      else expect((nums[1] * v) / 100).toBeCloseTo(nums[0], 9);
    }
  });

  it('averages match the listed numbers', () => {
    for (const q of many(averages)) {
      const v = value(q);
      if (q.prompt.startsWith('What is the mean')) {
        const nums = q.prompt.split('of ')[1].match(/\d+/g)!.map(Number);
        expect(nums.reduce((s, x) => s + x, 0) / nums.length).toBe(v);
      } else {
        const [n, mean, , ...known] = q.prompt.match(/\d+/g)!.map(Number);
        expect(known.reduce((s, x) => s + x, 0) + v).toBe(n * mean);
        expect(v).toBeGreaterThan(0);
      }
    }
  });

  it('only draws from enabled kinds, and every question has steps', () => {
    const rng = createRng(5);
    const cfg = { ...DEFAULT_CONFIG.medium, percentages: false, fractions: false, averages: false, quadraticRoots: false, linearEquations: false, bigMultiplication: false, orderOfOperations: false };
    for (let i = 0; i < 50; i++) expect(generateMedium(cfg, rng).id).toMatch(/^med:(sq|sqrt|pow2|pow3|cbrt):/);
    for (let i = 0; i < 300; i++) expect(generateMedium(DEFAULT_CONFIG.medium, rng).steps?.length).toBeGreaterThan(0);
  });
});
