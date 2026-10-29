import type { AlgebraTricksConfig } from '../../config/gameConfig';
import type { Rng } from '../../util/rng';
import type { AnswerSpec, Question, QuestionSource } from '../types';
import { coefX, factorPair, fracTex, fracText, gcd, nonZero, paren, plusConst, shift, sqrtTex, sum } from './format';

/**
 * "Solve for x" questions that each need one manipulation trick: completing the square, a hidden
 * substitution, the conjugate, factoring instead of dividing, rejecting fake roots, and so on.
 * The first step of every solution names the trick, so a wrong answer teaches how to spot it.
 */

/**
 * How the tests verify a question (all expressions in mathjs syntax). The expected answer is
 * `combine` applied to `target` evaluated at each of `roots`, or at the point `at`.
 */
export interface TrickCheck {
  /** Equation in x ("lhs = rhs"); `roots` must be all of its real solutions. */
  eq?: string;
  roots?: number[];
  /** Candidates the usual method produces that must fail the original equation. */
  rejected?: number[];
  /** Only look for other roots in this interval. */
  domain?: [number, number];
  /** Expression whose value is asked for (default "x"). */
  target?: string;
  at?: Record<string, number>;
  combine?: 'only' | 'max' | 'min' | 'sum' | 'count' | 'same' | 'any';
  /** `eq` is an inequality in x instead; the answer is how many integers in this range satisfy it. */
  integers?: [number, number];
  /** Two expressions in x and y that must be equal everywhere (a rewrite the steps rely on). */
  identity?: [string, string];
  /** Symbolic answers: substituting the answer for this variable must satisfy `eq`. */
  solveFor?: string;
}

export interface Built {
  question: Question;
  check: TrickCheck;
}

type Template = (rng: Rng) => Built;

const NON_SQUARES = [2, 3, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 22, 23];

function build(family: keyof AlgebraTricksConfig, id: string, prompt: string, answer: AnswerSpec, steps: string[], check: TrickCheck): Built {
  return { question: { id: `algebra_tricks:${id}`, prompt, answer, steps, tags: ['algebra_tricks', family] }, check };
}

function num(value: number, display = String(value)): AnswerSpec {
  return { kind: 'numeric', value, display };
}

function frac(n: number, d: number): AnswerSpec {
  return num(n / d, fracText(n, d));
}

function expr(expr: string, variables: string[], display: string, ranges?: Record<string, [number, number]>): AnswerSpec {
  return { kind: 'symbolic', expr, variables, display, ranges };
}

/** Distinct integers from [min, max]. */
function distinctInts(rng: Rng, count: number, min: number, max: number, exclude: number[] = []): number[] {
  const out: number[] = [];
  while (out.length < count) {
    const n = rng.int(min, max);
    if (!out.includes(n) && !exclude.includes(n)) out.push(n);
  }
  return out;
}

/** Retry a generator until it returns a value (for templates built by rejection sampling). */
function retry<T>(make: () => T | undefined): T {
  for (;;) {
    const result = make();
    if (result !== undefined) return result;
  }
}

const quadU = (v: string, s: number, p: number) => sum([[1, `${v}^2`], [-s, v], [p, '']]).tex;

/** "$x = 2$ or $x = -3$", or just "$x = 2$" for a double root. */
const xs = (r1: number, r2: number) => (r1 === r2 ? `$x = ${r1}$ (a double root)` : `$x = ${r1}$ or $x = ${r2}$`);

/** kπ/d as LaTeX: 0, \pi, \frac{\pi}{6}, \frac{5\pi}{3}, 2\pi. */
function piTex(k: number, d: number): string {
  if (k === 0) return '0';
  const g = gcd(k, d);
  const [n, m] = [k / g, d / g];
  const top = `${n === 1 ? '' : n}\\pi`;
  return m === 1 ? top : `\\frac{${top}}{${m}}`;
}

/** Angles in [0, 2π) are measured in units of π/12, which covers every "nice" angle. */
const UNIT = Math.PI / 12;
const mod24 = (n: number) => ((n % 24) + 24) % 24;

/** Solutions of sin θ = v (or cos θ = v) in [0, 2π) in units of π/12; v must be a standard value. */
function trigUnits(fn: 'sin' | 'cos', v: number): number[] {
  if (Math.abs(v) > 1 + 1e-9) return [];
  const t = fn === 'sin' ? Math.asin(Math.max(-1, Math.min(1, v))) : Math.acos(Math.max(-1, Math.min(1, v)));
  const both = fn === 'sin' ? [t, Math.PI - t] : [t, 2 * Math.PI - t];
  return [...new Set(both.map((a) => mod24(Math.round(a / UNIT))))].sort((p, q) => p - q);
}

const angleList = (units: number[]) => units.map((u) => piTex(u, 12)).join(', ');
const angle = (units: number) => num(units * UNIT, `$${piTex(units, 12)}$`);
const FULL_TURN: [number, number] = [0, 2 * Math.PI - 1e-6];

/** Combine solutions (in units of π/12) the way a question asks for them. */
function combineAngles(units: number[], ask: 'count' | 'sum' | 'max' | 'min'): AnswerSpec {
  if (ask === 'count') return num(units.length);
  if (ask === 'sum') return angle(units.reduce((s, u) => s + u, 0));
  return angle(ask === 'max' ? Math.max(...units) : Math.min(...units));
}

function binomial(n: number, k: number): number {
  let out = 1;
  for (let i = 1; i <= k; i++) out = (out * (n - i + 1)) / i;
  return out;
}

/** " + 3x" / " - 3x" to append a sum produced by `sum()` after other terms ("" for zero). */
const tail = (tex: string) => (tex === '0' ? '' : tex.startsWith('-') ? ` - ${tex.slice(1)}` : ` + ${tex}`);

// ---------------------------------------------------------------- Completing the square

const squareIrrational: Template = (rng) => {
  const h = nonZero(rng, -7, 7);
  const m = rng.pick(NON_SQUARES);
  const c = m - h * h;
  const a = rng.pick([1, 1, 2, 3]);
  const lhs = sum([[a, 'x^2'], [2 * a * h, 'x']]);
  const monic = sum([[1, 'x^2'], [2 * h, 'x']]);
  const steps = [
    `**Complete the square.**${a > 1 ? ` Divide by ${a} first: $${monic.tex} = ${c}$.` : ''} Half of $${2 * h}$ is $${h}$, so add $${h * h}$ to both sides`,
    `$(${shift(h)})^2 = ${c} + ${h * h} = ${m}$`,
    `$x = ${-h} \\pm \\sqrt{${m}}$; the larger is $${-h} + ${sqrtTex(m)}$`,
  ];
  return build(
    'completeSquare',
    `sqirr:${a}:${h}:${m}`,
    `Find the larger solution of $${lhs.tex} = ${a * c}$`,
    num(-h + Math.sqrt(m), `$${-h} + ${sqrtTex(m)}$`),
    steps,
    { eq: `${lhs.math} = ${a * c}`, roots: [-h + Math.sqrt(m), -h - Math.sqrt(m)], combine: 'max' },
  );
};

const squareMinimum: Template = (rng) => {
  const a = rng.int(1, 4);
  const h = nonZero(rng, -6, 6);
  const k = rng.int(-15, 15);
  const poly = sum([[a, 'x^2'], [-2 * a * h, 'x'], [a * h * h + k, '']]);
  const inner = sum([[1, 'x^2'], [-2 * h, 'x']]).tex;
  const askX = rng.next() < 0.5;
  const square = `${a > 1 ? a : ''}(${shift(-h)})^2${k ? plusConst(k) : ''}`;
  const steps = [
    a > 1
      ? `**Complete the square.** Factor $${a}$ out of the $x$ terms: $${a}\\left(${inner}\\right)${plusConst(a * h * h + k)}$`
      : `**Complete the square:** half of $${-2 * h}$ is $${-h}$`,
    `$${inner} = (${shift(-h)})^2 - ${h * h}$, so the expression is $${square}$`,
    `A square is never negative, so the smallest value is $${k}$, reached at $x = ${h}$`,
  ];
  return build(
    'completeSquare',
    `sqmin:${a}:${h}:${k}:${askX ? 'x' : 'v'}`,
    askX ? `For which $x$ is $${poly.tex}$ smallest?` : `What is the minimum value of $${poly.tex}$?`,
    num(askX ? h : k),
    steps,
    { identity: [poly.math, `${a}*(x - (${h}))^2 + (${k})`], at: { x: h }, target: askX ? 'x' : poly.math },
  );
};

const addSubtract: Template = (rng) =>
  retry(() => {
    if (rng.next() < 0.35) {
      // n⁴ + 4 = (n² + 2)² − (2n)²
      const n = rng.int(6, 20);
      const den = n * n - 2 * n + 2;
      const value = n * n + 2 * n + 2;
      const steps = [
        `**Add and subtract** $4 \\cdot ${n}^2$ to make a perfect square: $${n}^4 + 4 = (${n}^2 + 2)^2 - (2 \\cdot ${n})^2$`,
        `**Difference of squares:** $= (${n}^2 - ${2 * n} + 2)(${n}^2 + ${2 * n} + 2) = ${den} \\times ${value}$`,
        `So the quotient is $${value}$`,
      ];
      return build('completeSquare', `germain:${n}`, `Compute without a calculator: $$\\frac{${n}^4 + 4}{${den}}$$`, num(value), steps, {
        at: {},
        target: `(${n}^4 + 4)/${den}`,
      });
    }
    // x⁴ + px² + q² = (x² + q)² − (mx)², with no real roots so the factorization is unique
    const m = rng.int(1, 5);
    const q = rng.int(1, 12);
    if (m * m >= 4 * q) return undefined;
    const p = 2 * q - m * m;
    const quartic = sum([[1, 'x^4'], [p, 'x^2'], [q * q, '']]);
    const mx = coefX(m);
    const steps = [
      `**Add and subtract** $${coefX(m * m, 'x^2')}$ to make a perfect square: $${quartic.tex} = (x^4 + ${2 * q}x^2 + ${q * q}) - ${coefX(m * m, 'x^2')}$`,
      `$= (x^2 + ${q})^2 - ${m === 1 ? 'x^2' : `(${mx})^2`}$, a **difference of squares**`,
      `$= (x^2 + ${mx} + ${q})(x^2 - ${mx} + ${q})$, so $a = ${m}$`,
    ];
    return build(
      'completeSquare',
      `addsub:${m}:${q}`,
      `$${quartic.tex}$ is the product of two quadratics with integer coefficients, one of them $x^2 + ax + b$ with $a > 0$. Find $a$.`,
      num(m),
      steps,
      { identity: [quartic.math, `(x^2 + ${m}*x + ${q})*(x^2 - ${m}*x + ${q})`], at: {}, target: String(m) },
    );
  });

const circle: Template = (rng) => {
  const h = nonZero(rng, -7, 7);
  const k = rng.int(-7, 7);
  const r = rng.int(1, 9);
  const a = rng.pick([1, 1, 1, 2, 3]);
  const lhs = sum([[a, 'x^2'], [a, 'y^2'], [-2 * a * h, 'x'], [-2 * a * k, 'y']]);
  const rhs = a * (r * r - h * h - k * k);
  const square = (c: number, v: string) => (c ? `(${shift(-c, v)})^2` : `${v}^2`);
  const added = [h, k].filter(Boolean).map((c) => c * c);
  const askRadius = rng.next() < 0.6;
  const steps = [
    `**${a > 1 ? `Divide by ${a}, then complete` : 'Complete'} the square** in $x$ and in $y$: add $${added.join('$ and $')}$ to both sides`,
    `$${square(h, 'x')} + ${square(k, 'y')} = ${rhs / a}${added.map((v) => ` + ${v}`).join('')} = ${r * r}$`,
    askRadius ? `The radius is $\\sqrt{${r * r}} = ${r}$` : `The center is $(${h}, ${k})$, so the sum is $${h + k}$`,
  ];
  return build(
    'completeSquare',
    `circle:${a}:${h}:${k}:${r}:${askRadius ? 'r' : 'c'}`,
    `$${lhs.tex} = ${rhs}$ is a circle. Find ${askRadius ? 'its radius' : 'the sum of the coordinates of its center'}.`,
    num(askRadius ? r : h + k),
    steps,
    {
      identity: [`${lhs.math} - (${rhs})`, `${a}*((x - (${h}))^2 + (y - (${k}))^2 - ${r * r})`],
      at: {},
      target: String(askRadius ? r : h + k),
    },
  );
};

const squareExtremes: Template = (rng) => {
  const variant = rng.int(0, 2);
  if (variant === 0) {
    // maximum of −a(x − h)² + K, given expanded
    const a = rng.int(1, 4);
    const h = nonZero(rng, -5, 5);
    const K = rng.int(-10, 20);
    const poly = sum([[-a, 'x^2'], [2 * a * h, 'x'], [K - a * h * h, '']]);
    const inner = sum([[1, 'x^2'], [-2 * h, 'x']]).tex;
    const steps = [
      `**Complete the square:** factor out $${-a}$: $${-a}\\left(${inner}\\right)${plusConst(K - a * h * h)}$`,
      `$${inner} = (${shift(-h)})^2 - ${h * h}$, so the expression is $${-a}(${shift(-h)})^2${K ? plusConst(K) : ''}$`,
      `A square is never negative, so with the minus sign the largest value is $${K}$, at $x = ${h}$`,
    ];
    return build('completeSquare', `sqmax:${a}:${h}:${K}`, `What is the maximum value of $${poly.tex}$?`, num(K), steps, {
      identity: [poly.math, `${-a}*(x - (${h}))^2 + (${K})`],
      at: { x: h },
      target: poly.math,
    });
  }
  const S = 2 * rng.int(2, 20);
  if (variant === 1) {
    const steps = [
      `**Substitute** $y = ${S} - x$: $xy = ${S}x - x^2$`,
      `**Complete the square:** $${S}x - x^2 = ${(S * S) / 4} - (x - ${S / 2})^2$`,
      `The largest value is $${(S * S) / 4}$, at $x = y = ${S / 2}$`,
    ];
    return build('completeSquare', `maxprod:${S}`, `Real numbers $x, y$ have $x + y = ${S}$. What is the largest possible value of $xy$?`, num((S * S) / 4), steps, {
      identity: [`x*(${S} - x)`, `${(S * S) / 4} - (x - ${S / 2})^2`],
      at: { x: S / 2 },
      target: `x*(${S} - x)`,
    });
  }
  const steps = [
    `**Substitute** $y = ${S} - x$: $x^2 + y^2 = 2x^2 - ${2 * S}x + ${S * S}$`,
    `**Complete the square:** $= 2(x - ${S / 2})^2 + ${(S * S) / 2}$`,
    `The smallest value is $${(S * S) / 2}$, at $x = y = ${S / 2}$`,
  ];
  return build('completeSquare', `minsq:${S}`, `Real numbers $x, y$ have $x + y = ${S}$. What is the smallest possible value of $x^2 + y^2$?`, num((S * S) / 2), steps, {
    identity: [`x^2 + (${S} - x)^2`, `2*(x - ${S / 2})^2 + ${(S * S) / 2}`],
    at: { x: S / 2 },
    target: `x^2 + (${S} - x)^2`,
  });
};

// ---------------------------------------------------------------- Substitution

const biquadratic: Template = (rng) => {
  const [p, q] = distinctInts(rng, 2, 1, 6);
  const s1 = p * p;
  const s2 = rng.next() < 0.35 ? -rng.int(1, 6) : q * q;
  const eq = sum([[1, 'x^4'], [-(s1 + s2), 'x^2'], [s1 * s2, '']]);
  const roots = s2 > 0 ? [p, -p, q, -q] : [p, -p];
  const best = Math.max(...roots);
  const steps = [
    `**Substitute** $u = x^2$ (there are only $x^4$ and $x^2$ terms): $${quadU('u', s1 + s2, s1 * s2)} = 0$`,
    `Factor: $${factorPair('u', s1, s2)} = 0$, so $u = ${s1}$ or $u = ${s2}$`,
    s2 < 0
      ? `$x^2 = ${s2}$ has no real solution; $x^2 = ${s1}$ gives $x = \\pm ${p}$`
      : `$x = \\pm ${p}$ or $x = \\pm ${q}$; the largest is ${best}`,
  ];
  return build(
    'substitution',
    `biquad:${s1}:${s2}`,
    s2 < 0 ? `Find the positive solution of $${eq.tex} = 0$` : `Find the largest solution of $${eq.tex} = 0$`,
    num(best),
    steps,
    { eq: `${eq.math} = 0`, roots, combine: 'max' },
  );
};

const exponentialQuadratic: Template = (rng) =>
  retry(() => {
    const b = rng.pick([2, 3]);
    const sq = b * b;
    const j = rng.int(1, b === 2 ? 4 : 3);
    const negative = rng.next() < 0.35;
    const i = rng.int(0, j - 1);
    const u1 = b ** j;
    const u2 = negative ? -rng.int(1, 6) : b ** i;
    const s = u1 + u2;
    const p = u1 * u2;
    if (s === 0) return undefined;
    const power: [string, string] = [`${b}^x`, `${b}^x`];
    const swapped = rng.next() < 0.5;
    const lhs = swapped ? sum([[1, `${sq}^x`], [p, '']]) : sum([[1, `${sq}^x`], [-s, power], [p, '']]);
    const rhs = swapped ? sum([[s, power]]) : sum([]);
    const steps = [
      `**Substitute** $u = ${b}^x$, since $${sq}^x = (${b}^x)^2 = u^2$: $${quadU('u', s, p)} = 0$`,
      `Factor: $${factorPair('u', u1, u2)} = 0$, so $u = ${u1}$ or $u = ${u2}$`,
      negative
        ? `$${b}^x = ${u2}$ is impossible (powers are positive); $${b}^x = ${u1} = ${b}^{${j}}$ gives $x = ${j}$`
        : `$${b}^x = ${u2}$ gives $x = ${i}$, and $${b}^x = ${u1}$ gives $x = ${j}$; the larger is ${j}`,
    ];
    return build(
      'substitution',
      `expquad:${b}:${u1}:${u2}:${swapped ? 1 : 0}`,
      `${negative ? 'Solve for $x$' : 'Find the larger solution'}: $${lhs.tex} = ${rhs.tex}$`,
      num(j),
      steps,
      { eq: `${lhs.math} = ${rhs.math}`, roots: negative ? [j] : [i, j], combine: 'max' },
    );
  });

const repeatedChunk: Template = (rng) =>
  retry(() => {
    const b = nonZero(rng, -3, 3);
    const [r1, r2] = distinctInts(rng, 2, -6, 6);
    const u1 = r1 * (r1 + b);
    const u2 = r2 * (r2 + b);
    if (u1 === u2) return undefined;
    const chunk = sum([[1, 'x^2'], [b, 'x']]);
    const chunkMath = `(x^2 + (${b})*x)`;
    const eq = sum([
      [1, [`(${chunk.tex})^2`, `${chunkMath}^2`]],
      [-(u1 + u2), [`(${chunk.tex})`, chunkMath]],
      [u1 * u2, ''],
    ]);
    const roots = [...new Set([r1, -b - r1, r2, -b - r2])];
    const best = Math.max(...roots);
    const steps = [
      `**Substitute** $u = ${chunk.tex}$ (it appears twice): $${quadU('u', u1 + u2, u1 * u2)} = 0$`,
      `Factor: $${factorPair('u', u1, u2)} = 0$, so $u = ${u1}$ or $u = ${u2}$`,
      `$${chunk.tex} = ${u1}$ gives ${xs(r1, -b - r1)}; $${chunk.tex} = ${u2}$ gives ${xs(r2, -b - r2)}`,
      `The largest is ${best}`,
    ];
    return build(
      'substitution',
      `chunk:${b}:${Math.min(u1, u2)}:${Math.max(u1, u2)}`,
      `Find the largest solution of $${eq.tex} = 0$`,
      num(best),
      steps,
      { eq: `${eq.math} = 0`, roots, combine: 'max' },
    );
  });

const sqrtQuadratic: Template = (rng) =>
  retry(() => {
    const n = rng.int(2, 9);
    const negative = rng.next() < 0.5;
    const m = negative ? -rng.int(1, 6) : rng.int(1, n - 1);
    if (m === -n) return undefined;
    const eq = sum([[1, 'x'], [-(n + m), ['\\sqrt{x}', 'sqrt(x)']], [n * m, '']]);
    const steps = [
      `**Substitute** $u = \\sqrt{x}$, so $x = u^2$: $${quadU('u', n + m, n * m)} = 0$`,
      `Factor: $${factorPair('u', n, m)} = 0$, so $u = ${n}$ or $u = ${m}$`,
      negative
        ? `$\\sqrt{x}$ can't be negative, so reject $u = ${m}$ ($x = ${m * m}$ fails the original). $\\sqrt{x} = ${n}$ gives $x = ${n * n}$`
        : `$x = ${m}^2 = ${m * m}$ or $x = ${n}^2 = ${n * n}$; the larger is ${n * n}`,
    ];
    return build(
      'substitution',
      `sqrtquad:${n}:${m}`,
      `${negative ? 'Solve for $x$' : 'Find the larger solution'}: $${eq.tex} = 0$`,
      num(n * n),
      steps,
      { eq: `${eq.math} = 0`, roots: negative ? [n * n] : [m * m, n * n], rejected: negative ? [m * m] : [], combine: 'max' },
    );
  });

const reciprocalQuadratic: Template = (rng) => {
  const [p, q] = distinctInts(rng, 2, -6, 6, [0]);
  const s = p + q;
  const middle = s === 0 ? '' : ` ${s > 0 ? '-' : '+'} \\frac{${Math.abs(s)}}{x}`;
  const tex = `\\frac{1}{x^2}${middle}${plusConst(p * q)} = 0`;
  const big = 1 / p > 1 / q ? p : q;
  const steps = [
    `**Substitute** $u = \\frac{1}{x}$: $${quadU('u', s, p * q)} = 0$`,
    `Factor: $${factorPair('u', p, q)} = 0$, so $u = ${p}$ or $u = ${q}$`,
    `$x = \\frac{1}{u}$: $x = ${fracTex(1, p)}$ or $x = ${fracTex(1, q)}$; the larger is $${fracTex(1, big)}$`,
  ];
  return build(
    'substitution',
    `recip:${Math.min(p, q)}:${Math.max(p, q)}`,
    `Find the larger solution of $${tex}$ (a fraction like 1/3 is fine)`,
    frac(1, big),
    steps,
    { eq: `1/x^2 - (${s})/x + (${p * q}) = 0`, roots: [1 / p, 1 / q], combine: 'max' },
  );
};

const logQuadratic: Template = (rng) => {
  const b = rng.pick([2, 3]);
  const l2 = rng.int(1, b === 2 ? 5 : 3);
  const l1 = rng.int(b === 2 ? -2 : -1, l2 - 1);
  const log: [string, string] = [`\\log_{${b}} x`, `log(x, ${b})`];
  const eq = sum([[1, [`(\\log_{${b}} x)^2`, `log(x, ${b})^2`]], [-(l1 + l2), log], [l1 * l2, '']]);
  const powTex = (l: number) => `${b}^{${l}} = ${fracTex(l >= 0 ? b ** l : 1, l >= 0 ? 1 : b ** -l)}`;
  const steps = [
    `**Substitute** $u = \\log_{${b}} x$: $${quadU('u', l1 + l2, l1 * l2)} = 0$`,
    `Factor: $${factorPair('u', l1, l2)} = 0$, so $u = ${l1}$ or $u = ${l2}$`,
    `$x = ${powTex(l1)}$ or $x = ${powTex(l2)}$; the larger is ${b ** l2}`,
  ];
  return build(
    'substitution',
    `logquad:${b}:${l1}:${l2}`,
    `Find the larger solution of $${eq.tex} = 0$`,
    num(b ** l2),
    steps,
    { eq: `${eq.math} = 0`, roots: [b ** l1, b ** l2], combine: 'max' },
  );
};

const palindromic: Template = (rng) => {
  const t1 = rng.int(3, 6);
  const t2 = rng.pick([-4, -3, -1, 0, 1]);
  const a = -(t1 + t2);
  const c = t1 * t2 + 2;
  const eq = sum([[1, 'x^4'], [a, 'x^3'], [c, 'x^2'], [a, 'x'], [1, '']]);
  const xRoots = (t: number) => (Math.abs(t) > 2 ? [(t + Math.sqrt(t * t - 4)) / 2, (t - Math.sqrt(t * t - 4)) / 2] : []);
  const divided = sum([
    [1, ['\\left(x^2 + \\frac{1}{x^2}\\right)', '']],
    [a, ['\\left(x + \\frac{1}{x}\\right)', '']],
    [c, ''],
  ]).tex;
  const best = (t1 + Math.sqrt(t1 * t1 - 4)) / 2;
  // (t + √(t² − 4))/2, simplified to t/2 + √(t²/4 − 1) when t is even.
  const bestTex = t1 % 2 === 0 ? `${t1 / 2} + ${sqrtTex((t1 * t1) / 4 - 1)}` : `\\frac{${t1} + ${sqrtTex(t1 * t1 - 4)}}{2}`;
  const steps = [
    `**Palindromic coefficients** ($1, ${a}, ${c}, ${a}, 1$): divide by $x^2$ and pair up terms: $${divided} = 0$`,
    `**Substitute** $t = x + \\frac{1}{x}$, using $x^2 + \\frac{1}{x^2} = t^2 - 2$: $${quadU('t', t1 + t2, t1 * t2)} = 0$`,
    `Factor: $${factorPair('t', t1, t2)} = 0$, so $t = ${t1}$ or $t = ${t2}$`,
    Math.abs(t2) < 2
      ? `$x + \\frac{1}{x} = ${t2}$ has no real solution ($|x + \\frac{1}{x}| \\ge 2$)`
      : `$x + \\frac{1}{x} = ${t2}$ only gives negative solutions`,
    `$x + \\frac{1}{x} = ${t1}$ means $x^2 - ${t1}x + 1 = 0$, so $x = \\frac{${t1} \\pm \\sqrt{${t1 * t1 - 4}}}{2}$; the largest is $${bestTex}$`,
  ];
  return build(
    'substitution',
    `palin:${t1}:${t2}`,
    `Find the largest real solution of $${eq.tex} = 0$`,
    num(best, `$${bestTex}$`),
    steps,
    { eq: `${eq.math} = 0`, roots: [...xRoots(t1), ...xRoots(t2)], combine: 'max' },
  );
};

const fractionalPowers: Template = (rng) =>
  retry(() => {
    if (rng.next() < 0.5) {
      // x^{2/3} − s·x^{1/3} + p = 0 with u = ∛x
      const [p, q] = distinctInts(rng, 2, -3, 4);
      const eq = sum([[1, ['x^{2/3}', 'cbrt(x)^2']], [-(p + q), ['x^{1/3}', 'cbrt(x)']], [p * q, '']]);
      const big = Math.max(p, q);
      const steps = [
        `**Substitute** $u = x^{1/3}$, so $x^{2/3} = u^2$: $${quadU('u', p + q, p * q)} = 0$`,
        `Factor: $${factorPair('u', p, q)} = 0$, so $u = ${p}$ or $u = ${q}$`,
        `**Cube back:** $x = ${paren(p)}^3 = ${p ** 3}$ or $x = ${paren(q)}^3 = ${q ** 3}$; the larger is ${big ** 3}`,
      ];
      return build('substitution', `fracpow3:${Math.min(p, q)}:${big}`, `Find the larger solution of $${eq.tex} = 0$`, num(big ** 3), steps, {
        eq: `${eq.math} = 0`,
        roots: [p ** 3, q ** 3],
        combine: 'max',
      });
    }
    // √x − s·x^{1/4} + p = 0 with u = x^{1/4} ≥ 0
    const n = rng.int(2, 4);
    const negative = rng.next() < 0.4;
    const m = negative ? -rng.int(1, 4) : rng.int(1, n - 1);
    if (m === -n) return undefined;
    const eq = sum([[1, ['\\sqrt{x}', 'sqrt(x)']], [-(n + m), ['\\sqrt[4]{x}', 'x^(1/4)']], [n * m, '']]);
    const steps = [
      `**Substitute** $u = \\sqrt[4]{x}$, so $\\sqrt{x} = u^2$: $${quadU('u', n + m, n * m)} = 0$`,
      `Factor: $${factorPair('u', n, m)} = 0$, so $u = ${n}$ or $u = ${m}$`,
      negative
        ? `A fourth root can't be negative, so reject $u = ${m}$. $x = ${n}^4 = ${n ** 4}$`
        : `$x = ${m}^4 = ${m ** 4}$ or $x = ${n}^4 = ${n ** 4}$; the larger is ${n ** 4}`,
    ];
    return build(
      'substitution',
      `fracpow4:${n}:${m}`,
      `${negative ? 'Solve for $x$' : 'Find the larger solution'}: $${eq.tex} = 0$`,
      num(n ** 4),
      steps,
      { eq: `${eq.math} = 0`, roots: negative ? [n ** 4] : [m ** 4, n ** 4], rejected: negative ? [m ** 4] : [], combine: 'max' },
    );
  });

const reciprocalPair: Template = (rng) => {
  const k = rng.int(2, 4);
  const n = nonZero(rng, -5, 5);
  const c = (k - 1) * n;
  const den = shift(c);
  const rhs = `\\frac{${k * k + 1}}{${k}}`;
  const best = Math.max(n, -k * n);
  const steps = [
    `**Substitute** $u = \\frac{x}{${den}}$; the second fraction is $\\frac{1}{u}$: $u + \\frac{1}{u} = ${rhs}$`,
    `Spot that $${k} + \\frac{1}{${k}} = ${rhs}$: $u = ${k}$ or $u = \\frac{1}{${k}}$`,
    `$\\frac{x}{${den}} = ${k}$ gives $x = ${-k * n}$; $\\frac{x}{${den}} = \\frac{1}{${k}}$ gives $x = ${n}$. The larger is ${best}`,
  ];
  return build('substitution', `recpair:${k}:${n}`, `Find the larger solution of $\\frac{x}{${den}} + \\frac{${den}}{x} = ${rhs}$`, num(best), steps, {
    eq: `x/(x + (${c})) + (x + (${c}))/x = ${k * k + 1}/${k}`,
    roots: [n, -k * n],
    combine: 'max',
  });
};

const fourConsecutive: Template = (rng) => {
  const m = rng.int(1, 4);
  const a = rng.int(-4, 4);
  const N = m * (m + 1) * (m + 2) * (m + 3);
  const f = (c: number) => (c === 0 ? 'x' : `(${shift(c)})`);
  const outer = sum([[1, 'x^2'], [2 * a + 3, 'x'], [a * (a + 3), '']]).tex;
  const u1 = m * (m + 3);
  const steps = [
    `**Pair the outer and inner factors:** $${f(a)}${f(a + 3)} = ${outer}$, and $${f(a + 1)}${f(a + 2)}$ is that plus 2`,
    `**Substitute** $u = ${outer}$: $u(u + 2) = ${N}$, so $u = ${u1}$ or $u = ${-u1 - 2}$`,
    `$u = ${-u1 - 2}$ gives no real $x$ (negative discriminant); $u = ${u1}$ gives $x = ${m - a}$ or $x = ${-3 - m - a}$`,
    `The largest is ${m - a}`,
  ];
  return build(
    'substitution',
    `four:${m}:${a}`,
    `Find the largest real solution of $${[a, a + 1, a + 2, a + 3].map(f).join('')} = ${N}$`,
    num(m - a),
    steps,
    { eq: `(x + (${a}))*(x + (${a + 1}))*(x + (${a + 2}))*(x + (${a + 3})) = ${N}`, roots: [m - a, -3 - m - a], combine: 'max' },
  );
};

const LOG_RECIPROCAL: [c: number, k: number][] = [[2, 2], [3, 2], [2, 3], [5, 2], [4, 2]];

const logReciprocal: Template = (rng) => {
  const [c, k] = rng.pick(LOG_RECIPROCAL);
  const b = c ** k;
  const big = b ** k;
  const askBig = rng.next() < 0.6;
  const rhs = `\\frac{${k * k + 1}}{${k}}`;
  const which = askBig ? 'larger' : 'smaller';
  const steps = [
    `**Substitute** $u = \\log_{${b}} x$; then $\\log_x ${b} = \\frac{1}{u}$: $u + \\frac{1}{u} = ${rhs}$`,
    `Spot that $${k} + \\frac{1}{${k}} = ${rhs}$: $u = ${k}$ or $u = \\frac{1}{${k}}$`,
    `$x = ${b}^{${k}} = ${big}$ or $x = ${b}^{1/${k}} = ${c}$; the ${which} is ${askBig ? big : c}`,
  ];
  return build('substitution', `logrecip:${b}:${k}:${which}`, `Find the ${which} solution of $\\log_{${b}} x + \\log_x ${b} = ${rhs}$`, num(askBig ? big : c), steps, {
    eq: `log(x, ${b}) + log(${b}, x) = ${k * k + 1}/${k}`,
    roots: [big, c],
    combine: askBig ? 'max' : 'min',
  });
};

// ---------------------------------------------------------------- Radicals

const radicalExtraneous: Template = (rng) =>
  retry(() => {
    const b = rng.int(-6, 3);
    const r1 = rng.int(2 - b, 7 - b);
    const r2 = 1 - 2 * b - r1;
    const a = b * b - r1 * r2;
    if (a === 0) return undefined;
    const root = `\\sqrt{${shift(a)}}`;
    const isolate = rng.next() < 0.5;
    const tex = isolate ? `x - ${root} = ${-b}` : `${root} = ${shift(b)}`;
    const math = isolate ? `x - sqrt(x + (${a})) = ${-b}` : `sqrt(x + (${a})) = x + (${b})`;
    const steps = [
      ...(isolate ? [`**Isolate the root:** $${shift(b)} = ${root}$`] : []),
      `**Square both sides:** $${shift(a)} = ${sum([[1, 'x^2'], [2 * b, 'x'], [b * b, '']]).tex}$`,
      `$${sum([[1, 'x^2'], [2 * b - 1, 'x'], [b * b - a, '']]).tex} = 0$, so $${factorPair('x', r1, r2)} = 0$`,
      `**Check both:** at $x = ${r2}$ the side $${shift(b)}$ equals $${r2 + b}$, but a square root is never negative, so it's a fake root. Answer: $x = ${r1}$`,
    ];
    return build('radicals', `radext:${a}:${b}:${isolate ? 1 : 0}`, `Solve for $x$: $${tex}$`, num(r1), steps, {
      eq: math,
      roots: [r1],
      rejected: [r2],
    });
  });

const radicalConjugate: Template = (rng) => {
  const variant = rng.int(0, 2);
  if (variant === 0) {
    // √(x + a) − √x = d
    const m = rng.int(0, 6);
    const d = rng.int(1, 4);
    const n = m + d;
    const a = n * n - m * m;
    const steps = [
      `**Multiply by the conjugate** $\\sqrt{x + ${a}} + \\sqrt{x}$: the left side becomes $(x + ${a}) - x = ${a}$`,
      `So $${d}\\left(\\sqrt{x + ${a}} + \\sqrt{x}\\right) = ${a}$, i.e. $\\sqrt{x + ${a}} + \\sqrt{x} = ${a / d}$`,
      `Add this to the original: $2\\sqrt{x + ${a}} = ${d + a / d}$, so $\\sqrt{x + ${a}} = ${n}$`,
      `$x = ${n * n} - ${a} = ${m * m}$`,
    ];
    return build('radicals', `conj:${a}:${d}`, `Solve for $x$: $\\sqrt{x + ${a}} - \\sqrt{x} = ${d}$`, num(m * m), steps, {
      eq: `sqrt(x + ${a}) - sqrt(x) = ${d}`,
      roots: [m * m],
    });
  }
  if (variant === 1) {
    // √(x + a) + √(x − c) = s
    const m = rng.int(1, 5);
    const n = m + rng.int(1, 4);
    const c = rng.int(1, n * n - m * m - 1);
    const x = m * m + c;
    const a = n * n - x;
    const s = m + n;
    const steps = [
      `**Multiply by the conjugate** $\\sqrt{x + ${a}} - \\sqrt{x - ${c}}$: the left side becomes $(x + ${a}) - (x - ${c}) = ${a + c}$`,
      `So $\\sqrt{x + ${a}} - \\sqrt{x - ${c}} = \\frac{${a + c}}{${s}} = ${n - m}$`,
      `Add this to the original: $2\\sqrt{x + ${a}} = ${s + n - m}$, so $\\sqrt{x + ${a}} = ${n}$`,
      `$x = ${n * n} - ${a} = ${x}$`,
    ];
    return build('radicals', `conjsum:${a}:${c}:${s}`, `Solve for $x$: $\\sqrt{x + ${a}} + \\sqrt{x - ${c}} = ${s}$`, num(x), steps, {
      eq: `sqrt(x + ${a}) + sqrt(x - ${c}) = ${s}`,
      roots: [x],
    });
  }
  // √(x + a) = c + √x: squaring makes the x terms cancel.
  const c = rng.int(1, 3);
  const m = rng.int(1, 6);
  const a = c * c + 2 * c * m;
  const steps = [
    `**Square both sides:** $x + ${a} = ${c * c} + ${2 * c}\\sqrt{x} + x$`,
    `The $x$ terms cancel: $${2 * c}\\sqrt{x} = ${a - c * c}$, so $\\sqrt{x} = ${m}$`,
    `$x = ${m * m}$`,
  ];
  return build('radicals', `radcancel:${a}:${c}`, `Solve for $x$: $\\sqrt{x + ${a}} = ${c} + \\sqrt{x}$`, num(m * m), steps, {
    eq: `sqrt(x + ${a}) = ${c} + sqrt(x)`,
    roots: [m * m],
  });
};

const conjugateTelescope: Template = (rng) => {
  const a = rng.int(1, 3);
  const s = rng.int(a + 2, 10);
  const first = a * a;
  const last = s * s - 1;
  const term = (k: number) => `\\frac{1}{\\sqrt{${k}} + \\sqrt{${k + 1}}}`;
  const steps = [
    `**Multiply each term by its conjugate:** $\\frac{1}{\\sqrt{k} + \\sqrt{k+1}} \\cdot \\frac{\\sqrt{k+1} - \\sqrt{k}}{\\sqrt{k+1} - \\sqrt{k}} = \\sqrt{k+1} - \\sqrt{k}$`,
    `**The sum telescopes:** $(\\sqrt{${first + 1}} - \\sqrt{${first}}) + (\\sqrt{${first + 2}} - \\sqrt{${first + 1}}) + \\cdots = \\sqrt{${last + 1}} - \\sqrt{${first}}$`,
    `$= ${s} - ${a} = ${s - a}$`,
  ];
  const terms = Array.from({ length: last - first + 1 }, (_, i) => `1/(sqrt(${first + i}) + sqrt(${first + i + 1}))`);
  return build('radicals', `conjtele:${a}:${s}`, `Compute: $$${term(first)} + ${term(first + 1)} + \\cdots + ${term(last)}$$`, num(s - a), steps, {
    at: {},
    target: terms.join(' + '),
  });
};

const SQUARE_FREE = NON_SQUARES.filter((n) => sqrtTex(n).startsWith('\\sqrt'));

const rationalize: Template = (rng) =>
  retry(() => {
    const n = rng.pick(SQUARE_FREE);
    const m = rng.int(1, 5);
    const d = n - m * m;
    if (Math.abs(d) > 12) return undefined;
    const t = nonZero(rng, -3, 3);
    const c = d * t;
    const plus = rng.next() < 0.5; // denominator √n + m instead of √n − m
    const a = plus ? -t * m : t * m;
    const root = `\\sqrt{${n}}`;
    const conj = `${root} ${plus ? '-' : '+'} ${m}`;
    const steps = [
      `**Multiply top and bottom by the conjugate** $${conj}$: the bottom becomes $${n} - ${m * m} = ${d}$`,
      `$\\frac{${c}(${conj})}{${d}} = ${sum([[t, [root, '']], [a, '']]).tex}$`,
      `$a = ${a}$ and $b = ${t}$, so $a + b = ${a + t}$`,
    ];
    return build(
      'radicals',
      `rat:${c}:${n}:${m}:${plus ? '+' : '-'}`,
      `Write $\\frac{${c}}{${root} ${plus ? '+' : '-'} ${m}}$ as $a + b${root}$ with integers $a, b$. Find $a + b$.`,
      num(a + t),
      steps,
      { identity: [`(${c})/(sqrt(${n}) ${plus ? '+' : '-'} ${m})`, `${a} + (${t})*sqrt(${n})`], at: {}, target: String(a + t) },
    );
  });

// ---------------------------------------------------------------- Factoring

const groupingCubic: Template = (rng) => {
  const p = nonZero(rng, -6, 6);
  if (rng.next() < 0.6) {
    const q = rng.pick([2, 3, 4, 5, 6, 7].filter((v) => v !== Math.abs(p)));
    const eq = sum([[1, 'x^3'], [p, 'x^2'], [-q * q, 'x'], [-p * q * q, '']]);
    const roots = [-p, q, -q];
    const best = Math.max(...roots);
    const steps = [
      `**Group in pairs:** $x^2(${shift(p)}) - ${q * q}(${shift(p)}) = 0$`,
      `Factor out $(${shift(p)})$: $(${shift(p)})(x^2 - ${q * q}) = 0$`,
      `**Difference of squares:** $(${shift(p)})(x - ${q})(x + ${q}) = 0$, so $x = ${-p}, ${q}, ${-q}$; the largest is ${best}`,
    ];
    return build('factoring', `group:${p}:${q}`, `Find the largest solution of $${eq.tex} = 0$`, num(best), steps, {
      eq: `${eq.math} = 0`,
      roots,
      combine: 'max',
    });
  }
  const q = rng.int(1, 9);
  const eq = sum([[1, 'x^3'], [p, 'x^2'], [q, 'x'], [p * q, '']]);
  const steps = [
    `**Group in pairs:** $x^2(${shift(p)}) + ${q}(${shift(p)}) = 0$`,
    `Factor out $(${shift(p)})$: $(${shift(p)})(x^2 + ${q}) = 0$`,
    `$x^2 + ${q} = 0$ has no real solution, so $x = ${-p}$`,
  ];
  return build('factoring', `group2:${p}:${q}`, `Find the real solution of $${eq.tex} = 0$`, num(-p), steps, {
    eq: `${eq.math} = 0`,
    roots: [-p],
  });
};

const noDividing: Template = (rng) =>
  retry(() => {
    const variant = rng.int(0, 2);
    if (variant === 0) {
      // (x − a)(x + b) = c(x − a)
      const a = nonZero(rng, -6, 6);
      const b = nonZero(rng, -6, 6);
      const c = nonZero(rng, -6, 6);
      if (c - b === a) return undefined;
      const steps = [
        `**Don't divide by $(${shift(-a)})$**: it could be zero. Move everything to one side and factor it out`,
        `$(${shift(-a)})\\big[(${shift(b)}) - ${c < 0 ? `(${c})` : c}\\big] = 0$, so $(${shift(-a)})(${shift(b - c)}) = 0$`,
        `$x = ${a}$ or $x = ${c - b}$; their sum is ${a + c - b}`,
      ];
      return build(
        'factoring',
        `nodiv:${a}:${b}:${c}`,
        `Find the sum of all solutions of $(${shift(-a)})(${shift(b)}) = ${c}(${shift(-a)})$`,
        num(a + c - b),
        steps,
        { eq: `(x - (${a}))*(x + (${b})) = (${c})*(x - (${a}))`, roots: [a, c - b], combine: 'sum' },
      );
    }
    if (variant === 1) {
      // x³ = k²x
      const k = rng.int(2, 9);
      const askCount = rng.next() < 0.5;
      const steps = [
        `**Don't divide by $x$**: it could be zero. Factor instead: $x(x^2 - ${k * k}) = 0$`,
        `$x(x - ${k})(x + ${k}) = 0$, so $x = 0$, $${k}$ or $${-k}$`,
        askCount ? 'That is 3 solutions' : `Sum of squares: $0 + ${k * k} + ${k * k} = ${2 * k * k}$`,
      ];
      return build(
        'factoring',
        `nodivcube:${k}:${askCount ? 'n' : 's'}`,
        askCount ? `How many real solutions does $x^3 = ${k * k}x$ have?` : `Find the sum of the squares of all solutions of $x^3 = ${k * k}x$`,
        num(askCount ? 3 : 2 * k * k),
        steps,
        { eq: `x^3 = ${k * k}*x`, roots: [0, k, -k], target: askCount ? 'x' : 'x^2', combine: askCount ? 'count' : 'sum' },
      );
    }
    // x²(x − a) = k²(x − a)
    const a = nonZero(rng, -7, 7);
    const k = rng.int(1, 6);
    if (k === Math.abs(a)) return undefined;
    const steps = [
      `**Don't divide by $(${shift(-a)})$**: factor it out instead: $(${shift(-a)})(x^2 - ${k * k}) = 0$`,
      `$x = ${a}$ or $x = \\pm ${k}$`,
      `Sum: $${a} + ${k} - ${k} = ${a}$`,
    ];
    return build(
      'factoring',
      `nodivsq:${a}:${k}`,
      `Find the sum of all solutions of $x^2(${shift(-a)}) = ${k * k}(${shift(-a)})$`,
      num(a),
      steps,
      { eq: `x^2*(x - (${a})) = ${k * k}*(x - (${a}))`, roots: [a, k, -k], combine: 'sum' },
    );
  });

const rationalRoot: Template = (rng) =>
  retry(() => {
    const A = rng.pick([2, 3, 4]);
    const B = nonZero(rng, -5, 5);
    if (gcd(A, B) !== 1) return undefined;
    const [r, s] = distinctInts(rng, 2, -4, 4, [0]);
    const c2 = -(A * (r + s) + B);
    const c1 = A * r * s + B * (r + s);
    const c0 = -B * r * s;
    const eq = sum([[A, 'x^3'], [c2, 'x^2'], [c1, 'x'], [c0, '']]);
    const steps = [
      `**Rational root theorem:** a rational root is $\\pm\\frac{\\text{factor of } ${Math.abs(c0)}}{\\text{factor of } ${A}}$; try the integers first`,
      `$f(${r}) = 0$ and $f(${s}) = 0$, so those are the integer roots`,
      `**Vieta:** the three roots add up to $${fracTex(-c2, A)}$, so the third is $${fracTex(-c2, A)} - (${r}) - (${s}) = ${fracTex(B, A)}$`,
    ];
    return build(
      'factoring',
      `ratroot:${A}:${B}:${Math.min(r, s)}:${Math.max(r, s)}`,
      `$${eq.tex} = 0$ has two integer roots and one root that is not an integer. Find the non-integer root.`,
      frac(B, A),
      steps,
      { eq: `${eq.math} = 0`, roots: [r, s, B / A], combine: 'any' },
    );
  });

const specialProducts: Template = (rng) => {
  if (rng.next() < 0.5) {
    // a² − b² for nearby a, b
    const mid = rng.pick([50, 100, 200, 500, 1000]);
    const a = mid + rng.int(1, 9);
    const b = mid - rng.int(1, 9);
    const steps = [
      `**Difference of squares:** $${a}^2 - ${b}^2 = (${a} - ${b})(${a} + ${b})$`,
      `$= ${a - b} \\times ${a + b} = ${(a - b) * (a + b)}$`,
    ];
    return build('factoring', `dsq:${a}:${b}`, `Compute without a calculator: $$${a}^2 - ${b}^2$$`, num(a * a - b * b), steps, {
      at: {},
      target: `${a}^2 - ${b}^2`,
    });
  }
  // (n − k)(n + k) with n a round number
  const n = rng.pick([20, 30, 40, 50, 60, 70, 80, 90, 100]);
  const k = rng.int(1, 9);
  const steps = [
    `**Difference of squares:** $${n - k} \\times ${n + k} = (${n} - ${k})(${n} + ${k}) = ${n}^2 - ${k}^2$`,
    `$= ${n * n} - ${k * k} = ${n * n - k * k}$`,
  ];
  return build('factoring', `dsqmul:${n}:${k}`, `Compute without a calculator: $$${n - k} \\times ${n + k}$$`, num(n * n - k * k), steps, {
    at: {},
    target: `${n - k} * ${n + k}`,
  });
};

const cubeForms: Template = (rng) => {
  const [a, b] = distinctInts(rng, 2, -6, 7, [0]);
  const s = a + b;
  const p = a * b;
  const variant = s === 0 ? 1 : rng.int(0, 2);
  const at = { a, b };
  if (variant === 0) {
    const value = s ** 3 - 3 * p * s;
    const steps = [
      `**Sum of cubes in terms of $a + b$ and $ab$:** $a^3 + b^3 = (a + b)^3 - 3ab(a + b)$`,
      `$= ${paren(s)}^3 - 3 \\cdot ${paren(p)} \\cdot ${paren(s)} = ${s ** 3}${plusConst(-3 * p * s)} = ${value}$`,
    ];
    return build('factoring', `cubesum:${s}:${p}`, `If $a + b = ${s}$ and $ab = ${p}$, find $a^3 + b^3$.`, num(value), steps, { at, target: 'a^3 + b^3' });
  }
  if (variant === 1) {
    const d = a - b;
    const value = d ** 3 + 3 * p * d;
    const steps = [
      `**Difference of cubes in terms of $a - b$ and $ab$:** $a^3 - b^3 = (a - b)^3 + 3ab(a - b)$`,
      `$= ${paren(d)}^3 + 3 \\cdot ${paren(p)} \\cdot ${paren(d)} = ${d ** 3}${plusConst(3 * p * d)} = ${value}$`,
    ];
    return build('factoring', `cubediff:${d}:${p}`, `If $a - b = ${d}$ and $ab = ${p}$, find $a^3 - b^3$.`, num(value), steps, { at, target: 'a^3 - b^3' });
  }
  const C = a ** 3 + b ** 3;
  const steps = [
    `**Sum of cubes in terms of $a + b$ and $ab$:** $a^3 + b^3 = (a + b)^3 - 3ab(a + b)$`,
    `$${C} = ${s ** 3} - ${paren(3 * s)}ab$, so $${3 * s}ab = ${s ** 3 - C}$`,
    `$ab = ${p}$`,
  ];
  return build('factoring', `cubeback:${s}:${C}`, `If $a + b = ${s}$ and $a^3 + b^3 = ${C}$, find $ab$.`, num(p), steps, { at, target: 'a*b' });
};

const factorTheorem: Template = (rng) => {
  if (rng.next() < 0.5) {
    const r = nonZero(rng, -3, 3);
    const k = rng.int(-6, 6);
    const b = rng.int(-9, 9);
    const c = -(r ** 3 + k * r * r + b * r);
    const steps = [
      `**Factor theorem:** $(${shift(-r)})$ is a factor exactly when $x = ${r}$ is a root, so plug it in`,
      `$${sum([[r * r, 'k'], [r ** 3 + b * r + c, '']]).tex} = 0$`,
      `$k = ${k}$`,
    ];
    return build(
      'factoring',
      `factorthm:${r}:${b}:${c}`,
      `$(${shift(-r)})$ is a factor of $x^3 + kx^2${tail(sum([[b, 'x'], [c, '']]).tex)}$. Find $k$.`,
      num(k),
      steps,
      { eq: `(${r})^3 + x*(${r * r}) + (${b})*(${r}) + (${c}) = 0`, roots: [k] },
    );
  }
  const r = rng.pick([1, -1]);
  const n1 = rng.int(20, 99);
  const n2 = rng.int(3, n1 - 1);
  const alpha = nonZero(rng, -5, 5);
  const beta = rng.int(-9, 9);
  const poly = sum([[1, [`x^{${n1}}`, `x^${n1}`]], [alpha, [`x^{${n2}}`, `x^${n2}`]], [beta, '']]);
  const value = r ** n1 + alpha * r ** n2 + beta;
  const steps = [
    `**Remainder theorem:** dividing $p(x)$ by $${shift(-r)}$ leaves remainder $p(${r})$${r < 0 ? ' (even powers of $-1$ are $1$, odd powers are $-1$)' : ''}`,
    `$p(${r}) = ${r ** n1}${plusConst(alpha * r ** n2)}${beta ? plusConst(beta) : ''} = ${value}$`,
  ];
  return build('factoring', `remthm:${r}:${n1}:${n2}:${alpha}:${beta}`, `Find the remainder when $${poly.tex}$ is divided by $${shift(-r)}$.`, num(value), steps, {
    at: { x: r },
    target: poly.math,
  });
};

// ---------------------------------------------------------------- Fractions

const fractionRejected: Template = (rng) =>
  retry(() => {
    const p = nonZero(rng, -6, 6);
    const k = rng.int(-8, 10);
    if (k - p === p) return undefined;
    const den = shift(-p);
    const steps = [
      `**Clear the fraction:** multiply by $(${den})$, remembering $x \\ne ${p}$: $x^2 = ${p * p}${k ? `${plusConst(k)}(${den})` : ''}$`,
      `Move $${p * p}$ over and factor: $(${den})(${shift(p)}) = ${k}(${den})$`,
      `So $(${den})(${shift(p - k)}) = 0$: $x = ${p}$ or $x = ${k - p}$`,
      `$x = ${p}$ makes the denominator zero, so reject it. Answer: $x = ${k - p}$`,
    ];
    return build(
      'fractions',
      `fracrej:${p}:${k}`,
      `Solve for $x$: $\\frac{x^2}{${den}} = \\frac{${p * p}}{${den}}${k ? plusConst(k) : ''}$`,
      num(k - p),
      steps,
      { eq: `x^2/(x - (${p})) = ${p * p}/(x - (${p})) + (${k})`, roots: [k - p], rejected: [p] },
    );
  });

const fractionTwoTerms: Template = (rng) =>
  retry(() => {
    const c = nonZero(rng, -6, 6);
    const [r1, r2] = distinctInts(rng, 2, -8, 8, [0, -c]);
    if ((r1 * r2) % c !== 0) return undefined;
    const a = -(r1 * r2) / c;
    const b = r1 + r2 + c - a;
    if (a === 0 || b === 0) return undefined;
    const fracPart = (n: number, d: string, first: boolean) =>
      `${n < 0 ? (first ? '-' : ' - ') : first ? '' : ' + '}\\frac{${Math.abs(n)}}{${d}}`;
    const tex = `${fracPart(a, 'x', true)}${fracPart(b, shift(c), false)} = 1`;
    const best = Math.max(r1, r2);
    const steps = [
      `**Clear denominators:** multiply by $x(${shift(c)})$: $${a}(${shift(c)}) ${b < 0 ? '-' : '+'} ${coefX(Math.abs(b))} = x(${shift(c)})$`,
      `Collect on one side: $${sum([[1, 'x^2'], [c - a - b, 'x'], [-a * c, '']]).tex} = 0$, so $${factorPair('x', r1, r2)} = 0$`,
      `Neither root makes a denominator zero, so $x = ${r1}$ or $x = ${r2}$; the larger is ${best}`,
    ];
    return build('fractions', `frac2:${a}:${b}:${c}`, `Find the larger solution: $${tex}$`, num(best), steps, {
      eq: `(${a})/x + (${b})/(x + (${c})) = 1`,
      roots: [r1, r2],
      combine: 'max',
    });
  });

const fractionCancel: Template = (rng) =>
  retry(() => {
    const x0 = rng.int(-6, 8);
    const [b, d] = distinctInts(rng, 2, -6, 6, [x0]);
    const a = rng.int(-9, 9);
    if (x0 + a === 0) return undefined;
    const top = (x0 + a) * (x0 - d);
    if (top % (x0 - b) !== 0) return undefined;
    const c = top / (x0 - b) - x0;
    const coef = a - d - c + b;
    if (coef === 0 || (a === c && b === d)) return undefined;
    const steps = [
      `**Cross-multiply:** $(${shift(a)})(${shift(-d)}) = (${shift(c)})(${shift(-b)})$`,
      `Expand; the $x^2$ terms cancel: $${sum([[a - d, 'x'], [-a * d, '']]).tex} = ${sum([[c - b, 'x'], [-b * c, '']]).tex}$`,
      `$${coefX(coef)} = ${a * d - b * c}$, so $x = ${x0}$`,
    ];
    return build(
      'fractions',
      `fraccancel:${a}:${b}:${c}:${d}`,
      `Solve for $x$: $\\frac{${shift(a)}}{${shift(-b)}} = \\frac{${shift(c)}}{${shift(-d)}}$`,
      num(x0),
      steps,
      { eq: `(x + (${a}))/(x - (${b})) = (x + (${c}))/(x - (${d}))`, roots: [x0] },
    );
  });

const coverUp: Template = (rng) =>
  retry(() => {
    const [a, b] = distinctInts(rng, 2, -5, 5);
    const p = rng.int(1, 5);
    const q = rng.int(-9, 9);
    const [nA, dA, nB, dB] = [p * a + q, a - b, p * b + q, b - a];
    if (nA === 0 || nB === 0) return undefined;
    const askA = rng.next() < 0.5;
    const [name, at, other, n, d]: [string, number, number, number, number] = askA ? ['A', a, b, nA, dA] : ['B', b, a, nB, dB];
    const factor = (r: number) => (r === 0 ? 'x' : `(${shift(-r)})`);
    const steps = [
      `**Cover-up:** multiply both sides by $${factor(at)}$, then put $x = ${at}$; the other fraction vanishes`,
      `$${name} = \\frac{${p === 1 ? '' : p}(${at})${plusConst(q)}}{${at} - ${paren(other)}} = \\frac{${n}}{${d}} = ${fracTex(n, d)}$`,
    ];
    return build(
      'fractions',
      `coverup:${p}:${q}:${a}:${b}:${name}`,
      `Find $${name}$ (a fraction is fine): $$\\frac{${sum([[p, 'x'], [q, '']]).tex}}{${factor(a)}${factor(b)}} = \\frac{A}{${shift(-a)}} + \\frac{B}{${shift(-b)}}$$`,
      frac(n, d),
      steps,
      {
        identity: [`(${p}*x + (${q}))/((x - (${a}))*(x - (${b})))`, `(${nA}/${dA})/(x - (${a})) + (${nB}/${dB})/(x - (${b}))`],
        at: {},
        target: `${n}/${d}`,
      },
    );
  });

const telescoping: Template = (rng) => {
  const n = rng.int(5, 60);
  if (rng.next() < 0.5) {
    const steps = [
      `**Partial fractions:** $\\frac{1}{k(k+1)} = \\frac{1}{k} - \\frac{1}{k+1}$`,
      `**The sum telescopes:** $\\left(1 - \\frac{1}{2}\\right) + \\left(\\frac{1}{2} - \\frac{1}{3}\\right) + \\cdots + \\left(\\frac{1}{${n}} - \\frac{1}{${n + 1}}\\right) = 1 - \\frac{1}{${n + 1}}$`,
      `$= ${fracTex(n, n + 1)}$`,
    ];
    return build(
      'fractions',
      `tele1:${n}`,
      `Compute (a fraction is fine): $$\\frac{1}{1 \\cdot 2} + \\frac{1}{2 \\cdot 3} + \\cdots + \\frac{1}{${n} \\cdot ${n + 1}}$$`,
      frac(n, n + 1),
      steps,
      { at: {}, target: Array.from({ length: n }, (_, i) => `1/(${i + 1}*${i + 2})`).join(' + ') },
    );
  }
  const steps = [
    `**Partial fractions:** $\\frac{1}{(2k-1)(2k+1)} = \\frac{1}{2}\\left(\\frac{1}{2k-1} - \\frac{1}{2k+1}\\right)$`,
    `**The sum telescopes:** $\\frac{1}{2}\\left(1 - \\frac{1}{${2 * n + 1}}\\right)$`,
    `$= ${fracTex(n, 2 * n + 1)}$`,
  ];
  return build(
    'fractions',
    `tele2:${n}`,
    `Compute (a fraction is fine): $$\\frac{1}{1 \\cdot 3} + \\frac{1}{3 \\cdot 5} + \\cdots + \\frac{1}{${2 * n - 1} \\cdot ${2 * n + 1}}$$`,
    frac(n, 2 * n + 1),
    steps,
    { at: {}, target: Array.from({ length: n }, (_, i) => `1/(${2 * i + 1}*${2 * i + 3})`).join(' + ') },
  );
};

// ---------------------------------------------------------------- Absolute value

const absLinear: Template = (rng) =>
  retry(() => {
    const a = rng.int(-8, 8);
    const m = rng.pick([2, 3, 4, -2, -3]);
    const b = rng.int(-12, 12);
    const right = sum([[m, 'x'], [b, '']]);
    // Case x ≥ a: x − a = mx + b. Case x < a: a − x = mx + b.
    const cands: [number, number][] = [
      [a + b, 1 - m],
      [a - b, 1 + m],
    ];
    const works = ([n, d]: [number, number]) => Math.abs(n / d - a) === m * (n / d) + b;
    const valid = cands.filter(works);
    if (valid.length !== 1 || !Number.isInteger(valid[0][0] / valid[0][1])) return undefined;
    const fake = cands.find((cand) => !works(cand))!;
    const fakeX = fake[0] / fake[1];
    if (Math.abs(fakeX - valid[0][0] / valid[0][1]) < 1e-9) return undefined;
    const x = valid[0][0] / valid[0][1];
    const inner = shift(-a);
    const steps = [
      `**Split into cases.** If $x \\ge ${a}$: $${inner} = ${right.tex}$, so $x = ${fracTex(...cands[0])}$`,
      `If $x < ${a}$: $${a ? `${a} - x` : '-x'} = ${right.tex}$, so $x = ${fracTex(...cands[1])}$`,
      `**Check both** in the original: $x = ${fracTex(...fake)}$ fails (${m * fakeX + b < 0 ? 'the right side is negative there' : "it isn't in its case"}), so $x = ${x}$`,
    ];
    return build('absoluteValue', `abslin:${a}:${m}:${b}`, `Solve for $x$: $|${inner}| = ${right.tex}$`, num(x), steps, {
      eq: `abs(x - (${a})) = ${right.math}`,
      roots: [x],
      rejected: [fakeX],
    });
  });

const absTwo: Template = (rng) =>
  retry(() => {
    if (rng.next() < 0.5) {
      // |x − a| + |x − b| = c
      const [a, b] = distinctInts(rng, 2, -8, 8).sort((p, q) => p - q);
      const c = b - a + rng.int(1, 10);
      if ((a + b + c) % 2 !== 0) return undefined;
      const hi = (a + b + c) / 2;
      const lo = (a + b - c) / 2;
      const steps = [
        `**Think distances:** $|${shift(-a)}| + |${shift(-b)}|$ is the distance from $x$ to ${a} plus the distance to ${b}`,
        `Between ${a} and ${b} that total is always ${b - a}, less than ${c}, so $x$ is outside that interval`,
        `Right of ${b}: $(${shift(-a)}) + (${shift(-b)}) = ${c}$, so $2x = ${a + b + c}$ and $x = ${hi}$ (on the left, $x = ${lo}$). The larger is ${hi}`,
      ];
      return build('absoluteValue', `abs2:${a}:${b}:${c}`, `Find the larger solution of $|${shift(-a)}| + |${shift(-b)}| = ${c}$`, num(hi), steps, {
        eq: `abs(x - (${a})) + abs(x - (${b})) = ${c}`,
        roots: [lo, hi],
        combine: 'max',
      });
    }
    // |x² − a| = b
    const k = rng.int(2, 6);
    const small = rng.next() < 0.4 ? -rng.int(1, 9) : rng.int(1, k - 1) ** 2;
    if ((k * k + small) % 2 !== 0) return undefined;
    const a = (k * k + small) / 2;
    const b = (k * k - small) / 2;
    const j = Math.sqrt(Math.max(small, 0));
    const steps = [
      `**Split into cases:** $x^2 - ${a} = ${b}$ or $x^2 - ${a} = -${b}$`,
      `So $x^2 = ${k * k}$ or $x^2 = ${small}$`,
      small < 0 ? `$x^2 = ${small}$ has no real solution, so $x = \\pm ${k}$; the largest is ${k}` : `$x = \\pm ${k}$ or $x = \\pm ${j}$; the largest is ${k}`,
    ];
    return build('absoluteValue', `abssq:${a}:${b}`, `Find the largest solution of $|x^2 - ${a}| = ${b}$`, num(k), steps, {
      eq: `abs(x^2 - ${a}) = ${b}`,
      roots: small > 0 ? [k, -k, j, -j] : [k, -k],
      combine: 'max',
    });
  });

const absBothSides: Template = (rng) =>
  retry(() => {
    const p = rng.pick([2, 3, 4, -2, -3]);
    const [x1, x2] = distinctInts(rng, 2, -6, 6);
    // px − a = x − b at x1 and px − a = −(x − b) at x2
    const twoA = (p - 1) * x1 + (p + 1) * x2;
    const twoB = (p + 1) * x2 - (p - 1) * x1;
    if (twoA % 2 !== 0 || twoB % 2 !== 0) return undefined;
    const [a, b] = [twoA / 2, twoB / 2];
    const left = sum([[p, 'x'], [-a, '']]);
    const right = shift(-b);
    const askSum = rng.next() < 0.5;
    const steps = [
      `**Equal absolute values:** $|A| = |B|$ means $A = B$ or $A = -B$ (nothing to reject: both sides are already $\\ge 0$)`,
      `$${left.tex} = ${right}$ gives $x = ${x1}$`,
      `$${left.tex} = -(${right})$ gives $x = ${x2}$`,
      askSum ? `Sum: $${x1} + ${paren(x2)} = ${x1 + x2}$` : `The larger is ${Math.max(x1, x2)}`,
    ];
    return build(
      'absoluteValue',
      `absboth:${p}:${a}:${b}:${askSum ? 's' : 'm'}`,
      `Find the ${askSum ? 'sum of all solutions' : 'larger solution'} of $|${left.tex}| = |${right}|$`,
      num(askSum ? x1 + x2 : Math.max(x1, x2)),
      steps,
      { eq: `abs(${left.math}) = abs(x - (${b}))`, roots: [x1, x2], combine: askSum ? 'sum' : 'max' },
    );
  });

const absQuadratic: Template = (rng) =>
  retry(() => {
    const p = rng.int(1, 7);
    const q = rng.int(-4, 7);
    if (q === p || q === -p) return undefined;
    const eq = sum([[1, 'x^2'], [-(p + q), ['|x|', 'abs(x)']], [p * q, '']]);
    const roots = [...new Set([p, -p, ...(q >= 0 ? [q, -q] : [])])];
    const askCount = rng.next() < 0.5;
    const steps = [
      `**Substitute** $u = |x|$, using $x^2 = |x|^2$: $${quadU('u', p + q, p * q)} = 0$`,
      `Factor: $${factorPair('u', p, q)} = 0$, so $u = ${p}$ or $u = ${q}$`,
      q < 0
        ? `$|x| = ${q}$ is impossible; $|x| = ${p}$ gives $x = \\pm ${p}$`
        : q === 0
          ? `$|x| = 0$ gives $x = 0$; $|x| = ${p}$ gives $x = \\pm ${p}$`
          : `$|x| = ${p}$ gives $x = \\pm ${p}$; $|x| = ${q}$ gives $x = \\pm ${q}$`,
      askCount ? `That is ${roots.length} solutions` : `The largest is ${Math.max(p, q)}`,
    ];
    return build(
      'absoluteValue',
      `absquad:${p}:${q}:${askCount ? 'n' : 'm'}`,
      askCount ? `How many real solutions does $${eq.tex} = 0$ have?` : `Find the largest solution of $${eq.tex} = 0$`,
      num(askCount ? roots.length : Math.max(p, q)),
      steps,
      { eq: `${eq.math} = 0`, roots, combine: askCount ? 'count' : 'max' },
    );
  });

const absInequality: Template = (rng) => {
  const a = rng.int(1, 4);
  const b = rng.int(-12, 12);
  const c = rng.int(1, 15);
  const strict = rng.next() < 0.5;
  const [lo, hi] = [(b - c) / a, (b + c) / a];
  const first = strict ? Math.floor(lo) + 1 : Math.ceil(lo);
  const last = strict ? Math.ceil(hi) - 1 : Math.floor(hi);
  const count = Math.max(0, last - first + 1);
  const inner = sum([[a, 'x'], [-b, '']]);
  const op = strict ? '<' : '\\le';
  const steps = [
    `**Unpack the absolute value:** $-${c} ${op} ${inner.tex} ${op} ${c}$`,
    `Solve for $x$: $${fracTex(b - c, a)} ${op} x ${op} ${fracTex(b + c, a)}$`,
    count ? `The integers are ${first} to ${last}: that is ${count}` : 'No integer fits, so the answer is 0',
  ];
  return build('absoluteValue', `absineq:${a}:${b}:${c}:${strict ? 'lt' : 'le'}`, `How many integers $x$ satisfy $|${inner.tex}| ${op} ${c}$?`, num(count), steps, {
    eq: `abs(${inner.math}) ${strict ? '<' : '<='} ${c}`,
    integers: [Math.floor(lo) - 5, Math.ceil(hi) + 5],
  });
};

// ---------------------------------------------------------------- Exponents and logs

const sameBase: Template = (rng) =>
  retry(() => {
    const B = rng.pick([2, 3, 5]);
    const maxPow = B === 2 ? 5 : B === 3 ? 3 : 2;
    const [m, nAbs] = distinctInts(rng, 2, 1, maxPow);
    const n = rng.next() < 0.3 ? -nAbs : nAbs;
    const x0 = rng.int(-3, 5);
    const p = rng.int(-3, 3);
    const q = rng.int(1, 3);
    const r = (m * (x0 + p) - n * q * x0) / n;
    if (!Number.isInteger(r) || m === n * q) return undefined;
    const left = B ** m;
    const rightTex = n > 0 ? `${B ** n}` : `\\left(\\frac{1}{${B ** -n}}\\right)`;
    const rightMath = n > 0 ? `${B ** n}` : `(1/${B ** -n})`;
    const e1 = shift(p);
    const e2 = r ? `${coefX(q)}${plusConst(r)}` : coefX(q);
    const times = (k: number, e: string) => (k === 1 ? e : `${k}(${e})`);
    const sameBase = [m > 1 ? `$${left} = ${B}^{${m}}$` : '', `$${rightTex} = ${B}^{${n}}$`].filter(Boolean).join(' and ');
    const steps = [
      `**Same base:** ${sameBase}`,
      `So $${B}^{${times(m, e1)}} = ${B}^{${times(n, e2)}}$; equate the exponents: $${times(m, e1)} = ${times(n, e2)}$`,
      `$${sum([[m, 'x'], [m * p, '']]).tex} = ${sum([[n * q, 'x'], [n * r, '']]).tex}$, so $x = ${x0}$`,
    ];
    return build('exponentsLogs', `samebase:${left}:${n}:${p}:${q}:${r}`, `Solve for $x$: $${left}^{${e1}} = ${rightTex}^{${e2}}$`, num(x0), steps, {
      eq: `${left}^(x + (${p})) = ${rightMath}^(${q}*x + (${r}))`,
      roots: [x0],
    });
  });

const LOG_POWERS: [number, number][] = [
  [2, 3], [2, 4], [2, 5], [2, 6], [3, 2], [3, 3], [3, 4], [6, 2], [10, 2], [12, 2],
];

const logEquation: Template = (rng) =>
  retry(() => {
    if (rng.next() < 0.6) {
      // log_B x + log_B(x − a) = k
      const [B, k] = rng.pick(LOG_POWERS);
      const P = B ** k;
      const divisors = Array.from({ length: Math.floor(Math.sqrt(P)) }, (_, i) => i + 1).filter((s) => P % s === 0 && s * s < P);
      const s = rng.pick(divisors);
      const r = P / s;
      const a = r - s;
      const log = (arg: string) => `\\log_{${B}} ${arg}`;
      const steps = [
        `**Combine the logs:** $${log(`\\big(x(x - ${a})\\big)`)} = ${k}$`,
        `**Exponentiate:** $x(x - ${a}) = ${B}^{${k}} = ${P}$, so $${sum([[1, 'x^2'], [-a, 'x'], [-P, '']]).tex} = 0$`,
        `$${factorPair('x', r, -s)} = 0$, so $x = ${r}$ or $x = ${-s}$`,
        `**Check:** $x = ${-s}$ makes $\\log_{${B}} x$ undefined, so $x = ${r}$`,
      ];
      return build('exponentsLogs', `logsum:${B}:${k}:${a}`, `Solve for $x$: $${log('x')} + ${log(`(x - ${a})`)} = ${k}$`, num(r), steps, {
        eq: `log(x, ${B}) + log(x - ${a}, ${B}) = ${k}`,
        roots: [r],
        rejected: [-s],
      });
    }
    // log_B(x + a) − log_B(x − c) = k
    const [B, k] = rng.pick([[2, 1], [2, 2], [2, 3], [3, 1], [3, 2], [5, 1]] as const);
    const P = B ** k;
    const c = rng.int(1, 6);
    const x0 = c + rng.int(1, 6);
    const a = P * (x0 - c) - x0;
    if (a === 0 || x0 + a <= 0) return undefined;
    const steps = [
      `**Combine the logs:** $\\log_{${B}} \\frac{${shift(a)}}{x - ${c}} = ${k}$`,
      `**Exponentiate:** $\\frac{${shift(a)}}{x - ${c}} = ${P}$, so $${shift(a)} = ${P}x - ${P * c}$`,
      `$${coefX(P - 1)} = ${a + P * c}$, so $x = ${x0}$`,
    ];
    return build(
      'exponentsLogs',
      `logdiff:${B}:${k}:${a}:${c}`,
      `Solve for $x$: $\\log_{${B}} (${shift(a)}) - \\log_{${B}} (x - ${c}) = ${k}$`,
      num(x0),
      steps,
      { eq: `log(x + (${a}), ${B}) - log(x - ${c}, ${B}) = ${k}`, roots: [x0] },
    );
  });

const lnBothSides: Template = (rng) => {
  const [a, b] = distinctInts(rng, 2, 2, 7, [4, 6]);
  if (rng.next() < 0.5) {
    // a^x = c · b^x
    const c = rng.int(2, 9);
    const x = Math.log(c) / (Math.log(a) - Math.log(b));
    const steps = [
      `**Take ln of both sides:** $x\\ln ${a} = \\ln ${c} + x\\ln ${b}$`,
      `**Collect the $x$ terms:** $x(\\ln ${a} - \\ln ${b}) = \\ln ${c}$`,
      `$x = \\frac{\\ln ${c}}{\\ln ${a} - \\ln ${b}}$ (type it as ln(${c})/(ln(${a}) - ln(${b})))`,
    ];
    return build('exponentsLogs', `lnboth:${a}:${b}:${c}`, `Solve for $x$ (exact form, using ln): $${a}^x = ${c} \\cdot ${b}^x$`, num(x, `$\\frac{\\ln ${c}}{\\ln ${a} - \\ln ${b}}$`), steps, {
      eq: `${a}^x = ${c}*${b}^x`,
      roots: [x],
    });
  }
  // a^(x+1) = b^x
  const x = Math.log(a) / (Math.log(b) - Math.log(a));
  const steps = [
    `**Take ln of both sides:** $(x + 1)\\ln ${a} = x\\ln ${b}$`,
    `**Collect the $x$ terms:** $x(\\ln ${b} - \\ln ${a}) = \\ln ${a}$`,
    `$x = \\frac{\\ln ${a}}{\\ln ${b} - \\ln ${a}}$ (type it as ln(${a})/(ln(${b}) - ln(${a})))`,
  ];
  return build('exponentsLogs', `lnshift:${a}:${b}`, `Solve for $x$ (exact form, using ln): $${a}^{x + 1} = ${b}^x$`, num(x, `$\\frac{\\ln ${a}}{\\ln ${b} - \\ln ${a}}$`), steps, {
    eq: `${a}^(x + 1) = ${b}^x`,
    roots: [x],
  });
};

const CHANGE_OF_BASE: [B: number, j: number, L: number][] = [
  [2, 2, 2], [2, 2, 4], [2, 2, 6], [2, 3, 3], [2, 3, 6], [3, 2, 2], [3, 2, 4], [3, 3, 3], [5, 2, 2],
];
const LOG_X: [x: number, p: number, q: number, A: number][] = [
  [4, 3, 2, 8], [9, 3, 2, 27], [16, 3, 4, 8], [8, 2, 3, 4], [27, 2, 3, 9], [25, 3, 2, 125],
  [16, 5, 4, 32], [4, 5, 2, 32], [64, 1, 3, 4], [64, 2, 3, 16], [81, 3, 4, 27], [32, 2, 5, 4],
];
const LOG_POWER: [B: number, k: number][] = [[2, 1], [2, 2], [2, 3], [3, 1], [3, 2], [5, 1], [10, 1]];

const logBases: Template = (rng) => {
  const variant = rng.int(0, 2);
  if (variant === 0) {
    // log_{B^j} x + log_B x = L(j+1)/j
    const [B, j, L] = rng.pick(CHANGE_OF_BASE);
    const rhs = L + L / j;
    const steps = [
      `**Change of base:** $\\log_{${B ** j}} x = \\frac{\\log_{${B}} x}{\\log_{${B}} ${B ** j}} = \\frac{\\log_{${B}} x}{${j}}$`,
      `With $u = \\log_{${B}} x$: $\\frac{u}{${j}} + u = ${rhs}$, so $\\frac{${j + 1}u}{${j}} = ${rhs}$ and $u = ${L}$`,
      `$x = ${B}^{${L}} = ${B ** L}$`,
    ];
    return build('exponentsLogs', `cob:${B}:${j}:${L}`, `Solve for $x$: $\\log_{${B ** j}} x + \\log_{${B}} x = ${rhs}$`, num(B ** L), steps, {
      eq: `log(x, ${B ** j}) + log(x, ${B}) = ${rhs}`,
      roots: [B ** L],
    });
  }
  if (variant === 1) {
    // log_x A = p/q
    const [x, p, q, A] = rng.pick(LOG_X);
    const steps = [
      `**Rewrite as a power:** $x^{${p}/${q}} = ${A}$`,
      `Raise both sides to the power $${fracTex(q, p)}$: $x = ${A}^{${fracTex(q, p)}}$`,
      `$x = ${x}$`,
    ];
    return build('exponentsLogs', `logx:${A}:${p}:${q}`, `Solve for $x$: $\\log_x ${A} = ${fracTex(p, q)}$`, num(x), steps, {
      eq: `log(${A}, x) = ${p}/${q}`,
      roots: [x],
    });
  }
  // x^(log_B x) = B^(k²)
  const [B, k] = rng.pick(LOG_POWER);
  const steps = [
    `**Take $\\log_{${B}}$ of both sides:** $\\log_{${B}} x \\cdot \\log_{${B}} x = ${k * k}$`,
    `$(\\log_{${B}} x)^2 = ${k * k}$, so $\\log_{${B}} x = \\pm ${k}$`,
    `$x = ${B}^{${k}}$ or $x = ${B}^{-${k}}$; the larger is ${B ** k}`,
  ];
  const logTex = B === 10 ? '\\log_{10} x' : `\\log_{${B}} x`;
  return build('exponentsLogs', `xlogx:${B}:${k}`, `Find the larger solution of $x^{${logTex}} = ${B ** (k * k)}$`, num(B ** k), steps, {
    eq: `x^log(x, ${B}) = ${B ** (k * k)}`,
    roots: [B ** k, B ** -k],
    combine: 'max',
  });
};

const factorPowers: Template = (rng) =>
  retry(() => {
    const B = rng.pick([2, 3, 5]);
    const j = rng.int(1, B === 5 ? 1 : 3);
    const i = rng.int(0, 1);
    const plus = rng.next() < 0.5;
    const factor = B ** (j + i) + (plus ? 1 : -1);
    const n = rng.int(i, B === 2 ? 6 : 3);
    const rhs = factor * B ** (n - i);
    if (rhs > 3000) return undefined;
    const low = i ? `${B}^{x - ${i}}` : `${B}^x`;
    const sign = plus ? '+' : '-';
    const steps = [
      `**Factor out the smallest power** $${low}$: $${low}\\left(${B}^{${j + i}} ${sign} 1\\right) = ${rhs}$`,
      `$${low} \\cdot ${factor} = ${rhs}$, so $${low} = ${rhs / factor} = ${B}^{${n - i}}$`,
      `$x = ${n}$`,
    ];
    return build('exponentsLogs', `factorpow:${B}:${j}:${i}:${sign}:${rhs}`, `Solve for $x$: $${B}^{x + ${j}} ${sign} ${low} = ${rhs}$`, num(n), steps, {
      eq: `${B}^(x + ${j}) ${sign} ${B}^(x - ${i}) = ${rhs}`,
      roots: [n],
    });
  });

const quadraticExponent: Template = (rng) =>
  retry(() => {
    const B = rng.pick([2, 3, 5]);
    const [r1, r2] = distinctInts(rng, 2, -3, 5);
    const s = r1 + r2;
    const e = -r1 * r2; // x² − sx = e
    if (s === 0 || Math.abs(e) > (B === 2 ? 8 : B === 3 ? 5 : 3)) return undefined;
    const rhsTex = e >= 0 ? String(B ** e) : `\\frac{1}{${B ** -e}}`;
    const rhsMath = e >= 0 ? String(B ** e) : `1/${B ** -e}`;
    const expo = sum([[1, 'x^2'], [-s, 'x']]);
    const steps = [
      `**Same base:** $${rhsTex} = ${B}^{${e}}$, so the exponents are equal: $${expo.tex} = ${e}$`,
      `$${quadU('x', s, -e)} = 0$, so $${factorPair('x', r1, r2)} = 0$`,
      `$x = ${r1}$ or $x = ${r2}$; the larger is ${Math.max(r1, r2)}`,
    ];
    return build('exponentsLogs', `quadexp:${B}:${s}:${e}`, `Find the larger solution of $${B}^{${expo.tex}} = ${rhsTex}$`, num(Math.max(r1, r2)), steps, {
      eq: `${B}^(${expo.math}) = ${rhsMath}`,
      roots: [r1, r2],
      combine: 'max',
    });
  });

/** Bases from the outside in, and the right-hand side: log_{b1}(log_{b2}(…x)) = k. */
const NESTED_LOGS: [bases: number[], k: number][] = [
  [[2, 3], 1], [[2, 2], 2], [[3, 2], 1], [[2, 3], 2], [[2, 5], 1], [[2, 10], 1], [[3, 3], 1], [[2, 4], 1], [[2, 2], 0], [[5, 2], 1],
  [[2, 3, 4], 0], [[3, 2, 2], 0], [[2, 2, 2], 1], [[2, 2, 3], 0],
];

const nestedLog: Template = (rng) => {
  const [bases, k] = rng.pick(NESTED_LOGS);
  // texs[i] is the expression inside the first i logs; texs[0] is the whole left side.
  const texs: string[] = [];
  let tex = 'x';
  let math = 'x';
  for (let i = bases.length - 1; i >= 0; i--) {
    tex = i === bases.length - 1 ? `\\log_{${bases[i]}} x` : `\\log_{${bases[i]}}\\left(${tex}\\right)`;
    math = `log(${math}, ${bases[i]})`;
    texs.unshift(tex);
  }
  texs.push('x');
  let value = k;
  const steps = bases.map((b, i) => {
    const next = b ** value;
    const line = `${i === 0 ? '**Peel off the outer log:** ' : 'Again: '}$${texs[i + 1]} = ${b}^{${value}} = ${next}$`;
    value = next;
    return line;
  });
  return build('exponentsLogs', `nestlog:${bases.join(',')}:${k}`, `Solve for $x$: $${texs[0]} = ${k}$`, num(value), steps, {
    eq: `${math} = ${k}`,
    roots: [value],
  });
};

const logPower: Template = (rng) => {
  const variant = rng.int(0, 2);
  if (variant === 0) {
    // (B^j)^{log_B c} = c^j
    const B = rng.pick([2, 3, 5]);
    const j = rng.int(2, 3);
    const c = rng.pick([2, 3, 5, 6, 7].filter((v) => v !== B));
    const steps = [
      `**Rewrite the base as a power of ${B}:** $${B ** j}^{\\log_{${B}} ${c}} = \\left(${B}^{\\log_{${B}} ${c}}\\right)^{${j}}$`,
      `$${B}^{\\log_{${B}} ${c}} = ${c}$, so the answer is $${c}^{${j}} = ${c ** j}$`,
    ];
    return build('exponentsLogs', `logpow:${B}:${j}:${c}`, `Compute: $$${B ** j}^{\\log_{${B}} ${c}}$$`, num(c ** j), steps, {
      at: {},
      target: `${B ** j}^log(${c}, ${B})`,
    });
  }
  if (variant === 1) {
    const j = rng.int(2, 3);
    const c = rng.int(2, 7);
    const steps = [`**Move the coefficient inside the log:** $${j}\\ln ${c} = \\ln ${c}^{${j}} = \\ln ${c ** j}$`, `$e^{\\ln ${c ** j}} = ${c ** j}$`];
    return build('exponentsLogs', `elog:${j}:${c}`, `Compute: $$e^{${j}\\ln ${c}}$$`, num(c ** j), steps, { at: {}, target: `e^(${j}*log(${c}))` });
  }
  // log_B c · log_c B^k = k
  const B = rng.pick([2, 3]);
  const k = rng.int(2, B === 2 ? 6 : 4);
  const c = rng.pick([3, 5, 6, 7, 10].filter((v) => v !== B));
  const steps = [
    `**Change of base:** $\\log_{${B}} ${c} = \\frac{\\ln ${c}}{\\ln ${B}}$ and $\\log_{${c}} ${B ** k} = \\frac{\\ln ${B ** k}}{\\ln ${c}}$`,
    `The $\\ln ${c}$ cancels: $\\frac{\\ln ${B ** k}}{\\ln ${B}} = \\log_{${B}} ${B ** k} = ${k}$`,
  ];
  return build('exponentsLogs', `logchain:${B}:${k}:${c}`, `Compute: $$\\log_{${B}} ${c} \\cdot \\log_{${c}} ${B ** k}$$`, num(k), steps, {
    at: {},
    target: `log(${c}, ${B})*log(${B ** k}, ${c})`,
  });
};

// ---------------------------------------------------------------- Structural

const vietaSystem: Template = (rng) => {
  const [x0, y0] = distinctInts(rng, 2, -8, 9).sort((p, q) => q - p);
  const s = x0 + y0;
  const variant = rng.int(0, 2);
  if (variant === 0) {
    const p = x0 * y0;
    const steps = [
      `**Sum and product:** $x$ and $y$ are the two roots of $${quadU('t', s, p)} = 0$`,
      `$${factorPair('t', x0, y0)} = 0$, so the roots are ${x0} and ${y0}`,
      `$x$ is the larger: $x = ${x0}$`,
    ];
    return build('structural', `vieta:${s}:${p}`, `If $x + y = ${s}$, $xy = ${p}$ and $x > y$, find $x$.`, num(x0), steps, {
      eq: `x*(${s} - x) = ${p}`,
      roots: [x0, y0],
      combine: 'max',
    });
  }
  if (variant === 1) {
    const q = x0 * x0 + y0 * y0;
    const askProduct = rng.next() < 0.5;
    const p = x0 * y0;
    const steps = [
      `**Square the sum:** $(x + y)^2 = x^2 + y^2 + 2xy$, so $${s * s} = ${q} + 2xy$`,
      `$xy = ${fracTex(s * s - q, 2)}$`,
      ...(askProduct ? [] : [`**Sum and product:** $x, y$ are the roots of $${quadU('t', s, p)} = 0$: ${x0} and ${y0}, so $x = ${x0}$`]),
    ];
    return build(
      'structural',
      `vietasq:${s}:${q}:${askProduct ? 'p' : 'x'}`,
      askProduct ? `If $x + y = ${s}$ and $x^2 + y^2 = ${q}$, find $xy$.` : `If $x + y = ${s}$, $x^2 + y^2 = ${q}$ and $x > y$, find $x$.`,
      num(askProduct ? p : x0),
      steps,
      { eq: `x^2 + (${s} - x)^2 = ${q}`, roots: [x0, y0], target: askProduct ? `x*(${s} - x)` : 'x', combine: askProduct ? 'same' : 'max' },
    );
  }
  const sum2 = s === 0 ? x0 + y0 + 1 : s; // x + y must be nonzero to divide by it
  const y1 = sum2 - x0;
  const d = x0 * x0 - y1 * y1;
  const steps = [
    `**Difference of squares:** $x^2 - y^2 = (x + y)(x - y)$, so $${sum2}(x - y) = ${d}$ and $x - y = ${d / sum2}$`,
    `Add $x + y = ${sum2}$ and $x - y = ${d / sum2}$: $2x = ${sum2 + d / sum2}$`,
    `$x = ${x0}$`,
  ];
  return build('structural', `dsqsys:${sum2}:${d}`, `If $x + y = ${sum2}$ and $x^2 - y^2 = ${d}$, find $x$.`, num(x0), steps, {
    eq: `x^2 - (${sum2} - x)^2 = ${d}`,
    roots: [x0],
  });
};

const sumOfSquaresZero: Template = (rng) => {
  const h = nonZero(rng, -6, 6);
  const k = nonZero(rng, -6, 6);
  const eq = sum([[1, 'x^2'], [-2 * h, 'x'], [1, 'y^2'], [-2 * k, 'y'], [h * h + k * k, '']]);
  const [askTex, askMath, value] = rng.pick([
    ['x + y', 'x + y', h + k],
    ['xy', 'x*y', h * k],
    ['x - y', 'x - y', h - k],
  ] as const);
  const steps = [
    `**Complete the square in $x$ and in $y$:** $(${shift(-h)})^2 + (${shift(-k, 'y')})^2 = 0$`,
    `Squares can't be negative, so both are zero: $x = ${h}$, $y = ${k}$`,
    `$${askTex} = ${value}$`,
  ];
  return build('structural', `sos:${h}:${k}:${askMath}`, `Real numbers $x, y$ satisfy $${eq.tex} = 0$. Find $${askTex}$.`, num(value), steps, {
    identity: [eq.math, `(x - (${h}))^2 + (y - (${k}))^2`],
    at: { x: h, y: k },
    target: askMath,
  });
};

const PAIRS: [number, number][] = [[2, 3], [2, 5], [3, 4], [3, 5], [2, 7]];
const TRIPLES: [number, number, number][] = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [6, 8, 10], [7, 24, 25]];

const guessAndProve: Template = (rng) => {
  const variant = rng.int(0, 3);
  if (variant === 0) {
    const [a, b] = rng.pick(PAIRS);
    const n = rng.int(1, b === 7 ? 2 : 3);
    const rhs = a ** n + b ** n;
    const steps = [
      `**Guess:** $x = ${n}$ works, since $${a}^{${n}} + ${b}^{${n}} = ${rhs}$`,
      `**Prove it's the only one:** $${a}^x$ and $${b}^x$ both increase, so the left side hits ${rhs} exactly once`,
    ];
    return build('structural', `guess:${a}:${b}:${n}`, `Solve for $x$: $${a}^x + ${b}^x = ${rhs}$`, num(n), steps, {
      eq: `${a}^x + ${b}^x = ${rhs}`,
      roots: [n],
    });
  }
  if (variant === 1) {
    const [a, b, c] = rng.pick(TRIPLES);
    const steps = [
      `**Guess:** $x = 2$ works, since $${a}^2 + ${b}^2 = ${c}^2$`,
      `**Prove it's the only one:** divide by $${c}^x$: $\\left(\\frac{${a}}{${c}}\\right)^x + \\left(\\frac{${b}}{${c}}\\right)^x = 1$. Both terms decrease, so there is one solution`,
    ];
    return build('structural', `pyth:${a}:${b}:${c}`, `Solve for $x$: $${a}^x + ${b}^x = ${c}^x$`, num(2), steps, {
      eq: `${a}^x + ${b}^x = ${c}^x`,
      roots: [2],
    });
  }
  if (variant === 2) {
    const a = rng.int(1, 6);
    const k = rng.int(1, 4);
    const rhs = k ** 3 + a * k;
    const steps = [
      `**Guess:** $x = ${k}$ works: $${k ** 3} + ${a * k} = ${rhs}$`,
      `**Prove it's the only one:** $x^3$ and $${coefX(a)}$ both increase, so the left side hits ${rhs} once`,
    ];
    return build('structural', `cubeguess:${a}:${k}`, `Find the real solution of $x^3 + ${coefX(a)} = ${rhs}$`, num(k), steps, {
      eq: `x^3 + ${a}*x = ${rhs}`,
      roots: [k],
    });
  }
  const k = rng.int(1, 6);
  const rhs = 2 ** k + k;
  const steps = [`**Guess:** $x = ${k}$ works: $2^{${k}} + ${k} = ${rhs}$`, `**Prove it's the only one:** $2^x + x$ is increasing`];
  return build('structural', `expguess:${k}`, `Solve for $x$: $2^x + x = ${rhs}$`, num(k), steps, { eq: `2^x + x = ${rhs}`, roots: [k] });
};

const reciprocalSums: Template = (rng) => {
  const variant = rng.int(0, 3);
  const plusRoots = (t: number) => [(t + Math.sqrt(t * t - 4)) / 2, (t - Math.sqrt(t * t - 4)) / 2];
  if (variant === 0) {
    const t = rng.int(3, 8);
    const steps = [
      `**Square both sides:** $x^2 + 2 + \\frac{1}{x^2} = ${t * t}$ (the cross term is $2 \\cdot x \\cdot \\frac{1}{x} = 2$)`,
      `$x^2 + \\frac{1}{x^2} = ${t * t - 2}$`,
    ];
    return build('structural', `recsq:${t}`, `If $x + \\frac{1}{x} = ${t}$, find $x^2 + \\frac{1}{x^2}$.`, num(t * t - 2), steps, {
      eq: `x + 1/x = ${t}`,
      roots: plusRoots(t),
      target: 'x^2 + 1/x^2',
      combine: 'same',
    });
  }
  if (variant === 1) {
    const t = rng.int(1, 7);
    const steps = [
      `**Square both sides:** $x^2 - 2 + \\frac{1}{x^2} = ${t * t}$`,
      `$x^2 + \\frac{1}{x^2} = ${t * t + 2}$`,
    ];
    const r = Math.sqrt(t * t + 4);
    return build('structural', `recdiff:${t}`, `If $x - \\frac{1}{x} = ${t}$, find $x^2 + \\frac{1}{x^2}$.`, num(t * t + 2), steps, {
      eq: `x - 1/x = ${t}`,
      roots: [(t + r) / 2, (t - r) / 2],
      target: 'x^2 + 1/x^2',
      combine: 'same',
    });
  }
  if (variant === 2) {
    const t = rng.int(3, 5);
    const steps = [
      `**Cube both sides:** $\\left(x + \\frac{1}{x}\\right)^3 = x^3 + \\frac{1}{x^3} + 3\\left(x + \\frac{1}{x}\\right)$`,
      `$${t ** 3} = x^3 + \\frac{1}{x^3} + ${3 * t}$, so $x^3 + \\frac{1}{x^3} = ${t ** 3 - 3 * t}$`,
    ];
    return build('structural', `reccube:${t}`, `If $x + \\frac{1}{x} = ${t}$, find $x^3 + \\frac{1}{x^3}$.`, num(t ** 3 - 3 * t), steps, {
      eq: `x + 1/x = ${t}`,
      roots: plusRoots(t),
      target: 'x^3 + 1/x^3',
      combine: 'same',
    });
  }
  const t = rng.int(3, 7);
  const s = t * t - 2;
  const steps = [
    `**Work backwards:** $\\left(x + \\frac{1}{x}\\right)^2 = x^2 + \\frac{1}{x^2} + 2 = ${s + 2}$`,
    `$x > 0$, so $x + \\frac{1}{x} = \\sqrt{${s + 2}} = ${t}$`,
  ];
  return build('structural', `recback:${t}`, `If $x > 0$ and $x^2 + \\frac{1}{x^2} = ${s}$, find $x + \\frac{1}{x}$.`, num(t), steps, {
    eq: `x^2 + 1/x^2 = ${s}`,
    roots: plusRoots(t),
    domain: [0, Infinity],
    target: 'x + 1/x',
    combine: 'same',
  });
};

const ratioTrick: Template = (rng) =>
  retry(() => {
    const p = rng.int(1, 5);
    const q = rng.int(1, 4);
    if (gcd(p, q) !== 1) return undefined;
    const [a, b, c, d] = [nonZero(rng, -4, 5), nonZero(rng, -4, 5), nonZero(rng, -4, 5), nonZero(rng, -4, 5)];
    const top = a * p + b * q;
    const bottom = c * p + d * q;
    if (top === 0 || bottom === 0 || a * d === b * c) return undefined;
    const numer = sum([[a, 'x'], [b, 'y']]).tex;
    const denom = sum([[c, 'x'], [d, 'y']]).tex;
    const r = fracTex(p, q);
    const steps = [
      `**Divide top and bottom by $y$:** $\\frac{${sum([[a, '\\frac{x}{y}'], [b, '']]).tex}}{${sum([[c, '\\frac{x}{y}'], [d, '']]).tex}}$`,
      `Put in $\\frac{x}{y} = ${r}$${q > 1 ? ` (or just use $x = ${p}$, $y = ${q}$)` : ''}: $\\frac{${top}}{${bottom}} = ${fracTex(top, bottom)}$`,
    ];
    return build(
      'structural',
      `ratio:${p}/${q}:${a}:${b}:${c}:${d}`,
      `If $\\frac{x}{y} = ${r}$, find $\\frac{${numer}}{${denom}}$ (a fraction like 7/5 is fine)`,
      frac(top, bottom),
      steps,
      { at: { x: p, y: q }, target: `(${a}*x + (${b})*y)/(${c}*x + (${d})*y)` },
    );
  });

const exponentRewrite: Template = (rng) => {
  const B = rng.pick([2, 3]);
  const c = rng.pick(B === 2 ? [3, 5, 6, 7] : [2, 4, 5, 7]);
  const j = rng.int(2, B === 2 ? 3 : 2);
  const k = rng.pick([-1, 1, 2]);
  const value = c ** j * B ** (j * k);
  const display = k < 0 ? fracText(c ** j, B ** (-j * k)) : String(value);
  const steps = [
    `**Rewrite with base ${B}:** $${B ** j}^{a ${k < 0 ? '-' : '+'} ${Math.abs(k)}} = (${B}^{${j}})^{a ${k < 0 ? '-' : '+'} ${Math.abs(k)}} = (${B}^a)^{${j}} \\cdot ${B}^{${j * k}}$`,
    `$= ${c}^{${j}} \\cdot ${B}^{${j * k}} = ${k < 0 ? fracTex(c ** j, B ** (-j * k)) : value}$`,
  ];
  return build(
    'structural',
    `exprew:${B}:${c}:${j}:${k}`,
    `If $${B}^a = ${c}$, what is $${B ** j}^{a ${k < 0 ? '-' : '+'} ${Math.abs(k)}}$?${k < 0 ? ' (a fraction is fine)' : ''}`,
    num(value, display),
    steps,
    { at: { a: Math.log(c) / Math.log(B) }, target: `${B ** j}^(a + (${k}))` },
  );
};

const vietaRoots: Template = (rng) =>
  retry(() => {
    const s = rng.int(-9, 9);
    const p = nonZero(rng, -9, 9);
    const disc = s * s - 4 * p;
    // Real, irrational roots, so solving directly is the slow way.
    if (disc <= 0 || Number.isInteger(Math.sqrt(disc))) return undefined;
    const r = Math.sqrt(disc);
    const at = { a: (s + r) / 2, b: (s - r) / 2 };
    const asks: [tex: string, math: string, answer: AnswerSpec, work: string][] = [
      ['\\alpha^2 + \\beta^2', 'a^2 + b^2', num(s * s - 2 * p), `(\\alpha + \\beta)^2 - 2\\alpha\\beta = ${s * s}${plusConst(-2 * p)} = ${s * s - 2 * p}`],
      ['\\frac{1}{\\alpha} + \\frac{1}{\\beta}', '1/a + 1/b', frac(s, p), `\\frac{\\alpha + \\beta}{\\alpha\\beta} = ${fracTex(s, p)}`],
      ['(\\alpha - \\beta)^2', '(a - b)^2', num(disc), `(\\alpha + \\beta)^2 - 4\\alpha\\beta = ${s * s}${plusConst(-4 * p)} = ${disc}`],
      ['\\alpha^3 + \\beta^3', 'a^3 + b^3', num(s ** 3 - 3 * p * s), `(\\alpha + \\beta)^3 - 3\\alpha\\beta(\\alpha + \\beta) = ${s ** 3}${plusConst(-3 * p * s)} = ${s ** 3 - 3 * p * s}`],
      ['(\\alpha - 1)(\\beta - 1)', '(a - 1)*(b - 1)', num(p - s + 1), `\\alpha\\beta - (\\alpha + \\beta) + 1 = ${p}${plusConst(-s)} + 1 = ${p - s + 1}`],
      ['\\alpha^2\\beta + \\alpha\\beta^2', 'a^2*b + a*b^2', num(p * s), `\\alpha\\beta(\\alpha + \\beta) = ${paren(p)} \\cdot ${paren(s)} = ${p * s}`],
    ];
    const [tex, math, answer, work] = rng.pick(asks);
    const isFrac = answer.kind === 'numeric' && answer.display.includes('/');
    const steps = [
      `**Don't solve; use Vieta:** $\\alpha + \\beta = ${s}$ and $\\alpha\\beta = ${p}$`,
      `**Rewrite in terms of the sum and product:** $${tex} = ${work}$`,
    ];
    return build(
      'structural',
      `vietaroots:${s}:${p}:${math}`,
      `$\\alpha$ and $\\beta$ are the roots of $${quadU('x', s, p)} = 0$. Find $${tex}$${isFrac ? ' (a fraction is fine)' : ''}.`,
      answer,
      steps,
      { at, target: math },
    );
  });

const plugInValues: Template = (rng) =>
  retry(() => {
    const variant = rng.int(0, 2);
    if (variant === 0) {
      // Sum of the coefficients of (ax + b)^n (x + c)^m is p(1).
      const [a, b, c] = [rng.int(1, 3), nonZero(rng, -3, 3), nonZero(rng, -3, 3)];
      const [n, m] = [rng.int(3, 9), rng.int(1, 3)];
      const value = (a + b) ** n * (1 + c) ** m;
      if (Math.abs(value) > 5000) return undefined;
      const lin = sum([[a, 'x'], [b, '']]);
      const tex = `(${lin.tex})^{${n}}(${shift(c)})${m > 1 ? `^{${m}}` : ''}`;
      const steps = [
        `**Plug in $x = 1$:** the sum of the coefficients of $p(x)$ is $p(1)$`,
        `$p(1) = ${paren(a + b)}^{${n}} \\cdot ${paren(1 + c)}${m > 1 ? `^{${m}}` : ''} = ${value}$`,
      ];
      return build('structural', `coefsum:${a}:${b}:${n}:${c}:${m}`, `Find the sum of the coefficients of $${tex}$ once it is expanded.`, num(value), steps, {
        at: { x: 1 },
        target: `(${lin.math})^${n}*(x + (${c}))^${m}`,
      });
    }
    if (variant === 1) {
      // P(x) = A(x − r)² + B(x − r) + C for all x; ask C = P(r) or A + B + C = P(r + 1).
      const r = nonZero(rng, -4, 4);
      const [p2, p1, p0] = [rng.int(1, 4), rng.int(-9, 9), rng.int(-9, 9)];
      const [A, B, C] = [p2, 2 * p2 * r + p1, p2 * r * r + p1 * r + p0];
      const poly = sum([[p2, 'x^2'], [p1, 'x'], [p0, '']]);
      const askSum = rng.next() < 0.6;
      const at = askSum ? r + 1 : r;
      const steps = askSum
        ? [
            `**Plug in a value that makes it easy:** at $x = ${at}$, $${shift(-r)} = 1$, so the right side is $A + B + C$`,
            `The left side at $x = ${at}$: $${p2 * at * at + p1 * at + p0}$`,
          ]
        : [`**Plug in $x = ${r}$:** the $A$ and $B$ terms vanish, leaving $C$`, `The left side at $x = ${r}$: $C = ${C}$`];
      return build(
        'structural',
        `plug:${p2}:${p1}:${p0}:${r}:${askSum ? 's' : 'c'}`,
        `For all $x$, $${poly.tex} = A(${shift(-r)})^2 + B(${shift(-r)}) + C$. Find $${askSum ? 'A + B + C' : 'C'}$.`,
        num(askSum ? A + B + C : C),
        steps,
        { identity: [poly.math, `${A}*(x - (${r}))^2 + (${B})*(x - (${r})) + (${C})`], at: { x: at }, target: poly.math },
      );
    }
    // Even-power coefficients of (x + b)^n: (p(1) + p(−1)) / 2.
    const b = rng.pick([1, 2, 3, -2]);
    const n = rng.int(3, 6);
    const [p1, pm1] = [(1 + b) ** n, (b - 1) ** n];
    let value = 0;
    for (let k = 0; k <= n; k += 2) value += binomial(n, k) * b ** (n - k);
    const steps = [
      `**Plug in $x = 1$ and $x = -1$:** $p(1)$ adds every coefficient; $p(-1)$ flips the sign of the odd-power ones`,
      `$p(1) = ${p1}$ and $p(-1) = ${pm1}$`,
      `Even-power coefficients: $\\frac{${p1}${plusConst(pm1)}}{2} = ${value}$`,
    ];
    return build(
      'structural',
      `evencoef:${b}:${n}`,
      `Find the sum of the coefficients of the even powers of $x$ (including the constant term) in $(${shift(b)})^{${n}}$.`,
      num(value),
      steps,
      { at: {}, target: `((1 + (${b}))^${n} + ((${b}) - 1)^${n})/2` },
    );
  });

const selfSimilar: Template = (rng) => {
  const variant = rng.int(0, 6);
  if (variant <= 1) {
    const m = rng.int(2, 9);
    const a = m * (m - 1);
    const steps = [
      `**The expression contains itself:** call it $y$; then $y = \\sqrt{${a} + y}$`,
      `Square: $y^2 - y - ${a} = 0$, so $(y - ${m})(y + ${m - 1}) = 0$`,
      `$y > 0$, so $y = ${m}$`,
    ];
    return build('structural', `nestroot:${a}`, `Find the value of $$\\sqrt{${a} + \\sqrt{${a} + \\sqrt{${a} + \\cdots}}}$$`, num(m), steps, {
      eq: `x = sqrt(${a} + x)`,
      roots: [m],
      rejected: [1 - m],
    });
  }
  if (variant <= 3) {
    const m = rng.int(2, 9);
    const steps = [
      `**The expression contains itself:** under the first root is $x$ plus the whole expression, so $${m} = \\sqrt{x + ${m}}$`,
      `Square: $${m * m} = x + ${m}$, so $x = ${m * m - m}$`,
    ];
    return build('structural', `nestrootx:${m}`, `Solve for $x$: $$\\sqrt{x + \\sqrt{x + \\sqrt{x + \\cdots}}} = ${m}$$`, num(m * m - m), steps, {
      eq: `sqrt(x + ${m}) = ${m}`,
      roots: [m * m - m],
    });
  }
  if (variant <= 5) {
    const a = rng.int(1, 6);
    const best = (a + Math.sqrt(a * a + 4)) / 2;
    const tex = a % 2 === 0 ? `${a / 2} + ${sqrtTex((a * a) / 4 + 1)}` : `\\frac{${a} + ${sqrtTex(a * a + 4)}}{2}`;
    const steps = [
      `**The expression contains itself:** call it $y$; then $y = ${a} + \\frac{1}{y}$`,
      `Multiply by $y$: $y^2 - ${coefX(a, 'y')} - 1 = 0$`,
      `$y > 0$, so $y = \\frac{${a} + \\sqrt{${a * a + 4}}}{2}${a % 2 === 0 ? ` = ${tex}` : ''}$`,
    ];
    return build(
      'structural',
      `contfrac:${a}`,
      `Find the value of $$${a} + \\cfrac{1}{${a} + \\cfrac{1}{${a} + \\cdots}}$$`,
      num(best, `$${tex}$`),
      steps,
      { eq: `x = ${a} + 1/x`, roots: [best], domain: [0, Infinity] },
    );
  }
  const steps = [
    `**The tower contains itself:** the exponent on the bottom $x$ is the whole tower, which is 2, so $x^2 = 2$`,
    `$x > 0$, so $x = \\sqrt{2}$`,
  ];
  return build('structural', 'tower', 'Solve for $x > 0$: $$x^{x^{x^{\\cdots}}} = 2$$', num(Math.SQRT2, '$\\sqrt{2}$'), steps, {
    eq: 'x^2 = 2',
    roots: [Math.SQRT2],
    domain: [0, Infinity],
  });
};

// ---------------------------------------------------------------- Trig equations

const TRIG = {
  sin: { tex: '\\sin x', sq: '\\sin^2 x', math: 'sin(x)' },
  cos: { tex: '\\cos x', sq: '\\cos^2 x', math: 'cos(x)' },
} as const;

/** A quadratic in sin x or cos x, possibly disguised with sin² + cos² = 1 or a double angle. */
const trigQuadratic: Template = (rng) =>
  retry(() => {
    const fn = rng.pick(['sin', 'cos'] as const);
    const other = fn === 'sin' ? 'cos' : 'sin';
    // Values n/2 for u = fn(x); |n| > 2 is impossible.
    const [n1, n2] = distinctInts(rng, 2, -4, 4);
    if (Math.abs(n1) > 2 && Math.abs(n2) > 2) return undefined;
    const g = gcd(gcd(4, 2 * (n1 + n2)), n1 * n2);
    const [P, Q, R] = [4 / g, (-2 * (n1 + n2)) / g, (n1 * n2) / g];
    const disguise = rng.pick(['direct', 'pyth', 'double'] as const);
    if ((disguise === 'double' && P % 2 !== 0) || (disguise !== 'direct' && Q === 0)) return undefined;
    const f = TRIG[fn];
    const o = TRIG[other];
    const cos2x: [string, string] = ['\\cos 2x', 'cos(2*x)'];
    let terms: [number, [string, string]][];
    let constant: number;
    if (disguise === 'direct') {
      terms = [[P, [f.sq, `${f.math}^2`]], [Q, [f.tex, f.math]]];
      constant = R;
    } else if (disguise === 'pyth') {
      // P·f² = P − P·o², then negate so the squared term is positive.
      terms = [[P, [o.sq, `${o.math}^2`]], [-Q, [f.tex, f.math]]];
      constant = -(P + R);
    } else if (fn === 'sin') {
      // sin² x = (1 − cos 2x)/2
      terms = [[P / 2, cos2x], [-Q, [f.tex, f.math]]];
      constant = -(R + P / 2);
    } else {
      // cos² x = (1 + cos 2x)/2
      terms = [[P / 2, cos2x], [Q, [f.tex, f.math]]];
      constant = R + P / 2;
    }
    const lhs = sum(terms);
    const values = [n1, n2].sort((p, q) => Math.abs(p) - Math.abs(q));
    const units = values.map((n) => trigUnits(fn, n / 2));
    const all = [...new Set(units.flat())].sort((p, q) => p - q);
    if (!all.length) return undefined;
    const ask = rng.pick(['count', 'sum', 'max'] as const);
    const factor = (n: number) => (n === 0 ? 'u' : n % 2 === 0 ? `(${shift(-n / 2, 'u')})` : `(2u${plusConst(-n)})`);
    const quad = sum([[P, 'u^2'], [Q, 'u'], [R, '']]).tex;
    const identity = disguise === 'pyth' ? `${o.sq} = 1 - ${f.sq}` : fn === 'sin' ? '\\cos 2x = 1 - 2\\sin^2 x' : '\\cos 2x = 2\\cos^2 x - 1';
    const steps = [
      ...(disguise === 'direct' ? [] : [`**Write everything in $${f.tex}$** using $${identity}$`]),
      `${disguise === 'direct' ? '**Substitute**' : 'Substitute'} $u = ${f.tex}$: $${quad} = 0$, i.e. $${values.map(factor).join('')} = 0$`,
      ...values.map((n, i) =>
        units[i].length
          ? `$${f.tex} = ${fracTex(n, 2)}$: $x = ${angleList(units[i])}$`
          : `$${f.tex} = ${fracTex(n, 2)}$ is impossible, since $|${f.tex}| \\le 1$`,
      ),
      ask === 'count'
        ? `That is ${all.length} solution${all.length === 1 ? '' : 's'}`
        : ask === 'sum'
          ? `Sum: $${piTex(all.reduce((s, u) => s + u, 0), 12)}$`
          : `The largest is $${piTex(Math.max(...all), 12)}$`,
    ];
    const eqTex = `${lhs.tex} = ${-constant}`;
    const prompt =
      ask === 'count'
        ? `How many solutions does $${eqTex}$ have in $[0, 2\\pi)$?`
        : ask === 'sum'
          ? `Find the sum of all solutions of $${eqTex}$ in $[0, 2\\pi)$ (e.g. 3pi/2)`
          : `Find the largest solution of $${eqTex}$ in $[0, 2\\pi)$ (e.g. 5pi/6)`;
    return build('trig', `trigquad:${fn}:${disguise}:${n1}:${n2}:${ask}`, prompt, combineAngles(all, ask), steps, {
      eq: `${lhs.math} = ${-constant}`,
      roots: all.map((u) => u * UNIT),
      domain: FULL_TURN,
      combine: ask,
    });
  });

/** a sin x + b cos x with (a, b) giving a standard angle: [a tex, a, b tex, b, R tex, R, φ in π/12 units]. */
const AUX_PAIRS: [string, number, string, number, string, number, number][] = [
  ['', 1, '', 1, '\\sqrt{2}', Math.SQRT2, 3],
  ['', 1, '\\sqrt{3}', Math.sqrt(3), '2', 2, 4],
  ['\\sqrt{3}', Math.sqrt(3), '', 1, '2', 2, 2],
];
const AUX_RHS: Record<string, [string, number][]> = {
  '2': [['0', 0], ['1', 1], ['\\sqrt{2}', Math.SQRT2], ['\\sqrt{3}', Math.sqrt(3)], ['2', 2], ['-1', -1], ['-\\sqrt{2}', -Math.SQRT2], ['-\\sqrt{3}', -Math.sqrt(3)], ['-2', -2]],
  '\\sqrt{2}': [['0', 0], ['1', 1], ['\\sqrt{2}', Math.SQRT2], ['-1', -1], ['-\\sqrt{2}', -Math.SQRT2]],
};
const AMPLITUDES: [number, number][] = [[3, 4], [5, 12], [8, 15], [6, 8], [7, 24], [1, 2], [2, 3], [1, 3], [2, 5]];

const auxiliaryAngle: Template = (rng) => {
  if (rng.next() < 0.4) {
    // max / min of a sin x ± b cos x + c
    const [a, b0] = rng.pick(AMPLITUDES);
    const b = rng.pick([1, -1]) * b0;
    const c = rng.int(-5, 5);
    const askMax = rng.next() < 0.6;
    const R = Math.sqrt(a * a + b * b);
    const rTex = sqrtTex(a * a + b * b);
    const value = askMax ? c + R : c - R;
    const display = Number.isInteger(R)
      ? String(value)
      : askMax
        ? c ? `${c} + ${rTex}` : rTex
        : c ? `${c} - ${rTex}` : `-${rTex}`;
    const expr = `${a}\\sin x ${b < 0 ? '-' : '+'} ${Math.abs(b)}\\cos x${c ? plusConst(c) : ''}`;
    const steps = [
      `**Combine into one sine:** $${a}\\sin x ${b < 0 ? '-' : '+'} ${Math.abs(b)}\\cos x = R\\sin(x + \\varphi)$ with $R = \\sqrt{${a * a} + ${b * b}} = ${rTex}$`,
      `$\\sin$ ranges over $[-1, 1]$, so the ${askMax ? 'maximum' : 'minimum'} is $${display}$`,
    ];
    const peak = Math.atan2(a, b) + (askMax ? 0 : Math.PI);
    return build('trig', `auxmax:${a}:${b}:${c}:${askMax ? 'max' : 'min'}`, `What is the ${askMax ? 'maximum' : 'minimum'} value of $${expr}$?`, num(value, `$${display}$`), steps, {
      at: { x: peak },
      target: `${a}*sin(x) + (${b})*cos(x) + (${c})`,
    });
  }
  const [aTex, a, bTex, b, rTex, R, phi0] = rng.pick(AUX_PAIRS);
  const sign = rng.pick([1, -1]);
  const phi = sign * phi0;
  const [cTex, c] = rng.pick(AUX_RHS[rTex]);
  const theta = trigUnits('sin', c / R);
  const sols = [...new Set(theta.map((t) => mod24(t - phi)))].sort((p, q) => p - q);
  const ask = rng.pick(['min', 'max', 'sum'] as const);
  const op = sign > 0 ? '+' : '-';
  const lhs = `${aTex}\\sin x ${op} ${bTex}\\cos x`;
  const shifted = `x ${op} ${piTex(phi0, 12)}`;
  const steps = [
    `**Combine into one sine:** $${lhs} = ${rTex}\\sin\\left(${shifted}\\right)$, since $R = \\sqrt{${a * a < 2 ? 1 : 3} + ${b * b < 2 ? 1 : 3}} = ${rTex}$`,
    `So $\\sin\\left(${shifted}\\right) = \\frac{${cTex}}{${rTex}}$, giving $${shifted} = ${angleList(theta)}$ (plus multiples of $2\\pi$)`,
    `In $[0, 2\\pi)$: $x = ${angleList(sols)}$`,
  ];
  const what = ask === 'sum' ? 'sum of all solutions' : ask === 'min' ? 'smallest solution' : 'largest solution';
  return build('trig', `aux:${a.toFixed(2)}:${b.toFixed(2)}:${sign}:${cTex}:${ask}`, `Find the ${what} of $${lhs} = ${cTex}$ in $[0, 2\\pi)$ (e.g. 5pi/6)`, combineAngles(sols, ask), steps, {
    eq: `${a}*sin(x) + (${sign * b})*cos(x) = ${c}`,
    roots: sols.map((u) => u * UNIT),
    domain: FULL_TURN,
    combine: ask,
  });
};

/** Coefficient k in sin 2x = k sin x: [|k| as LaTeX, k]. */
const DOUBLE_K: [string, number][] = [
  ['1', 1], ['1', -1], ['\\sqrt{2}', Math.SQRT2], ['\\sqrt{2}', -Math.SQRT2], ['\\sqrt{3}', Math.sqrt(3)], ['\\sqrt{3}', -Math.sqrt(3)], ['2', 2], ['3', 3],
];

const doubleAngle: Template = (rng) => {
  const ask = rng.pick(['count', 'sum'] as const);
  const variant = rng.int(0, 2);
  let eqTex: string;
  let eqMath: string;
  let steps: string[];
  let all: number[];
  if (variant < 2) {
    // sin 2x = k sin x, or sin 2x = k cos x: factor out instead of dividing.
    const [absTex, k] = rng.pick(DOUBLE_K);
    const g = variant === 0 ? 'sin' : 'cos';
    const h = variant === 0 ? 'cos' : 'sin';
    const coef = `${k < 0 ? '-' : ''}${absTex === '1' ? '' : absTex}`;
    const half = `${k < 0 ? '-' : ''}${absTex === '2' ? '1' : `\\frac{${absTex}}{2}`}`;
    const zero = trigUnits(g, 0);
    const rest = trigUnits(h, k / 2);
    all = [...new Set([...zero, ...rest])].sort((p, q) => p - q);
    eqTex = `\\sin 2x = ${coef}\\${g} x`;
    eqMath = `sin(2*x) = (${k})*${g}(x)`;
    steps = [
      `**Double angle:** $\\sin 2x = 2\\sin x\\cos x$, so $2\\sin x\\cos x ${k < 0 ? '+' : '-'} ${absTex === '1' ? '' : absTex}\\${g} x = 0$`,
      `**Don't divide by $\\${g} x$** (it can be zero); factor it out: $\\${g} x\\,(2\\${h} x ${k < 0 ? '+' : '-'} ${absTex}) = 0$`,
      `$\\${g} x = 0$ gives $x = ${angleList(zero)}$`,
      rest.length ? `$\\${h} x = ${half}$ gives $x = ${angleList(rest)}$` : `$\\${h} x = ${half}$ is impossible`,
    ];
  } else {
    // cos 2x = ±cos x → 2c² ∓ c − 1 = 0 → (c ∓ 1)(2c ± 1) = 0
    const s = rng.pick([1, -1]);
    all = [...new Set([...trigUnits('cos', s), ...trigUnits('cos', -s / 2)])].sort((p, q) => p - q);
    eqTex = `\\cos 2x = ${s < 0 ? '-' : ''}\\cos x`;
    eqMath = `cos(2*x) = (${s})*cos(x)`;
    steps = [
      `**Double angle:** $\\cos 2x = 2\\cos^2 x - 1$, so $2\\cos^2 x ${s > 0 ? '-' : '+'} \\cos x - 1 = 0$`,
      `**Substitute** $u = \\cos x$: $(${shift(-s, 'u')})(2u ${s > 0 ? '+' : '-'} 1) = 0$, so $u = ${s}$ or $u = ${fracTex(-s, 2)}$`,
      `$x = ${angleList(all)}$`,
    ];
  }
  steps.push(ask === 'count' ? `That is ${all.length} solutions` : `Sum: $${piTex(all.reduce((s, u) => s + u, 0), 12)}$`);
  const prompt =
    ask === 'count' ? `How many solutions does $${eqTex}$ have in $[0, 2\\pi)$?` : `Find the sum of all solutions of $${eqTex}$ in $[0, 2\\pi)$ (e.g. 3pi)`;
  return build('trig', `double:${eqMath}:${ask}`, prompt, combineAngles(all, ask), steps, {
    eq: eqMath,
    roots: all.map((u) => u * UNIT),
    domain: FULL_TURN,
    combine: ask,
  });
};

// ---------------------------------------------------------------- Rearranging (answers are expressions)

const inVar = (v: string) => ` (type an expression in $${v}$)`;
const IN_Y = inVar('y');

const mobius: Template = (rng) =>
  retry(() => {
    const [a, b, c, d] = [nonZero(rng, -5, 6), nonZero(rng, -9, 9), rng.int(1, 6), nonZero(rng, -9, 9)];
    if (a * d === b * c) return undefined;
    const top = sum([[a, 'x'], [b, '']]).tex;
    const bottom = sum([[c, 'x'], [d, '']]).tex;
    const numer = d > 0 && b > 0 ? sum([[b, ''], [-d, 'y']]) : sum([[-d, 'y'], [b, '']]);
    const denom = sum([[c, 'y'], [-a, '']]);
    const steps = [
      `**Clear the fraction:** $y(${bottom}) = ${top}$, i.e. $${sum([[c, 'xy'], [d, 'y']]).tex} = ${top}$`,
      `**Collect the $x$ terms on one side:** $${sum([[c, 'xy'], [-a, 'x']]).tex} = ${numer.tex}$`,
      `**Factor out $x$:** $x(${denom.tex}) = ${numer.tex}$`,
      `**Divide:** $x = \\frac{${numer.tex}}{${denom.tex}}$`,
    ];
    return build(
      'rearranging',
      `mobius:${a}:${b}:${c}:${d}`,
      `Solve for $x$${IN_Y}: $$y = \\frac{${top}}{${bottom}}$$`,
      expr(`(${numer.math})/(${denom.math})`, ['y'], `$x = \\frac{${numer.tex}}{${denom.tex}}$`, { y: [-4, 4] }),
      steps,
      { eq: `y = (${a}*x + (${b}))/(${c}*x + (${d}))`, solveFor: 'x' },
    );
  });

const shiftedReciprocal: Template = (rng) => {
  const a = nonZero(rng, -5, 5);
  const b = nonZero(rng, -9, 9);
  const c = nonZero(rng, -6, 6);
  const fracPart = `${b < 0 ? ' - ' : ' + '}\\frac{${Math.abs(b)}}{${shift(c)}}`;
  const answerTex = `\\frac{${b}}{${shift(-a, 'y')}}${plusConst(-c)}`;
  const steps = [
    `**Isolate the fraction:** $${shift(-a, 'y')} = \\frac{${b}}{${shift(c)}}$`,
    `**Flip both sides** (or multiply across): $${shift(c)} = \\frac{${b}}{${shift(-a, 'y')}}$`,
    `$x = ${answerTex}$`,
  ];
  return build(
    'rearranging',
    `shrecip:${a}:${b}:${c}`,
    `Solve for $x$${IN_Y}: $$y = ${a}${fracPart}$$`,
    expr(`(${b})/(y - (${a})) - (${c})`, ['y'], `$x = ${answerTex}$`, { y: [-4, 4] }),
    steps,
    { eq: `y = ${a} + (${b})/(x + (${c}))`, solveFor: 'x' },
  );
};

const collectFactor: Template = (rng) =>
  retry(() => {
    const [a, b, c] = [nonZero(rng, -9, 9), nonZero(rng, -6, 6), nonZero(rng, -6, 6)];
    if (a === b * c) return undefined;
    const numer = sum([[c, 'y'], [-a, '']]);
    const steps = [
      `**Collect the $x$ terms on one side:** $xy ${b < 0 ? '+' : '-'} ${coefX(Math.abs(b))} = ${numer.tex}$`,
      `**Factor out $x$:** $x(${shift(-b, 'y')}) = ${numer.tex}$`,
      `**Divide:** $x = \\frac{${numer.tex}}{${shift(-b, 'y')}}$`,
    ];
    return build(
      'rearranging',
      `collect:${a}:${b}:${c}`,
      `Solve for $x$${IN_Y}: $$xy${plusConst(a)} = ${sum([[b, 'x'], [c, 'y']]).tex}$$`,
      expr(`(${numer.math})/(y - (${b}))`, ['y'], `$x = \\frac{${numer.tex}}{${shift(-b, 'y')}}$`, { y: [-4, 4] }),
      steps,
      { eq: `x*y + (${a}) = (${b})*x + (${c})*y`, solveFor: 'x' },
    );
  });

const rootOfRatio: Template = (rng) => {
  const a = rng.int(1, 6);
  const b = rng.int(1, 6);
  const numer = `${a} + ${coefX(b, 'y^2')}`;
  const steps = [
    `**Square both sides:** $y^2 = \\frac{x + ${a}}{x - ${b}}$`,
    `**Clear the fraction:** $y^2(x - ${b}) = x + ${a}$`,
    `**Collect the $x$ terms:** $xy^2 - x = ${numer}$`,
    `**Factor out $x$:** $x(y^2 - 1) = ${numer}$, so $x = \\frac{${numer}}{y^2 - 1}$`,
  ];
  return build(
    'rearranging',
    `rootratio:${a}:${b}`,
    `Solve for $x$${IN_Y}: $$y = \\sqrt{\\frac{x + ${a}}{x - ${b}}}$$`,
    expr(`(${a} + ${b}*y^2)/(y^2 - 1)`, ['y'], `$x = \\frac{${numer}}{y^2 - 1}$`, { y: [0.2, 4] }),
    steps,
    { eq: `y = sqrt((x + ${a})/(x - ${b}))`, solveFor: 'x' },
  );
};

const logRatio: Template = (rng) => {
  const a = rng.int(1, 9);
  const steps = [
    `**Combine the logs:** $y = \\ln\\frac{x + ${a}}{x}$`,
    `**Exponentiate:** $e^y = \\frac{x + ${a}}{x} = 1 + \\frac{${a}}{x}$`,
    `$\\frac{${a}}{x} = e^y - 1$, so $x = \\frac{${a}}{e^y - 1}$`,
  ];
  return build(
    'rearranging',
    `logratio:${a}`,
    `Solve for $x$${IN_Y}: $$y = \\ln(x + ${a}) - \\ln x$$`,
    expr(`${a}/(e^y - 1)`, ['y'], `$x = \\frac{${a}}{e^y - 1}$`, { y: [0.2, 3] }),
    steps,
    { eq: `y = log(x + ${a}) - log(x)`, solveFor: 'x' },
  );
};

const expChunk: Template = (rng) => {
  const a = rng.int(1, 3);
  const c = rng.int(1, 3);
  const k = rng.int(2, 4);
  const b = c * (a + k);
  const numer = `${b} - ${coefX(c, 'y')}`;
  const steps = [
    `**Treat $e^x$ as one unknown:** let $u = e^x$, so $y = \\frac{${coefX(a, 'u')} + ${b}}{u + ${c}}$`,
    `**Clear the fraction:** $${coefX(c, 'y')} + uy = ${coefX(a, 'u')} + ${b}$`,
    `**Collect and factor $u$:** $u(${shift(-a, 'y')}) = ${numer}$, so $u = \\frac{${numer}}{${shift(-a, 'y')}}$`,
    `$x = \\ln u = \\ln\\frac{${numer}}{${shift(-a, 'y')}}$`,
  ];
  return build(
    'rearranging',
    `expchunk:${a}:${b}:${c}`,
    `Solve for $x$${IN_Y}: $$y = \\frac{${coefX(a, 'e^x')} + ${b}}{e^x + ${c}}$$`,
    expr(`log((${b} - ${c}*y)/(y - ${a}))`, ['y'], `$x = \\ln\\frac{${numer}}{${shift(-a, 'y')}}$`, { y: [a + 0.1, a + k - 0.1] }),
    steps,
    { eq: `y = (${a}*e^x + ${b})/(e^x + ${c})`, solveFor: 'x' },
  );
};

const hyperbolic: Template = (rng) => {
  const variant = rng.int(0, 2);
  if (variant < 2) {
    // y = (e^x − e^−x)/k
    const k = variant + 1;
    const display = k === 2 ? `\\ln\\left(y + \\sqrt{y^2 + 1}\\right)` : `\\ln\\frac{y + \\sqrt{y^2 + 4}}{2}`;
    const steps = [
      `**Let $u = e^x$**, so $e^{-x} = \\frac{1}{u}$: $${k === 1 ? '' : k}y = u - \\frac{1}{u}$`,
      `**Multiply by $u$:** $u^2 - ${k === 1 ? '' : k}yu - 1 = 0$, a quadratic in $u$`,
      `$u = \\frac{${k === 1 ? '' : k}y \\pm \\sqrt{${k * k === 1 ? '' : k * k}y^2 + 4}}{2}$; $u = e^x > 0$, so take $+$`,
      `$x = ${display}$`,
    ];
    return build(
      'rearranging',
      `sinh:${k}`,
      `Solve for $x$${IN_Y}: $$y = ${k === 1 ? 'e^x - e^{-x}' : `\\frac{e^x - e^{-x}}{${k}}`}$$`,
      expr(`log((${k}*y + sqrt(${k * k}*y^2 + 4))/2)`, ['y'], `$x = ${display}$`, { y: [-3, 3] }),
      steps,
      { eq: `y = (e^x - e^(-x))/${k}`, solveFor: 'x' },
    );
  }
  const steps = [
    `**Let $u = e^x$**, so $e^{-x} = \\frac{1}{u}$: $2y = u + \\frac{1}{u}$`,
    `**Multiply by $u$:** $u^2 - 2yu + 1 = 0$, a quadratic in $u$`,
    `$u = y \\pm \\sqrt{y^2 - 1}$; $x > 0$ means $u > 1$, so take $+$`,
    `$x = \\ln\\left(y + \\sqrt{y^2 - 1}\\right)$`,
  ];
  return build(
    'rearranging',
    'cosh',
    `Solve for $x > 0$${IN_Y}: $$y = \\frac{e^x + e^{-x}}{2}$$`,
    expr('log(y + sqrt(y^2 - 1))', ['y'], '$x = \\ln\\left(y + \\sqrt{y^2 - 1}\\right)$', { y: [1.1, 4] }),
    steps,
    { eq: 'y = (e^x + e^(-x))/2', solveFor: 'x' },
  );
};

const rootDenominator: Template = (rng) => {
  const a = rng.pick([1, 2, 3, 4, 9]);
  const display = a === 1 ? '\\frac{y}{\\sqrt{1 - y^2}}' : `\\sqrt{\\frac{${a}y^2}{1 - y^2}}`;
  const steps = [
    `**Square both sides:** $y^2 = \\frac{x^2}{${a} + x^2}$`,
    `**Clear the fraction:** $${a === 1 ? '' : a}y^2 + x^2y^2 = x^2$`,
    `**Collect and factor $x^2$:** $x^2(1 - y^2) = ${a === 1 ? '' : a}y^2$`,
    `$x > 0$, so take the positive root: $x = ${display}$`,
  ];
  return build(
    'rearranging',
    `rootden:${a}`,
    `Solve for $x > 0$${IN_Y}: $$y = \\frac{x}{\\sqrt{${a} + x^2}}$$`,
    expr(`sqrt(${a}*y^2/(1 - y^2))`, ['y'], `$x = ${display}$`, { y: [0.05, 0.95] }),
    steps,
    { eq: `y = x/sqrt(${a} + x^2)`, solveFor: 'x' },
  );
};

const formulas: Template = (rng) => {
  switch (rng.int(0, 4)) {
    case 0: {
      const steps = [
        `**Isolate the target term:** $\\frac{1}{v} = \\frac{1}{f} - \\frac{1}{u} = \\frac{u - f}{uf}$`,
        `**Flip both sides:** $v = \\frac{uf}{u - f}$`,
      ];
      return build(
        'rearranging',
        'lens',
        'Solve for $v$ (in terms of $u$ and $f$): $$\\frac{1}{f} = \\frac{1}{u} + \\frac{1}{v}$$',
        expr('u*f/(u - f)', ['u', 'f'], '$v = \\frac{uf}{u - f}$', { u: [2, 5], f: [0.5, 1.8] }),
        steps,
        { eq: '1/f = 1/u + 1/v', solveFor: 'v' },
      );
    }
    case 1: {
      const steps = [
        `**Let $u = e^{kt}$:** $P = \\frac{Au}{1 + Bu}$`,
        `**Clear the fraction and collect $u$:** $P + PBu = Au$, so $P = u(A - PB)$`,
        `$u = \\frac{P}{A - PB}$, so $kt = \\ln\\frac{P}{A - PB}$`,
        `$t = \\frac{1}{k}\\ln\\frac{P}{A - PB}$`,
      ];
      return build(
        'rearranging',
        'logistic',
        'Solve for $t$ (in terms of $P, A, B, k$): $$P = \\frac{Ae^{kt}}{1 + Be^{kt}}$$',
        expr('log(P/(A - P*B))/k', ['P', 'A', 'B', 'k'], '$t = \\frac{1}{k}\\ln\\frac{P}{A - PB}$', {
          P: [0.5, 2],
          A: [3, 5],
          B: [0.5, 1],
          k: [0.5, 2],
        }),
        steps,
        { eq: 'P = A*e^(k*t)/(1 + B*e^(k*t))', solveFor: 't' },
      );
    }
    case 2: {
      const steps = [
        `**Divide by $2\\pi$:** $\\frac{T}{2\\pi} = \\sqrt{\\frac{L}{g}}$`,
        `**Square both sides:** $\\frac{T^2}{4\\pi^2} = \\frac{L}{g}$`,
        `$L = \\frac{gT^2}{4\\pi^2}$`,
      ];
      return build(
        'rearranging',
        'pendulum',
        'Solve for $L$ (in terms of $T$ and $g$): $$T = 2\\pi\\sqrt{\\frac{L}{g}}$$',
        expr('g*T^2/(4*pi^2)', ['g', 'T'], '$L = \\frac{gT^2}{4\\pi^2}$', { g: [1, 10], T: [0.5, 3] }),
        steps,
        { eq: 'T = 2*pi*sqrt(L/g)', solveFor: 'L' },
      );
    }
    case 3: {
      const steps = [
        `**Collect the $x$ terms:** $ax - cx = d - b$`,
        `**Factor out $x$:** $x(a - c) = d - b$`,
        `$x = \\frac{d - b}{a - c}$`,
      ];
      return build(
        'rearranging',
        'literal',
        'Solve for $x$ (in terms of $a, b, c, d$): $$ax + b = cx + d$$',
        expr('(d - b)/(a - c)', ['a', 'b', 'c', 'd'], '$x = \\frac{d - b}{a - c}$', { a: [-4, 4], b: [-4, 4], c: [-4, 4], d: [-4, 4] }),
        steps,
        { eq: 'a*x + b = c*x + d', solveFor: 'x' },
      );
    }
    default: {
      const steps = [
        `**Expand:** $ax - ab = cx + cd$`,
        `**Collect the $x$ terms:** $ax - cx = ab + cd$`,
        `**Factor out $x$:** $x(a - c) = ab + cd$, so $x = \\frac{ab + cd}{a - c}$`,
      ];
      return build(
        'rearranging',
        'literal2',
        'Solve for $x$ (in terms of $a, b, c, d$): $$a(x - b) = c(x + d)$$',
        expr('(a*b + c*d)/(a - c)', ['a', 'b', 'c', 'd'], '$x = \\frac{ab + cd}{a - c}$', { a: [-4, 4], b: [-4, 4], c: [-4, 4], d: [-4, 4] }),
        steps,
        { eq: 'a*(x - b) = c*(x + d)', solveFor: 'x' },
      );
    }
  }
};

const exponentialModel: Template = (rng) => {
  const a = rng.int(2, 5);
  const b = rng.pick([2, 3, 10]);
  const c = nonZero(rng, -5, 5);
  const inner = `\\frac{${shift(-c, 'y')}}{${a}}`;
  const steps = [
    `**Isolate the power:** $${b}^x = ${inner}$`,
    `**Take logs:** $x = \\log_{${b}} ${inner} = \\frac{\\ln\\left(${inner}\\right)}{\\ln ${b}}$`,
  ];
  return build(
    'rearranging',
    `expmodel:${a}:${b}:${c}`,
    `Solve for $x$${IN_Y}: $$y = ${a} \\cdot ${b}^x${plusConst(c)}$$`,
    expr(`log((y - (${c}))/${a})/log(${b})`, ['y'], `$x = \\log_{${b}} ${inner}$`, { y: [c + 0.5, c + 20] }),
    steps,
    { eq: `y = ${a}*${b}^x + (${c})`, solveFor: 'x' },
  );
};

const inverseQuadratic: Template = (rng) => {
  const h = nonZero(rng, -4, 4);
  const c = rng.int(-6, 6);
  const K = h * h - c;
  const inside = shift(K, 'x');
  const display = `y = ${-h} + \\sqrt{${inside}}`;
  const steps = [
    `**Complete the square in $y$:** $x = (${shift(h, 'y')})^2${K ? plusConst(-K) : ''}$`,
    `So $(${shift(h, 'y')})^2 = ${inside}$`,
    `$y \\ge ${-h}$ means $${shift(h, 'y')} \\ge 0$, so take the positive root: $${display}$`,
  ];
  return build(
    'rearranging',
    `invquad:${h}:${c}`,
    `Solve for $y$ (with $y \\ge ${-h}$)${inVar('x')}: $$x = ${sum([[1, 'y^2'], [2 * h, 'y'], [c, '']]).tex}$$`,
    expr(`${-h} + sqrt(x + (${K}))`, ['x'], `$${display}$`, { x: [-K + 0.2, -K + 12] }),
    steps,
    { eq: `x = y^2 + (${2 * h})*y + (${c})`, solveFor: 'y' },
  );
};

const parametricSystem: Template = (rng) =>
  retry(() => {
    const [a, b, c, d] = [nonZero(rng, -5, 5), nonZero(rng, -5, 5), nonZero(rng, -5, 5), nonZero(rng, -5, 5)];
    const e = rng.int(-9, 9);
    const det = a * d - b * c;
    if (det === 0) return undefined;
    // x = (dk − be)/det, with the sign moved to the top and common factors cancelled
    const sign = det < 0 ? -1 : 1;
    const g = gcd(gcd(d, b * e), det);
    const [nk, n0, den] = [(sign * d) / g, (-sign * b * e) / g, Math.abs(det) / g];
    const numer = sum([[nk, 'k'], [n0, '']]);
    const display = den === 1 ? numer.tex : `\\frac{${numer.tex}}{${den}}`;
    const steps = [
      `**Eliminate $y$:** multiply the first equation by $${d}$ and the second by $${b}$, then subtract`,
      `$${det}x = ${sum([[d, 'k'], [-b * e, '']]).tex}$`,
      `**Divide:** $x = ${display}$`,
    ];
    return build(
      'rearranging',
      `paramsys:${a}:${b}:${c}:${d}:${e}`,
      `Solve for $x$${inVar('k')}: $$${sum([[a, 'x'], [b, 'y']]).tex} = k, \\qquad ${sum([[c, 'x'], [d, 'y']]).tex} = ${e}$$`,
      expr(`(${numer.math})/${den}`, ['k'], `$x = ${display}$`, { k: [-5, 5] }),
      steps,
      { eq: `(${a})*x + (${b})*((${e}) - (${c})*x)/(${d}) = k`, solveFor: 'x' },
    );
  });

const moreFormulas: Template = (rng) => {
  switch (rng.int(0, 4)) {
    case 0: {
      const steps = [
        `**Isolate the power:** $(1 + r)^n = \\frac{A}{P}$`,
        `**Take ln of both sides:** $n\\ln(1 + r) = \\ln\\frac{A}{P}$`,
        `$n = \\frac{\\ln(A/P)}{\\ln(1 + r)}$`,
      ];
      return build(
        'rearranging',
        'interestn',
        'Solve for $n$ (in terms of $A, P, r$): $$A = P(1 + r)^n$$',
        expr('log(A/P)/log(1 + r)', ['A', 'P', 'r'], '$n = \\frac{\\ln(A/P)}{\\ln(1 + r)}$', { A: [2, 10], P: [1, 1.9], r: [0.05, 0.5] }),
        steps,
        { eq: 'A = P*(1 + r)^n', solveFor: 'n' },
      );
    }
    case 1: {
      const steps = [
        `**Isolate the power:** $(1 + r)^n = \\frac{A}{P}$`,
        `**Take the $n$th root:** $1 + r = \\left(\\frac{A}{P}\\right)^{1/n}$`,
        `$r = \\left(\\frac{A}{P}\\right)^{1/n} - 1$`,
      ];
      return build(
        'rearranging',
        'interestr',
        'Solve for $r$ (in terms of $A, P, n$): $$A = P(1 + r)^n$$',
        expr('(A/P)^(1/n) - 1', ['A', 'P', 'n'], '$r = \\left(\\frac{A}{P}\\right)^{1/n} - 1$', { A: [2, 10], P: [1, 1.9], n: [1, 10] }),
        steps,
        { eq: 'A = P*(1 + r)^n', solveFor: 'r' },
      );
    }
    case 2: {
      const steps = [`**Isolate the $s$ term:** $2as = v^2 - u^2$`, `**Divide by $2a$:** $s = \\frac{v^2 - u^2}{2a}$`];
      return build(
        'rearranging',
        'kinematics',
        'Solve for $s$ (in terms of $u, v, a$): $$v^2 = u^2 + 2as$$',
        expr('(v^2 - u^2)/(2*a)', ['v', 'u', 'a'], '$s = \\frac{v^2 - u^2}{2a}$', { v: [3, 6], u: [0, 2], a: [0.5, 3] }),
        steps,
        { eq: 'v^2 = u^2 + 2*a*s', solveFor: 's' },
      );
    }
    case 3: {
      const steps = [`**Isolate $u^2$:** $u^2 = v^2 - 2as$`, `$u > 0$, so take the positive root: $u = \\sqrt{v^2 - 2as}$`];
      return build(
        'rearranging',
        'kinematicsu',
        'Solve for $u > 0$ (in terms of $v, a, s$): $$v^2 = u^2 + 2as$$',
        expr('sqrt(v^2 - 2*a*s)', ['v', 'a', 's'], '$u = \\sqrt{v^2 - 2as}$', { v: [4, 6], a: [0.5, 1.5], s: [0.5, 3] }),
        steps,
        { eq: 'v^2 = u^2 + 2*a*s', solveFor: 'u' },
      );
    }
    default: {
      const steps = [
        `**Isolate the $a$ term:** $\\frac{1}{2}at^2 = s - ut$`,
        `**Multiply by 2 and divide by $t^2$:** $a = \\frac{2(s - ut)}{t^2}$`,
      ];
      return build(
        'rearranging',
        'displacement',
        'Solve for $a$ (in terms of $s, u, t$): $$s = ut + \\frac{1}{2}at^2$$',
        expr('2*(s - u*t)/t^2', ['s', 'u', 't'], '$a = \\frac{2(s - ut)}{t^2}$', { s: [1, 10], u: [0, 2], t: [0.5, 3] }),
        steps,
        { eq: 's = u*t + a*t^2/2', solveFor: 'a' },
      );
    }
  }
};

const squaredRatio: Template = (rng) => {
  const b = rng.int(1, 4);
  const a = b + rng.int(2, 8);
  const numer = `${a} - ${coefX(b, 'y')}`;
  const display = `x = \\sqrt{\\frac{${numer}}{y - 1}}`;
  const steps = [
    `**Treat $x^2$ as one unknown** and clear the fraction: $x^2y + ${coefX(b, 'y')} = x^2 + ${a}$`,
    `**Collect and factor $x^2$:** $x^2(y - 1) = ${numer}$`,
    `$x > 0$, so take the positive root: $${display}$`,
  ];
  return build(
    'rearranging',
    `sqratio:${a}:${b}`,
    `Solve for $x > 0$${IN_Y}: $$y = \\frac{x^2 + ${a}}{x^2 + ${b}}$$`,
    expr(`sqrt((${a} - ${b}*y)/(y - 1))`, ['y'], `$${display}$`, { y: [1.05, a / b - 0.05] }),
    steps,
    { eq: `y = (x^2 + ${a})/(x^2 + ${b})`, solveFor: 'x' },
  );
};

const INVERSE_TRIG = {
  sin: { inv: 'arcsin', math: 'asin', range: (bx: string) => `-\\frac{\\pi}{2} \\le ${bx} \\le \\frac{\\pi}{2}` },
  cos: { inv: 'arccos', math: 'acos', range: (bx: string) => `0 \\le ${bx} \\le \\pi` },
  tan: { inv: 'arctan', math: 'atan', range: (bx: string) => `-\\frac{\\pi}{2} < ${bx} < \\frac{\\pi}{2}` },
} as const;

const trigInverse: Template = (rng) => {
  const fn = rng.pick(['sin', 'cos', 'tan'] as const);
  const { inv, math, range } = INVERSE_TRIG[fn];
  const [A, B, C] = [rng.int(2, 5), rng.int(1, 3), rng.int(-3, 3)];
  const bx = coefX(B);
  const inner = `\\frac{${shift(-C, 'y')}}{${A}}`;
  const display = `x = ${B > 1 ? `\\frac{1}{${B}}` : ''}\\${inv}\\left(${inner}\\right)`;
  const steps = [
    `**Isolate the ${fn} first:** $\\${fn}(${bx}) = ${inner}$`,
    `**Undo it with $\\${inv}$** (allowed, since $${range(bx)}$ is its output range): $${bx} = \\${inv}\\left(${inner}\\right)$`,
    ...(B > 1 ? [`Divide by ${B}: $${display}$`] : []),
  ];
  return build(
    'rearranging',
    `trinv:${fn}:${A}:${B}:${C}`,
    `Solve for $x$, where $${range(bx)}$${IN_Y}: $$y = ${A}\\${fn}(${bx})${C ? plusConst(C) : ''}$$`,
    expr(`${math}((y - (${C}))/${A})/${B}`, ['y'], `$${display}$`, { y: fn === 'tan' ? [C - 8, C + 8] : [C - A + 0.1, C + A - 0.1] }),
    steps,
    { eq: `y = ${A}*${fn}(${B}*x) + (${C})`, solveFor: 'x' },
  );
};

const fitConstants: Template = (rng) => {
  if (rng.next() < 0.5) {
    // y = Ae^{kt} through two points: divide to cancel A.
    const t1 = rng.int(1, 3);
    const gap = rng.int(1, 4);
    const t2 = t1 + gap;
    const a = rng.int(2, 6);
    const r = rng.pick([2, 3, 4, 5]);
    const gk = gap === 1 ? 'k' : `${gap}k`;
    const kTex = gap === 1 ? `\\ln ${r}` : `\\frac{\\ln ${r}}{${gap}}`;
    const steps = [
      `**Divide the two equations to cancel $A$:** $\\frac{Ae^{${t2}k}}{Ae^{${t1}k}} = \\frac{${a * r}}{${a}}$, so $e^{${gk}} = ${r}$`,
      `**Take ln:** $${gk} = \\ln ${r}$, so $k = ${kTex}$`,
    ];
    return build(
      'rearranging',
      `fitexp:${t1}:${t2}:${a}:${r}`,
      `$y = Ae^{kt}$ has $y(${t1}) = ${a}$ and $y(${t2}) = ${a * r}$. Find $k$ (exact form, using ln).`,
      num(Math.log(r) / gap, `$${kTex}$`),
      steps,
      { eq: `${a}*e^(${t2}*x) = ${a * r}*e^(${t1}*x)`, roots: [Math.log(r) / gap] },
    );
  }
  // Newton's law of cooling: T(t) = Ta + D e^{−kt}
  const Ta = rng.pick([10, 20, 25]);
  const D = rng.pick([40, 60, 80]);
  const q = rng.pick([2, 4]);
  const t1 = rng.int(2, 10);
  const T1 = Ta + D / q;
  const steps = [
    `**Isolate the exponential:** $${D}e^{-${t1}k} = ${T1} - ${Ta} = ${D / q}$, so $e^{-${t1}k} = \\frac{1}{${q}}$`,
    `**Take ln:** $-${t1}k = -\\ln ${q}$, so $k = \\frac{\\ln ${q}}{${t1}}$`,
  ];
  return build(
    'rearranging',
    `cooling:${Ta}:${D}:${q}:${t1}`,
    `$T(t) = ${Ta} + ${D}e^{-kt}$ and $T(${t1}) = ${T1}$. Find $k$ (exact form, using ln).`,
    num(Math.log(q) / t1, `$\\frac{\\ln ${q}}{${t1}}$`),
    steps,
    { eq: `${Ta} + ${D}*e^(-x*${t1}) = ${T1}`, roots: [Math.log(q) / t1] },
  );
};

/** e^{rt} as LaTeX. */
const expT = (r: number) => (r === 1 ? 'e^{t}' : r === -1 ? 'e^{-t}' : `e^{${r}t}`);

const initialConditions: Template = (rng) => {
  const variant = rng.int(0, 2);
  const a = rng.int(-5, 6);
  const b = rng.int(-6, 6);
  if (variant === 0) {
    const [r1, r2] = distinctInts(rng, 2, -3, 3, [0]);
    const askC1 = rng.next() < 0.5;
    const [t, rt, ro] = askC1 ? [1, r1, r2] : [2, r2, r1];
    const steps = [
      `**Turn the conditions into a linear system:** $y(0) = C_1 + C_2 = ${a}$ and $y'(0) = ${sum([[r1, 'C_1'], [r2, 'C_2']]).tex} = ${b}$`,
      `**Eliminate $C_${3 - t}$:** subtract $${ro}$ times the first equation from the second: $${coefX(rt - ro, `C_${t}`)} = ${b}${plusConst(-ro * a)}$`,
      `$C_${t} = ${fracTex(b - ro * a, rt - ro)}$`,
    ];
    return build(
      'rearranging',
      `ivp:${r1}:${r2}:${a}:${b}:${t}`,
      `$y = C_1${expT(r1)} + C_2${expT(r2)}$ with $y(0) = ${a}$ and $y'(0) = ${b}$. Find $C_${t}$ (a fraction is fine).`,
      frac(b - ro * a, rt - ro),
      steps,
      { eq: askC1 ? `${r1}*x + (${r2})*(${a} - x) = ${b}` : `${r1}*(${a} - x) + (${r2})*x = ${b}`, roots: [(b - ro * a) / (rt - ro)] },
    );
  }
  if (variant === 1) {
    const w = rng.int(2, 5);
    const steps = [
      `**Differentiate, then plug in $t = 0$:** $y' = -${w}C_1\\sin(${w}t) + ${w}C_2\\cos(${w}t)$`,
      `$y'(0) = ${w}C_2 = ${b}$ (the sine term vanishes), so $C_2 = ${fracTex(b, w)}$`,
    ];
    return build(
      'rearranging',
      `ivptrig:${w}:${a}:${b}`,
      `$y = C_1\\cos(${w}t) + C_2\\sin(${w}t)$ with $y(0) = ${a}$ and $y'(0) = ${b}$. Find $C_2$ (a fraction is fine).`,
      frac(b, w),
      steps,
      { eq: `${w}*x = ${b}`, roots: [b / w] },
    );
  }
  // Repeated root: y = (C1 + C2 t)e^{rt}
  const r = nonZero(rng, -3, 3);
  const rTerm = `${r < 0 ? ' - ' : ' + '}${Math.abs(r) === 1 ? '' : Math.abs(r)}`;
  const steps = [
    `**Plug in $t = 0$ first:** $y(0) = C_1 = ${a}$`,
    `**Product rule:** $y' = C_2${expT(r)}${rTerm}(C_1 + C_2t)${expT(r)}$, so $y'(0) = ${sum([[1, 'C_2'], [r, 'C_1']]).tex} = ${b}$`,
    `$C_2 = ${b}${plusConst(-r * a)} = ${b - r * a}$`,
  ];
  return build(
    'rearranging',
    `ivprep:${r}:${a}:${b}`,
    `$y = (C_1 + C_2t)${expT(r)}$ with $y(0) = ${a}$ and $y'(0) = ${b}$. Find $C_2$.`,
    num(b - r * a),
    steps,
    { eq: `x + (${r})*(${a}) = ${b}`, roots: [b - r * a] },
  );
};

export const TRICK_TEMPLATES: Record<keyof AlgebraTricksConfig, Template[]> = {
  completeSquare: [squareIrrational, squareMinimum, addSubtract, circle, squareExtremes],
  substitution: [
    biquadratic, exponentialQuadratic, repeatedChunk, sqrtQuadratic, reciprocalQuadratic, logQuadratic, palindromic,
    fractionalPowers, reciprocalPair, fourConsecutive, logReciprocal,
  ],
  radicals: [radicalExtraneous, radicalConjugate, conjugateTelescope, rationalize],
  factoring: [groupingCubic, noDividing, rationalRoot, specialProducts, cubeForms, factorTheorem],
  fractions: [fractionRejected, fractionTwoTerms, fractionCancel, coverUp, telescoping],
  absoluteValue: [absLinear, absTwo, absBothSides, absQuadratic, absInequality],
  exponentsLogs: [sameBase, logEquation, lnBothSides, logBases, factorPowers, quadraticExponent, nestedLog, logPower],
  structural: [vietaSystem, sumOfSquaresZero, guessAndProve, reciprocalSums, ratioTrick, exponentRewrite, vietaRoots, plugInValues, selfSimilar],
  trig: [trigQuadratic, auxiliaryAngle, doubleAngle],
  rearranging: [
    mobius, shiftedReciprocal, collectFactor, rootOfRatio, logRatio, expChunk, hyperbolic, rootDenominator, formulas, exponentialModel,
    inverseQuadratic, parametricSystem, moreFormulas, squaredRatio, trigInverse, fitConstants, initialConditions,
  ],
};

/** A question plus its verification data, from the enabled families (all families if none are). */
export function buildTrick(cfg: AlgebraTricksConfig, rng: Rng): Built {
  const families = (Object.keys(TRICK_TEMPLATES) as (keyof AlgebraTricksConfig)[]).filter((k) => cfg[k]);
  const family = rng.pick(families.length ? families : (Object.keys(TRICK_TEMPLATES) as (keyof AlgebraTricksConfig)[]));
  return rng.pick(TRICK_TEMPLATES[family])(rng);
}

export function generateTrick(cfg: AlgebraTricksConfig, rng: Rng): Question {
  return buildTrick(cfg, rng).question;
}

export function createAlgebraTricksSource(getConfig: () => AlgebraTricksConfig): QuestionSource {
  return {
    id: 'algebra_tricks',
    name: 'Algebra tricks (generated)',
    description: 'Equations that each need one trick: substitution, completing the square, conjugates, fake roots, rearranging. Pick families in the Algebra tricks section.',
    next: (rng) => generateTrick(getConfig(), rng),
  };
}
