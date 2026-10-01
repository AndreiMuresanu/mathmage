import type { ArithmeticConfig } from '../../config/gameConfig';
import type { Rng } from '../../util/rng';
import type { Question, QuestionSource } from '../types';

type Op = '+' | '-' | '*' | '/';

type Expr =
  | { kind: 'num'; value: number }
  | { kind: 'op'; op: Op; left: Expr; right: Expr; value: number };

const PRECEDENCE: Record<Op, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
const LATEX_OP: Record<Op, string> = { '+': '+', '-': '-', '*': '\\times', '/': '\\div' };

function enabledOps(cfg: ArithmeticConfig): Op[] {
  const ops: Op[] = [];
  if (cfg.allowAdd) ops.push('+');
  if (cfg.allowSubtract) ops.push('-');
  if (cfg.allowMultiply) ops.push('*');
  if (cfg.allowDivide) ops.push('/');
  return ops.length ? ops : ['+'];
}

function apply(op: Op, a: number, b: number): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
  }
}

class Reject extends Error {}

function build(cfg: ArithmeticConfig, rng: Rng, ops: Op[], terms: number): Expr {
  if (terms === 1) return { kind: 'num', value: rng.int(cfg.minOperand, cfg.maxOperand) };
  const leftTerms = rng.int(1, terms - 1);
  const left = build(cfg, rng, ops, leftTerms);
  const op = rng.pick(ops);
  let right: Expr;
  if (op === '/' && terms - leftTerms === 1) {
    // Pick a divisor of the left value so integer division usually works out.
    const divisors: number[] = [];
    for (let d = Math.max(1, cfg.minOperand); d <= cfg.maxOperand; d++) {
      if (!cfg.integerOnly || left.value % d === 0) divisors.push(d);
    }
    if (divisors.length === 0) throw new Reject();
    right = { kind: 'num', value: rng.pick(divisors) };
  } else {
    right = build(cfg, rng, ops, terms - leftTerms);
  }
  if (op === '/' && right.value === 0) throw new Reject();
  const value = apply(op, left.value, right.value);
  if (cfg.integerOnly && !Number.isInteger(value)) throw new Reject();
  if (Math.abs(value) > cfg.maxAbsResult) throw new Reject();
  return { kind: 'op', op, left, right, value };
}

function needsParens(parent: Op, child: Expr, side: 'left' | 'right'): boolean {
  if (child.kind === 'num') return false;
  const p = PRECEDENCE[parent];
  const c = PRECEDENCE[child.op];
  if (c < p) return true;
  return side === 'right' && c === p && (parent === '-' || parent === '/');
}

function toLatex(expr: Expr): string {
  if (expr.kind === 'num') return expr.value < 0 ? `(${expr.value})` : String(expr.value);
  const wrap = (child: Expr, side: 'left' | 'right') =>
    needsParens(expr.op, child, side) ? `\\left(${toLatex(child)}\\right)` : toLatex(child);
  return `${wrap(expr.left, 'left')} ${LATEX_OP[expr.op]} ${wrap(expr.right, 'right')}`;
}

function hasParens(expr: Expr): boolean {
  if (expr.kind === 'num') return false;
  return (
    needsParens(expr.op, expr.left, 'left') ||
    needsParens(expr.op, expr.right, 'right') ||
    hasParens(expr.left) ||
    hasParens(expr.right)
  );
}

/** One step per operation, innermost first, e.g. "3 × 4 = 12". */
function steps(expr: Expr, out: string[] = []): string[] {
  if (expr.kind === 'num') return out;
  steps(expr.left, out);
  steps(expr.right, out);
  out.push(`$${expr.left.value} ${LATEX_OP[expr.op]} ${expr.right.value} = ${expr.value}$`);
  return out;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

export function generateArithmetic(cfg: ArithmeticConfig, rng: Rng): Question {
  const ops = enabledOps(cfg);
  const minTerms = Math.max(1, Math.min(cfg.minTerms, cfg.maxTerms));
  const maxTerms = Math.max(minTerms, cfg.maxTerms);
  for (let attempt = 0; attempt < 500; attempt++) {
    try {
      const expr = build(cfg, rng, ops, rng.int(minTerms, maxTerms));
      if (!cfg.allowParens && hasParens(expr)) continue;
      const latex = toLatex(expr);
      return {
        id: `arith:${latex}`,
        prompt: `$$${latex}$$`,
        answer: { kind: 'numeric', value: expr.value, display: formatNumber(expr.value) },
        steps: steps(expr),
        tags: ['arithmetic'],
      };
    } catch (e) {
      if (!(e instanceof Reject)) throw e;
    }
  }
  // Settings too restrictive to satisfy; fall back to a simple sum.
  const a = rng.int(cfg.minOperand, cfg.maxOperand);
  const b = rng.int(cfg.minOperand, cfg.maxOperand);
  return {
    id: `arith:${a}+${b}`,
    prompt: `$$${a} + ${b}$$`,
    answer: { kind: 'numeric', value: a + b, display: String(a + b) },
    steps: [`$${a} + ${b} = ${a + b}$`],
    tags: ['arithmetic'],
  };
}

export function createArithmeticSource(getConfig: () => ArithmeticConfig): QuestionSource {
  return {
    id: 'arithmetic',
    name: 'Arithmetic (generated)',
    description: 'Random arithmetic expressions; tune them in the Arithmetic section.',
    next: (rng) => generateArithmetic(getConfig(), rng),
  };
}
