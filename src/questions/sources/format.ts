import type { Rng } from '../../util/rng';

/** Number helpers and LaTeX formatting shared by the generated question sources. */

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

/** A nonzero integer in [min, max]. */
export function nonZero(rng: Rng, min: number, max: number): number {
  let n = 0;
  while (n === 0) n = rng.int(min, max);
  return n;
}

/** " + 5" / " - 5" for appending a constant after another term. */
export function plusConst(n: number): string {
  return n < 0 ? ` - ${-n}` : ` + ${n}`;
}

/** "3x", "-x", "x" for a leading coefficient. */
export function coefX(a: number, v = 'x'): string {
  if (a === 1) return v;
  if (a === -1) return `-${v}`;
  return `${a}${v}`;
}

/** Wrap negatives in parentheses when they appear inside an expression. */
export function paren(n: number): string {
  return n < 0 ? `(${n})` : String(n);
}

/** "x + 3", "x - 3", or "x" for a shifted variable. */
export function shift(c: number, v = 'x'): string {
  return c ? `${v}${plusConst(c)}` : v;
}

/** A term's body as LaTeX and mathjs syntax; a plain string is used for both. "" is a constant. */
export type Body = string | [tex: string, math: string];

/**
 * A sum of terms in LaTeX and in mathjs syntax: [[3, 'x^2'], [-1, 'x'], [4, '']] →
 * "3x^2 - x + 4". Zero terms are dropped.
 */
export function sum(parts: [number, Body][]): { tex: string; math: string } {
  const kept = parts.filter(([c]) => c !== 0);
  if (!kept.length) return { tex: '0', math: '0' };
  const tex = kept
    .map(([c, body], i) => {
      const b = typeof body === 'string' ? body : body[0];
      const abs = Math.abs(c);
      let term: string;
      if (!b) term = String(abs);
      else if (abs === 1) term = b;
      else term = /^\d/.test(b) ? `${abs} \\cdot ${b}` : `${abs}${b}`;
      if (i === 0) return c < 0 ? `-${term}` : term;
      return `${c < 0 ? ' - ' : ' + '}${term}`;
    })
    .join('');
  const math = kept
    .map(([c, body]) => {
      const b = typeof body === 'string' ? body : body[1];
      return b ? `(${c})*(${b})` : `(${c})`;
    })
    .join(' + ');
  return { tex, math };
}

/** A reduced fraction as LaTeX ("\frac{3}{4}", "-\frac{1}{2}", "5"). */
export function fracTex(n: number, d: number): string {
  const [rn, rd] = reduce(n, d);
  if (rd === 1) return String(rn);
  return `${rn < 0 ? '-' : ''}\\frac{${Math.abs(rn)}}{${rd}}`;
}

/** A reduced fraction as typed text ("3/4", "-1/2", "5"). */
export function fracText(n: number, d: number): string {
  const [rn, rd] = reduce(n, d);
  return rd === 1 ? String(rn) : `${rn}/${rd}`;
}

function reduce(n: number, d: number): [number, number] {
  const g = gcd(n, d) || 1;
  const sign = d < 0 ? -1 : 1;
  return [(sign * n) / g, (sign * d) / g];
}

/** √n in simplest form as LaTeX: 12 → "2\sqrt{3}", 9 → "3", 7 → "\sqrt{7}". */
export function sqrtTex(n: number): string {
  let outside = 1;
  let inside = n;
  for (let k = 2; k * k <= inside; k++) {
    while (inside % (k * k) === 0) {
      inside /= k * k;
      outside *= k;
    }
  }
  if (inside === 1) return String(outside);
  return `${outside === 1 ? '' : outside}\\sqrt{${inside}}`;
}

/** "(u - 3)(u + 2)" for roots 3 and -2; a root of 0 becomes a bare "u", written first. */
export function factorPair(v: string, r1: number, r2: number): string {
  const f = (r: number) => (r === 0 ? v : `(${shift(-r, v)})`);
  return r2 === 0 ? f(r2) + f(r1) : f(r1) + f(r2);
}
