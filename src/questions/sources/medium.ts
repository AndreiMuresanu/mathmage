import type { MediumConfig } from '../../config/gameConfig';
import type { Rng } from '../../util/rng';
import type { Question, QuestionSource } from '../types';

/**
 * Medium questions: one or two steps beyond plain arithmetic (equations, percentages, powers,
 * fractions, etc.). Every answer is an exact number, and every question comes with worked steps.
 */

type Generator = (rng: Rng) => Question;

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

/** A nonzero integer in [min, max]. */
function nonZero(rng: Rng, min: number, max: number): number {
  let n = 0;
  while (n === 0) n = rng.int(min, max);
  return n;
}

/** " + 5" / " - 5" for appending a constant after another term. */
function plusConst(n: number): string {
  return n < 0 ? ` - ${-n}` : ` + ${n}`;
}

/** "3x", "-x", "x" for a leading coefficient. */
function coefX(a: number): string {
  if (a === 1) return 'x';
  if (a === -1) return '-x';
  return `${a}x`;
}

/** Wrap negatives in parentheses when they appear inside an expression. */
function paren(n: number): string {
  return n < 0 ? `(${n})` : String(n);
}

function numeric(id: string, prompt: string, value: number, steps: string[], display = String(value)): Question {
  return { id, prompt, answer: { kind: 'numeric', value, display }, steps, tags: ['medium'] };
}

export const linearEquation: Generator = (rng) => {
  const x = nonZero(rng, -12, 15);
  if (rng.next() < 0.5) {
    // ax + b = c
    const a = nonZero(rng, -9, 12);
    const b = nonZero(rng, -40, 40);
    const c = a * x + b;
    return numeric(`med:lin:${a}:${b}:${c}`, `Solve for $x$: $${coefX(a)}${plusConst(b)} = ${c}$`, x, [
      `Move the constant: $${coefX(a)} = ${c} ${b < 0 ? '+' : '-'} ${Math.abs(b)} = ${c - b}$`,
      `Divide by $${a}$: $x = ${x}$`,
    ]);
  }
  // ax + b = cx + d
  const a = nonZero(rng, 2, 12);
  let c = nonZero(rng, -6, 9);
  if (c === a) c = a - 1 || -1;
  const b = rng.int(-30, 30);
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
  const p = rng.pick([5, 10, 12, 15, 20, 25, 30, 35, 40, 60, 75, 80, 120, 150]);
  const unit = 100 / gcd(p, 100); // base must be a multiple of this for a whole-number answer
  const base = unit * rng.int(1, Math.max(1, Math.floor(600 / unit)));
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
  const b = rng.int(2, 12);
  const d = rng.int(2, 12);
  const a = rng.int(1, 11);
  const c = rng.int(1, 11);
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
      const a = rng.int(2, 40);
      const b = rng.int(2, 9);
      const c = rng.int(2, 9);
      return numeric(`med:ops1:${a}:${b}:${c}`, `$$${a} + ${b} \\times ${c}^2$$`, a + b * c * c, [
        `Exponent first: $${c}^2 = ${c * c}$`,
        `Then multiply: $${b} \\times ${c * c} = ${b * c * c}$`,
        `Then add: $${a} + ${b * c * c} = ${a + b * c * c}$`,
      ]);
    }
    case 1: {
      // (a − b)² − c × d
      const a = rng.int(1, 15);
      const b = rng.int(1, 20);
      const c = rng.int(2, 12);
      const d = rng.int(2, 12);
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
      const a = rng.int(2, 6);
      const b = rng.int(2, 9);
      const c = rng.int(2, 9);
      const value = a * b * b - c * c;
      return numeric(`med:ops3:${a}:${b}:${c}`, `$$${a} \\times (-${b})^2 - ${c}^2$$`, value, [
        `$(-${b})^2 = ${b * b}$ (the square of a negative is positive)`,
        `$${a} \\times ${b * b} = ${a * b * b}$ and $${c}^2 = ${c * c}$`,
        `$${a * b * b} - ${c * c} = ${value}$`,
      ]);
    }
  }
};

export const averages: Generator = (rng) => {
  const n = rng.int(4, 5);
  const mean = rng.int(8, 60);
  // Deviations that sum to zero keep the mean a whole number.
  const values: number[] = [];
  let total = 0;
  for (let i = 0; i < n - 1; i++) {
    const v = mean + rng.int(-12, 12);
    values.push(v);
    total += v;
  }
  values.push(mean * n - total);
  if (values.some((v) => v <= 0)) return averages(rng);
  if (rng.next() < 0.5) {
    return numeric(`med:mean:${values.join(',')}`, `What is the mean (average) of ${values.join(', ')}?`, mean, [
      `Sum: $${values.join(' + ')} = ${mean * n}$`,
      `Divide by ${n}: $${mean * n} \\div ${n} = ${mean}$`,
    ]);
  }
  const known = values.slice(0, -1);
  const missing = values[values.length - 1];
  return numeric(
    `med:meanmiss:${values.join(',')}`,
    `The mean of ${n} numbers is ${mean}. ${n - 1} of them are ${known.join(', ')}. What is the remaining number?`,
    missing,
    [
      `Total must be $${n} \\times ${mean} = ${mean * n}$`,
      `Known numbers sum to $${known.reduce((s, v) => s + v, 0)}$`,
      `Last number: $${mean * n} - ${known.reduce((s, v) => s + v, 0)} = ${missing}$`,
    ],
  );
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
  averages: averages,
  quadraticRoots: quadraticRoots,
};

export function generateMedium(cfg: MediumConfig, rng: Rng): Question {
  const enabled = (Object.keys(GENERATORS) as (keyof MediumConfig)[]).filter((k) => cfg[k]);
  const kind = enabled.length ? rng.pick(enabled) : 'linearEquations';
  return GENERATORS[kind](rng);
}

export function createMediumSource(getConfig: () => MediumConfig): QuestionSource {
  return {
    id: 'medium',
    name: 'Medium (generated)',
    description: 'Equations, percentages, powers, fractions and more; pick the kinds in the Medium section.',
    next: (rng) => generateMedium(getConfig(), rng),
  };
}
