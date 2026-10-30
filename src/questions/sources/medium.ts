import type { MediumConfig } from '../../config/gameConfig';
import type { Rng } from '../../util/rng';
import { MENTAL_MATH_TAG, type Question, type QuestionSource } from '../types';
import { coefX, gcd, lcm, nonZero, paren, plusConst } from './format';

/**
 * Medium questions: one or two steps beyond plain arithmetic (equations, percentages, powers,
 * fractions, etc.). Every answer is an exact number, and every question comes with worked steps.
 */

type Generator = (rng: Rng) => Question;

function numeric(id: string, prompt: string, value: number, steps: string[], display = String(value)): Question {
  return { id, prompt, answer: { kind: 'numeric', value, display }, steps, tags: ['medium'] };
}

export const linearEquation: Generator = (rng) => {
  const x = nonZero(rng, -6, 8);
  if (rng.next() < 0.5) {
    // ax + b = c
    const a = nonZero(rng, -6, 9);
    const b = nonZero(rng, -20, 20);
    const c = a * x + b;
    return numeric(`med:lin:${a}:${b}:${c}`, `Solve for $x$: $${coefX(a)}${plusConst(b)} = ${c}$`, x, [
      `Move the constant: $${coefX(a)} = ${c} ${b < 0 ? '+' : '-'} ${Math.abs(b)} = ${c - b}$`,
      `Divide by $${a}$: $x = ${x}$`,
    ]);
  }
  // ax + b = cx + d
  const a = nonZero(rng, 2, 7);
  let c = nonZero(rng, -3, 5);
  if (c === a) c = a - 1 || -1;
  const b = rng.int(-15, 15);
  const d = (a - c) * x + b;
  return numeric(
    `med:lin2:${a}:${b}:${c}:${d}`,
    `Solve for $x$: $${coefX(a)}${b ? plusConst(b) : ''} = ${coefX(c)}${d ? plusConst(d) : ''}$`,
    x,
    [
      `Collect $x$ on the left: $${coefX(a - c)} = ${d} - ${paren(b)} = ${d - b}$`,
      `Divide by $${a - c}$: $x = ${x}$`,
    ],
  );
};

export const percentage: Generator = (rng) => {
  const p = rng.pick([5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80]);
  const unit = 100 / gcd(p, 100); // base must be a multiple of this for a whole-number answer
  const base = unit * rng.int(1, Math.max(1, Math.floor(200 / unit)));
  const result = (p * base) / 100;
  if (rng.next() < 0.7) {
    return numeric(`med:pct:${p}:${base}`, `What is ${p}% of ${base}?`, result, [
      `$${p}\\% = \\frac{${p}}{100}$`,
      `$\\frac{${p}}{100} \\times ${base} = ${result}$`,
    ]);
  }
  return numeric(`med:pctof:${p}:${result}`, `${result} is ${p}% of what number?`, base, [
    `$\\frac{${p}}{100} \\times n = ${result}$`,
    `$n = ${result} \\times \\frac{100}{${p}} = ${base}$`,
  ]);
};

export const powersAndRoots: Generator = (rng) => {
  switch (rng.int(0, 4)) {
    case 0: {
      const n = rng.int(11, 30);
      return numeric(`med:sq:${n}`, `$$${n}^2$$`, n * n, [`$${n}^2 = ${n} \\times ${n} = ${n * n}$`]);
    }
    case 1: {
      const n = rng.int(11, 30);
      return numeric(`med:sqrt:${n}`, `$$\\sqrt{${n * n}}$$`, n, [`$${n} \\times ${n} = ${n * n}$, so $\\sqrt{${n * n}} = ${n}$`]);
    }
    case 2: {
      const k = rng.int(6, 12);
      return numeric(`med:pow2:${k}`, `$$2^{${k}}$$`, 2 ** k, [`$2^{10} = 1024$; work up or down from there: $2^{${k}} = ${2 ** k}$`]);
    }
    case 3: {
      const k = rng.int(3, 6);
      return numeric(`med:pow3:${k}`, `$$3^{${k}}$$`, 3 ** k, [
        `$${Array.from({ length: k }, () => 3).join(' \\times ')} = ${3 ** k}$`,
      ]);
    }
    default: {
      const n = rng.int(2, 10);
      return numeric(`med:cbrt:${n}`, `$$\\sqrt[3]{${n ** 3}}$$`, n, [`$${n} \\times ${n} \\times ${n} = ${n ** 3}$, so $\\sqrt[3]{${n ** 3}} = ${n}$`]);
    }
  }
};

export const fractions: Generator = (rng) => {
  const b = rng.int(2, 6);
  const d = rng.int(2, 6);
  const a = rng.int(1, 5);
  const c = rng.int(1, 5);
  const op = rng.pick(['+', '-', '\\times'] as const);
  let num: number;
  let den: number;
  const steps: string[] = [];
  if (op === '\\times') {
    num = a * c;
    den = b * d;
    steps.push(`Multiply across: $\\frac{${a} \\times ${c}}{${b} \\times ${d}} = \\frac{${num}}{${den}}$`);
  } else {
    den = lcm(b, d);
    const a2 = a * (den / b);
    const c2 = c * (den / d);
    num = op === '+' ? a2 + c2 : a2 - c2;
    steps.push(`Common denominator ${den}: $\\frac{${a2}}{${den}} ${op} \\frac{${c2}}{${den}} = \\frac{${num}}{${den}}$`);
  }
  const g = gcd(num, den) || 1;
  const rn = num / g;
  const rd = den / g;
  const display = rd === 1 ? String(rn) : `${rn}/${rd}`;
  steps.push(g > 1 ? `Simplify (divide by ${g}): $${rd === 1 ? rn : `\\frac{${rn}}{${rd}}`}$` : 'Already in lowest terms.');
  return numeric(
    `med:frac:${a}/${b}${op}${c}/${d}`,
    `$$\\frac{${a}}{${b}} ${op} \\frac{${c}}{${d}}$$ (a fraction like 7/12 is fine)`,
    rn / rd,
    steps,
    display,
  );
};

export const bigMultiplication: Generator = (rng) => {
  const twoByTwo = rng.next() < 0.6;
  const a = twoByTwo ? rng.int(13, 99) : rng.int(102, 999);
  const b = twoByTwo ? rng.int(13, 99) : rng.int(3, 9);
  const steps = twoByTwo
    ? [
        `Split ${b}: $${a} \\times ${b} = ${a} \\times ${b - (b % 10)} + ${a} \\times ${b % 10}$`,
        `$= ${a * (b - (b % 10))} + ${a * (b % 10)} = ${a * b}$`,
      ]
    : [
        `Split ${a}: $${a - (a % 100)} \\times ${b} + ${a % 100} \\times ${b}$`,
        `$= ${(a - (a % 100)) * b} + ${(a % 100) * b} = ${a * b}$`,
      ];
  return numeric(`med:mul:${a}x${b}`, `$$${a} \\times ${b}$$`, a * b, steps);
};

export const orderOfOperations: Generator = (rng) => {
  switch (rng.int(0, 2)) {
    case 0: {
      // a + b × c²
      const a = rng.int(2, 20);
      const b = rng.int(2, 5);
      const c = rng.int(2, 5);
      return numeric(`med:ops1:${a}:${b}:${c}`, `$$${a} + ${b} \\times ${c}^2$$`, a + b * c * c, [
        `Exponent first: $${c}^2 = ${c * c}$`,
        `Then multiply: $${b} \\times ${c * c} = ${b * c * c}$`,
        `Then add: $${a} + ${b * c * c} = ${a + b * c * c}$`,
      ]);
    }
    case 1: {
      // (a − b)² − c × d
      const a = rng.int(1, 10);
      const b = rng.int(1, 12);
      const c = rng.int(2, 9);
      const d = rng.int(2, 9);
      const diff = a - b;
      return numeric(`med:ops2:${a}:${b}:${c}:${d}`, `$$(${a} - ${b})^2 - ${c} \\times ${d}$$`, diff * diff - c * d, [
        `Parentheses: $${a} - ${b} = ${diff}$`,
        `Exponent: $${paren(diff)}^2 = ${diff * diff}$`,
        `Multiply: $${c} \\times ${d} = ${c * d}$`,
        `Subtract: $${diff * diff} - ${c * d} = ${diff * diff - c * d}$`,
      ]);
    }
    default: {
      // a × (−b)² − c²   — the classic sign trap
      const a = rng.int(2, 5);
      const b = rng.int(2, 6);
      const c = rng.int(2, 6);
      const value = a * b * b - c * c;
      return numeric(`med:ops3:${a}:${b}:${c}`, `$$${a} \\times (-${b})^2 - ${c}^2$$`, value, [
        `$(-${b})^2 = ${b * b}$ (the square of a negative is positive)`,
        `$${a} \\times ${b * b} = ${a * b * b}$ and $${c}^2 = ${c * c}$`,
        `$${a * b * b} - ${c * c} = ${value}$`,
      ]);
    }
  }
};

export const quadraticRoots: Generator = (rng) => {
  const r1 = rng.int(-9, 9);
  let r2 = rng.int(-9, 9);
  if (r2 === r1) r2 = r1 === 9 ? -9 : r1 + 1;
  const sum = r1 + r2;
  const product = r1 * r2;
  const larger = Math.max(r1, r2);
  const smaller = Math.min(r1, r2);
  const bTerm = sum === 0 ? '' : sum === 1 ? ' - x' : sum === -1 ? ' + x' : sum > 0 ? ` - ${sum}x` : ` + ${-sum}x`;
  const cTerm = product === 0 ? '' : plusConst(product);
  const factor = (r: number) => (r === 0 ? 'x' : r > 0 ? `(x - ${r})` : `(x + ${-r})`);
  return numeric(`med:quad:${smaller}:${larger}`, `What is the larger solution of $x^2${bTerm}${cTerm} = 0$?`, larger, [
    `Find two numbers with sum ${sum} and product ${product}: ${smaller} and ${larger}`,
    `Factor: $${factor(smaller)}${factor(larger)} = 0$`,
    `Solutions: $x = ${smaller}$ or $x = ${larger}$; the larger is ${larger}`,
  ]);
};

const GENERATORS: Record<keyof MediumConfig, Generator> = {
  linearEquations: linearEquation,
  percentages: percentage,
  powersAndRoots: powersAndRoots,
  fractions: fractions,
  bigMultiplication: bigMultiplication,
  orderOfOperations: orderOfOperations,
  quadraticRoots: quadraticRoots,
};

/**
 * Elo-style rating of a medium question, from the variant encoded in its id (see rating.ts:
 * ~900 ≈ percentages and fractions, ~1150 ≈ factoring a quadratic).
 */
export function mediumDifficulty(id: string): number {
  const [, kind, rest = ''] = id.split(':');
  switch (kind) {
    case 'lin': return 900; // ax + b = c
    case 'lin2': return 1050; // x on both sides
    case 'pct': return 850; // p% of n
    case 'pctof': return 1000; // reverse percentage
    case 'sq': return 900;
    case 'sqrt': return 900;
    case 'pow2': return 800;
    case 'pow3': return 750;
    case 'cbrt': return 950;
    case 'frac': return rest.includes('times') ? 850 : 1000;
    case 'mul': return Number(rest.split('x')[1]) < 10 ? 800 : 1000; // 3-digit × 1-digit vs 2-digit × 2-digit
    case 'ops1': return 700;
    case 'ops2': return 850;
    case 'ops3': return 900; // the (−b)² sign trap
    case 'quad': return 1150;
    default: return 950;
  }
}

/** Variants that are mostly computation (no idea to find), tagged MENTAL_MATH_TAG. */
const MENTAL_MATH_KINDS = new Set(['pct', 'pctof', 'sq', 'sqrt', 'pow2', 'pow3', 'cbrt', 'frac', 'mul', 'ops1', 'ops2', 'ops3']);

export function generateMedium(cfg: MediumConfig, rng: Rng): Question {
  const enabled = (Object.keys(GENERATORS) as (keyof MediumConfig)[]).filter((k) => cfg[k]);
  const kind = enabled.length ? rng.pick(enabled) : 'linearEquations';
  const question = GENERATORS[kind](rng);
  const mental = MENTAL_MATH_KINDS.has(question.id.split(':')[1]);
  return {
    ...question,
    difficulty: mediumDifficulty(question.id),
    tags: mental ? [...(question.tags ?? []), MENTAL_MATH_TAG] : question.tags,
  };
}

export function createMediumSource(getConfig: () => MediumConfig): QuestionSource {
  return {
    id: 'medium',
    name: 'Medium (generated)',
    description: 'Equations, percentages, powers, fractions and more (ratings 700–1150); pick the kinds in the Medium section.',
    skill: 'math',
    next: (rng) => generateMedium(getConfig(), rng),
  };
}
