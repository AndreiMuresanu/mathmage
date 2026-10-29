import katex from 'katex';
import { compile } from 'mathjs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type AlgebraTricksConfig } from '../config/gameConfig';
import { createRng } from '../util/rng';
import { checkAnswer } from './answerCheck';
import type { AnswerSpec } from './types';
import { buildTrick, TRICK_TEMPLATES, type Built } from './sources/algebra_tricks';

type Scope = Record<string, number>;

function real(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function evalAt(expr: string, scope: Scope): number | undefined {
  try {
    return real(compile(expr).evaluate({ ...scope }));
  } catch {
    return undefined;
  }
}

/** Both sides of an equation; `holds` is true when they agree to relative precision. */
function equation(eq: string) {
  const [lhs, rhs] = eq.split('=').map((side) => compile(side));
  const sides = (scope: Scope) => {
    try {
      return [real(lhs.evaluate({ ...scope })), real(rhs.evaluate({ ...scope }))] as const;
    } catch {
      return [undefined, undefined] as const;
    }
  };
  const diff = (scope: Scope) => {
    const [l, r] = sides(scope);
    return l === undefined || r === undefined ? undefined : l - r;
  };
  const holds = (scope: Scope, tol = 1e-7) => {
    const [l, r] = sides(scope);
    return l !== undefined && r !== undefined && Math.abs(l - r) <= tol * Math.max(1, Math.abs(l), Math.abs(r));
  };
  return { diff, holds };
}

/** Real roots of eq(x) in [lo, hi] found by sign changes on a grid, refined by bisection. */
function scanRoots(eq: ReturnType<typeof equation>, lo: number, hi: number, points = 2000): number[] {
  const found: number[] = [];
  const f = (x: number) => eq.diff({ x });
  let prevX = lo;
  let prev = f(lo);
  for (let i = 1; i <= points; i++) {
    const x = lo + ((hi - lo) * i) / points;
    const cur = f(x);
    if (prev !== undefined && cur !== undefined && (prev === 0 || Math.sign(prev) !== Math.sign(cur))) {
      let [a, b, fa] = [prevX, x, prev];
      for (let k = 0; k < 80; k++) {
        const m = (a + b) / 2;
        const fm = f(m);
        if (fm === undefined) break;
        if (Math.sign(fm) === Math.sign(fa)) [a, fa] = [m, fm];
        else b = m;
      }
      const root = (a + b) / 2;
      if (eq.holds({ x: root }, 1e-6)) found.push(root);
    }
    prevX = x;
    prev = cur;
  }
  return found;
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(b));

function renderAll(text: string, where: string): void {
  for (const [, tex] of text.matchAll(/\$\$?([^$]+)\$\$?/g)) {
    expect(() => katex.renderToString(tex, { throwOnError: true }), `${where}: ${tex}`).not.toThrow();
  }
}

function verifyNumeric({ question, check }: Built): void {
  const { id, answer } = question;
  if (answer.kind !== 'numeric') throw new Error(`${id}: expected numeric`);
  if (check.identity) {
    const rng = createRng(7);
    for (let i = 0; i < 20; i++) {
      const scope = { x: rng.next() * 10 - 5, y: rng.next() * 10 - 5 };
      expect(evalAt(check.identity[0], scope), `${id} identity`).toBeCloseTo(evalAt(check.identity[1], scope)!, 6);
    }
  }
  let values: number[];
  if (check.integers) {
    const holds = compile(check.eq!);
    let count = 0;
    for (let n = check.integers[0]; n <= check.integers[1]; n++) if (holds.evaluate({ x: n }) === true) count++;
    expect(holds.evaluate({ x: check.integers[0] }), `${id}: range must start outside the solution set`).toBe(false);
    expect(holds.evaluate({ x: check.integers[1] }), `${id}: range must end outside the solution set`).toBe(false);
    values = [count];
  } else if (check.at) {
    values = [evalAt(check.target ?? 'x', check.at)!];
  } else {
    const eq = equation(check.eq!);
    const roots = check.roots!;
    for (const r of roots) expect(eq.holds({ x: r }), `${id}: root ${r} of ${check.eq}`).toBe(true);
    for (const r of check.rejected ?? []) expect(eq.holds({ x: r }), `${id}: ${r} should fail ${check.eq}`).toBe(false);
    const extent = Math.max(20, ...[...roots, ...(check.rejected ?? [])].map((r) => 3 * Math.abs(r)));
    const [lo, hi] = [Math.max(-extent, check.domain?.[0] ?? -Infinity), Math.min(extent, check.domain?.[1] ?? Infinity)];
    for (const found of scanRoots(eq, lo, hi)) {
      expect(roots.some((r) => near(found, r)), `${id}: unlisted root ${found} of ${check.eq}`).toBe(true);
    }
    values = roots.map((r) => evalAt(check.target ?? 'x', { x: r })!);
  }
  const combine = check.combine ?? 'only';
  let expected: number;
  switch (combine) {
    case 'only':
      expect(values, id).toHaveLength(1);
      expected = values[0];
      break;
    case 'max':
      expected = Math.max(...values);
      break;
    case 'min':
      expected = Math.min(...values);
      break;
    case 'sum':
      expected = values.reduce((s, v) => s + v, 0);
      break;
    case 'count':
      expected = values.length;
      break;
    case 'same':
      for (const v of values) expect(v, id).toBeCloseTo(values[0], 6);
      expected = values[0];
      break;
    case 'any':
      expected = values.find((v) => near(v, answer.value)) ?? NaN;
      break;
  }
  expect(near(answer.value, expected), `${id}: answer ${answer.value}, expected ${expected}`).toBe(true);
  expect(checkAnswer(answer, String(answer.value)), id).toBe('correct');
  if (!answer.display.includes('$')) expect(checkAnswer(answer, answer.display), `${id}: display ${answer.display}`).toBe('correct');
}

function verifySymbolic({ question, check }: Built): void {
  const { id, answer } = question;
  if (answer.kind !== 'symbolic') throw new Error(`${id}: expected symbolic`);
  const eq = equation(check.eq!);
  const rng = createRng(3);
  let verified = 0;
  for (let i = 0; i < 40; i++) {
    const scope: Scope = {};
    for (const v of answer.variables) {
      const [lo, hi] = answer.ranges?.[v] ?? [0.5, 3.5];
      scope[v] = lo + rng.next() * (hi - lo);
    }
    const value = evalAt(answer.expr, scope);
    if (value === undefined || Math.abs(value) > 1e6) continue;
    expect(eq.holds({ ...scope, [check.solveFor!]: value }, 1e-6), `${id}: ${answer.expr} at ${JSON.stringify(scope)}`).toBe(true);
    verified++;
  }
  expect(verified, `${id}: too few sample points in range`).toBeGreaterThanOrEqual(10);
  expect(checkAnswer(answer, answer.expr), id).toBe('correct');
  expect(checkAnswer(answer, `${check.solveFor} = ${answer.expr}`), id).toBe('correct');
  expect(checkAnswer(answer, `(${answer.expr}) + 1`), id).toBe('wrong');
  expect(checkAnswer(answer, `${answer.expr} + ${check.solveFor}`), `${id}: using the unknown`).toBe('invalid');
}

describe('trick templates', () => {
  for (const [family, templates] of Object.entries(TRICK_TEMPLATES)) {
    templates.forEach((template, index) => {
      it(`${family} #${index + 1}: answers are correct and every step renders`, () => {
        const rng = createRng(1000 + index);
        for (let i = 0; i < 25; i++) {
          const built = template(rng);
          const { question } = built;
          expect(question.tags, question.id).toEqual(['algebra_tricks', family]);
          expect(question.steps!.length, question.id).toBeGreaterThan(0);
          expect(question.steps![0], `${question.id}: first step names the trick`).toMatch(/\*\*.+\*\*/);
          renderAll(question.prompt, question.id);
          for (const step of question.steps!) renderAll(step, question.id);
          if (question.answer.kind === 'numeric') {
            verifyNumeric(built);
          } else {
            if (question.answer.kind === 'symbolic' && question.answer.display) renderAll(question.answer.display, question.id);
            verifySymbolic(built);
          }
        }
      });
    });
  }
});

describe('buildTrick', () => {
  it('only draws from enabled families', () => {
    const cfg = Object.fromEntries(Object.keys(DEFAULT_CONFIG.algebraTricks).map((k) => [k, k === 'radicals'])) as unknown as AlgebraTricksConfig;
    const rng = createRng(4);
    for (let i = 0; i < 100; i++) expect(buildTrick(cfg, rng).question.tags).toEqual(['algebra_tricks', 'radicals']);
  });

  it('falls back to every family when all are disabled', () => {
    const cfg = Object.fromEntries(Object.keys(DEFAULT_CONFIG.algebraTricks).map((k) => [k, false])) as unknown as AlgebraTricksConfig;
    const rng = createRng(5);
    const families = new Set(Array.from({ length: 400 }, () => buildTrick(cfg, rng).question.tags![1]));
    expect(families.size).toBe(Object.keys(TRICK_TEMPLATES).length);
  });
});

describe('symbolic answers', () => {
  const spec: AnswerSpec = { kind: 'symbolic', expr: '(4*y + 1)/(3*y - 2)', variables: ['y'] };

  it('accepts equivalent forms, implicit multiplication and a leading "x ="', () => {
    for (const input of ['(4y+1)/(3y-2)', 'x = (1 + 4y)/(3y - 2)', '(-4y-1)/(2-3y)', '(4y + 1) / (3y − 2)']) {
      expect(checkAnswer(spec, input), input).toBe('correct');
    }
  });

  it('rejects different expressions and flags unknown letters as invalid', () => {
    expect(checkAnswer(spec, '(4y-1)/(3y-2)')).toBe('wrong');
    expect(checkAnswer(spec, '4/3')).toBe('wrong');
    expect(checkAnswer(spec, '(4x+1)/(3x-2)')).toBe('invalid');
    expect(checkAnswer(spec, '(4y+1)/(')).toBe('invalid');
  });

  it('reads runs of single-letter variables as products, and supports ln', () => {
    const lens: AnswerSpec = { kind: 'symbolic', expr: 'u*f/(u - f)', variables: ['u', 'f'], ranges: { u: [2, 5], f: [0.5, 1.8] } };
    expect(checkAnswer(lens, 'uf/(u-f)')).toBe('correct');
    expect(checkAnswer(lens, '1/(1/f - 1/u)')).toBe('correct');
    const log: AnswerSpec = { kind: 'symbolic', expr: 'log(y + sqrt(y^2 + 1))', variables: ['y'] };
    expect(checkAnswer(log, 'ln(y + √(y^2+1))')).toBe('correct');
  });

  it('accepts ln in numeric answers', () => {
    const x = Math.log(5) / (Math.log(3) - Math.log(2));
    expect(checkAnswer({ kind: 'numeric', value: x, display: '' }, 'ln(5)/(ln(3)-ln(2))')).toBe('correct');
    expect(checkAnswer({ kind: 'numeric', value: x, display: '' }, 'log(5)/log(3/2)')).toBe('correct');
  });
});
