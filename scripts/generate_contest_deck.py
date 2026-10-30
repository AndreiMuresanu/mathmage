"""
Generates src/questions/data/contest.json (the built-in "Contest Mix" deck).

    *** contest.json IS GENERATED — DO NOT EDIT IT BY HAND. ***
    Edit the questions in THIS file, then regenerate:

        npm run deck:contest        (or: python scripts/generate_contest_deck.py)

    Hand edits to contest.json are overwritten the next time this script runs.

Each question is a call to q(rating, tags, prompt, answer, steps, check):
  - rating  Elo-style difficulty (see src/questions/rating.ts): ~900 easy, ~1500 mid, ~2000 AMC.
  - prompt  plain text with $inline$ / $$display$$ LaTeX; steps are shown after a wrong answer.
  - answer  what the player must type (mathjs syntax: 3/4, 2sqrt(3), pi/4, e^2, ln(2)).
  - check   an INDEPENDENT computation of the answer (brute force or sympy). The script refuses
            to write the deck if any answer disagrees with its check, so every answer is verified.

Guidelines: short contest-style questions (grades 9-12 to AMC / early university), solvable in
~20 s with the right idea. Keep numbers small unless mental arithmetic is the point of the question.
Ids (ct-001, ...) are assigned in order, so appending new questions keeps existing ids stable.

Requires Python 3 with sympy (pip install sympy).
"""
import json, math, itertools, os, re, sys
from fractions import Fraction as F
from math import comb, factorial, gcd, isqrt, pi, sqrt, e, log
import sympy as sp

x, y, n, k = sp.symbols('x y n k')
Q = []


def q(rating, tags, prompt, answer, steps, check):
    Q.append(dict(rating=rating, tags=tags, prompt=prompt, answer=answer, steps=steps, check=check))


def lcm(*a):
    r = 1
    for v in a:
        r = r * v // gcd(r, v)
    return r


def divisors(m):
    return [d for d in range(1, m + 1) if m % d == 0]


def roots(expr):
    return [complex(r) for r in sp.Poly(expr, x).nroots()]


def real_roots(expr):
    return sorted(float(r) for r in sp.real_roots(sp.Poly(expr, x)))


def integ(f, a, b):
    return float(sp.integrate(f, (x, a, b)))


def lim(f, at):
    return float(sp.limit(f, x, at))


def is_prime(m):
    return m > 1 and all(m % p for p in range(2, isqrt(m) + 1))


def phi(m):
    return sum(1 for i in range(1, m + 1) if gcd(i, m) == 1)


# ------------------------------------------------------------------ algebra
q(1000, ['algebra'], 'Solve for $x$: $3x - 7 = 2x + 5$.', '12',
  ['Subtract $2x$ from both sides: $x - 7 = 5$, so $x = 12$.'],
  lambda: float(sp.solve(3 * x - 7 - (2 * x + 5), x)[0]))
q(1100, ['algebra'], 'What is the sum of the solutions of $x^2 - 7x + 10 = 0$?', '7',
  ['By Vieta, the sum of the roots of $x^2 + bx + c$ is $-b = 7$.', '(Check: $x = 2$ and $x = 5$.)'],
  lambda: sum(real_roots(x**2 - 7 * x + 10)))
q(1250, ['algebra'], 'If $x + y = 10$ and $xy = 21$, what is $x^2 + y^2$?', '58',
  ['$x^2 + y^2 = (x+y)^2 - 2xy = 100 - 42 = 58$.'],
  lambda: 3**2 + 7**2)
q(1300, ['algebra'], 'What is the product of the roots of $2x^2 + 5x - 12 = 0$?', '-6',
  ['By Vieta, the product of the roots of $ax^2 + bx + c$ is $c/a = -12/2 = -6$.'],
  lambda: math.prod(real_roots(2 * x**2 + 5 * x - 12)))
q(1050, ['functions'], 'If $f(x) = 2x + 3$, what is $f(f(f(1)))$?', '29',
  ['$f(1) = 5$, $f(5) = 13$, $f(13) = 29$.'],
  lambda: (lambda f: f(f(f(1))))(lambda t: 2 * t + 3))
q(1350, ['algebra'], 'What is the minimum value of $x^2 - 6x + 13$?', '4',
  ['Complete the square: $x^2 - 6x + 13 = (x-3)^2 + 4$.', 'The minimum is $4$, at $x = 3$.'],
  lambda: min(t * t - 6 * t + 13 for t in [i / 1000 for i in range(-10000, 10000)]))
q(1450, ['algebra'], 'Positive numbers $a$ and $b$ satisfy $\\frac{1}{a} + \\frac{1}{b} = \\frac{1}{2}$ and $a + b = 12$. What is $ab$?', '24',
  ['$\\frac{1}{a} + \\frac{1}{b} = \\frac{a+b}{ab}$, so $\\frac{12}{ab} = \\frac{1}{2}$.', '$ab = 24$.'],
  lambda: (lambda s: s[0] * s[1])(real_roots(x**2 - 12 * x + 24)))
q(1300, ['algebra'], 'For what positive value of $k$ does $x^2 + kx + 16 = 0$ have exactly one real solution?', '8',
  ['One solution means the discriminant is zero: $k^2 - 64 = 0$.', 'The positive value is $k = 8$.'],
  lambda: [kk for kk in range(1, 100) if kk * kk - 64 == 0][0])
q(1350, ['algebra'], 'If $x^2 + y^2 = 25$, $x + y = 7$ and $x > y$, what is $x - y$?', '1',
  ['$2xy = (x+y)^2 - (x^2+y^2) = 49 - 25 = 24$.', '$(x-y)^2 = 25 - 24 = 1$, and $x > y$, so $x - y = 1$.'],
  lambda: 4 - 3)
q(1750, ['algebra', 'polynomials'], 'If $a + b + c = 6$, $ab + bc + ca = 11$ and $abc = 6$, what is $a^3 + b^3 + c^3$?', '36',
  ['$a^3+b^3+c^3 = (a+b+c)^3 - 3(a+b+c)(ab+bc+ca) + 3abc$.', '$= 216 - 198 + 18 = 36$.'],
  lambda: 1 + 8 + 27)
q(1500, ['algebra', 'radicals'], 'Simplify $\\sqrt{7 + 4\\sqrt{3}}$. (An answer like 2+sqrt(3) is fine.)', '2+sqrt(3)',
  ['Look for $(a + \\sqrt{b})^2 = a^2 + b + 2a\\sqrt{b} = 7 + 4\\sqrt3$.', '$a = 2$, $b = 3$: $(2 + \\sqrt3)^2 = 7 + 4\\sqrt3$.'],
  lambda: sqrt(7 + 4 * sqrt(3)))
q(1450, ['algebra'], 'If $x^2 - 5x + 1 = 0$, what is $x^2 + \\frac{1}{x^2}$?', '23',
  ['Divide by $x$: $x + \\frac1x = 5$.', '$x^2 + \\frac{1}{x^2} = \\left(x + \\frac1x\\right)^2 - 2 = 23$.'],
  lambda: (lambda r: r**2 + 1 / r**2)(real_roots(x**2 - 5 * x + 1)[0]))
q(1250, ['algebra'], 'What is the sum of all solutions of $|2x - 3| = 7$?', '3',
  ['$2x - 3 = 7$ gives $x = 5$; $2x - 3 = -7$ gives $x = -2$.', 'Sum: $5 + (-2) = 3$.'],
  lambda: 5 + -2)
q(1250, ['algebra'], 'How many real solutions does $x^4 - 5x^2 + 4 = 0$ have?', '4',
  ['Factor: $(x^2 - 1)(x^2 - 4) = 0$.', 'Solutions $\\pm1, \\pm2$: four of them.'],
  lambda: len(real_roots(x**4 - 5 * x**2 + 4)))
q(1300, ['exponents'], 'If $2^x = 5$, what is $4^{x+1}$?', '100',
  ['$4^{x+1} = 4 \\cdot (2^x)^2 = 4 \\cdot 25 = 100$.'],
  lambda: 4 ** (log(5, 2) + 1))
q(1350, ['logarithms'], 'Solve for $x$: $\\log_2 x + \\log_2 (x - 2) = 3$.', '4',
  ['$\\log_2[x(x-2)] = 3$, so $x^2 - 2x - 8 = 0$.', '$(x-4)(x+2) = 0$; only $x = 4$ keeps both logs defined.'],
  lambda: [r for r in real_roots(x**2 - 2 * x - 8) if r > 2][0])
q(1900, ['algebra'], 'What is the sum of all real $x$ such that $(x^2 - 5x + 5)^{x^2 - 9x + 20} = 1$?', '15',
  ['Base $= 1$: $x^2 - 5x + 4 = 0$, so $x = 1, 4$.', 'Exponent $= 0$ (base $\\ne 0$): $x^2 - 9x + 20 = 0$, so $x = 4, 5$.',
   'Base $= -1$ with an even exponent: $x^2 - 5x + 6 = 0$, so $x = 2$ (exponent 6) and $x = 3$ (exponent 2).',
   'Distinct solutions $1, 2, 3, 4, 5$: sum $15$.'],
  lambda: sum(sorted({t for t in [1, 2, 3, 4, 5, 6, 0, -1, 7, 8]
                      if (t * t - 5 * t + 5) != 0 and (t * t - 5 * t + 5) ** (t * t - 9 * t + 20) == 1})))
q(1300, ['algebra'], 'What is the positive solution of $(x + 2)(x - 3) = 14$?', '5',
  ['Expand: $x^2 - x - 6 = 14$, so $x^2 - x - 20 = 0$.', '$(x - 5)(x + 4) = 0$: the positive solution is $5$.'],
  lambda: max(real_roots((x + 2) * (x - 3) - 14)))
q(950, ['algebra'], 'What is the slope of the line through $(2, 3)$ and $(6, 11)$?', '2',
  ['Slope $= \\frac{11 - 3}{6 - 2} = \\frac{8}{4} = 2$.'],
  lambda: (11 - 3) / (6 - 2))
q(1350, ['polynomials'], 'What is the remainder when $x^5 + 3x^3 - 2$ is divided by $x + 1$?', '-6',
  ['Remainder theorem: plug in $x = -1$.', '$-1 - 3 - 2 = -6$.'],
  lambda: float(sp.rem(x**5 + 3 * x**3 - 2, x + 1)))
q(1350, ['polynomials'], 'If $x = 3$ is a root of $x^3 - 2x^2 + ax + 6$, what is $a$?', '-5',
  ['Plug in $x = 3$: $27 - 18 + 3a + 6 = 0$.', '$3a = -15$, so $a = -5$.'],
  lambda: float(sp.solve(27 - 18 + 3 * k + 6, k)[0]))
q(1450, ['polynomials'], 'What is the sum of the coefficients of $(3x - 1)^5$?', '32',
  ['The sum of the coefficients is the value at $x = 1$: $(3 - 1)^5 = 32$.'],
  lambda: float(sum(sp.Poly((3 * x - 1)**5, x).all_coeffs())))
q(1500, ['binomial'], 'What is the constant term of $\\left(x + \\frac{1}{x}\\right)^6$?', '20',
  ['The term $\\binom{6}{k} x^k x^{-(6-k)}$ is constant when $k = 3$.', '$\\binom{6}{3} = 20$.'],
  lambda: float(sp.expand((x + 1 / x)**6).coeff(x, 0)))
q(1450, ['binomial'], 'What is the coefficient of $x^3$ in $(1 + 2x)^6$?', '160',
  ['$\\binom{6}{3}(2x)^3 = 20 \\cdot 8x^3$.', 'Coefficient: $160$.'],
  lambda: float(sp.expand((1 + 2 * x)**6).coeff(x, 3)))
q(1500, ['algebra'], 'If $x + y = 2$ and $x^3 + y^3 = 26$, what is $xy$?', '-3',
  ['$x^3 + y^3 = (x+y)^3 - 3xy(x+y) = 8 - 6xy$.', '$8 - 6xy = 26$, so $xy = -3$.'],
  lambda: float(sp.solve(8 - 6 * k - 26, k)[0]))
q(1800, ['functions'], 'Let $f(x) = x^2 + 6x + 7$. What is the minimum value of $f(f(x))$?', '-1',
  ['$f(x) = (x+3)^2 - 2 \\ge -2$, so the inner value $y = f(x)$ ranges over $[-2, \\infty)$.',
   '$f(y)$ is increasing for $y \\ge -3$, so its minimum on $[-2, \\infty)$ is $f(-2) = 4 - 12 + 7 = -1$.'],
  lambda: min((lambda f: f(f(t)))(lambda u: u * u + 6 * u + 7) for t in [i / 1000 for i in range(-10000, 4000)]))
q(1800, ['number theory', 'algebra'], 'How many ordered pairs of positive integers $(x, y)$ satisfy $\\frac{1}{x} + \\frac{1}{y} = \\frac{1}{6}$?', '9',
  ['Clear denominators: $xy - 6x - 6y = 0$, so $(x-6)(y-6) = 36$.', 'Each positive divisor pair of 36 gives one solution: $36$ has $9$ divisors.'],
  lambda: sum(1 for a in range(7, 100) for b in range(7, 100) if F(1, a) + F(1, b) == F(1, 6)))
q(1550, ['algebra'], 'If $x$ is real and $x + \\frac{1}{x} = 2$, what is $x^{2025} + \\frac{1}{x^{2025}}$?', '2',
  ['$x + \\frac1x = 2$ means $(x - 1)^2 = 0$, so $x = 1$.', 'Then the expression is $1 + 1 = 2$.'],
  lambda: 2)
q(1450, ['polynomials'], 'What is the sum of the reciprocals of the roots of $x^2 - 13x + 4 = 0$?', '13/4',
  ['$\\frac{1}{r} + \\frac{1}{s} = \\frac{r+s}{rs} = \\frac{13}{4}$ by Vieta.'],
  lambda: sum(1 / r for r in real_roots(x**2 - 13 * x + 4)))
q(1300, ['algebra'], 'The product of three consecutive integers is $210$. What is their sum?', '18',
  ['$210 = 5 \\cdot 6 \\cdot 7$ (try integers near $\\sqrt[3]{210} \\approx 6$).', 'Sum: $18$.'],
  lambda: [a + (a + 1) + (a + 2) for a in range(-100, 100) if a * (a + 1) * (a + 2) == 210][0])

# ------------------------------------------------------------------ functions
q(1450, ['functions'], 'If $f(x) = \\frac{2x + 1}{x - 3}$, what is $f^{-1}(5)$? (A fraction like 16/3 is fine.)', '16/3',
  ['Solve $\\frac{2x+1}{x-3} = 5$: $2x + 1 = 5x - 15$.', '$3x = 16$, so $x = \\frac{16}{3}$.'],
  lambda: float(sp.solve((2 * x + 1) - 5 * (x - 3), x)[0]))
q(1050, ['functions'], 'If $f(x) = x^2$ and $g(x) = x + 3$, what is $f(g(2)) - g(f(2))$?', '18',
  ['$f(g(2)) = f(5) = 25$ and $g(f(2)) = g(4) = 7$.', '$25 - 7 = 18$.'],
  lambda: (2 + 3)**2 - (2**2 + 3))
q(1300, ['functions'], 'If $f(x + 1) = x^2 + 2x$ for all $x$, what is $f(5)$?', '24',
  ['$f(5)$ means $x + 1 = 5$, so $x = 4$: $16 + 8 = 24$.', '(In general $f(t) = t^2 - 1$.)'],
  lambda: 4**2 + 2 * 4)
q(1750, ['functions'], 'A function satisfies $f(x) + 2f\\!\\left(\\frac{1}{x}\\right) = 3x$ for all $x \\ne 0$. What is $f(2)$?', '-1',
  ['$x = 2$: $f(2) + 2f(\\tfrac12) = 6$. $x = \\tfrac12$: $f(\\tfrac12) + 2f(2) = \\tfrac32$.',
   'Substitute $f(\\tfrac12) = \\tfrac32 - 2f(2)$: $f(2) + 3 - 4f(2) = 6$, so $f(2) = -1$.'],
  lambda: float(sp.solve([sp.Symbol('a') + 2 * sp.Symbol('b') - 6, sp.Symbol('b') + 2 * sp.Symbol('a') - sp.Rational(3, 2)],
                         [sp.Symbol('a'), sp.Symbol('b')])[sp.Symbol('a')]))
q(1150, ['algebra'], 'How many integers $x$ satisfy $x^2 < 30$?', '11',
  ['$x^2 < 30$ means $-5 \\le x \\le 5$ for integers ($6^2 = 36$).', 'That is $11$ integers.'],
  lambda: sum(1 for t in range(-100, 100) if t * t < 30))

# ------------------------------------------------------------------ logs & exponents
q(950, ['logarithms'], 'What is $\\log_3 81$?', '4', ['$3^4 = 81$.'], lambda: log(81, 3))
q(1000, ['logarithms'], 'What is $\\log_2 32 - \\log_2 4$?', '3', ['$\\log_2 \\frac{32}{4} = \\log_2 8 = 3$.'], lambda: log(32, 2) - log(4, 2))
q(1350, ['logarithms'], 'If $\\log_x 64 = \\frac{3}{2}$, what is $x$?', '16',
  ['$x^{3/2} = 64$, so $x = 64^{2/3} = (\\sqrt[3]{64})^2 = 16$.'], lambda: 64 ** (2 / 3))
q(1050, ['exponents'], 'What is $8^{2/3}$?', '4', ['$8^{2/3} = (\\sqrt[3]{8})^2 = 2^2 = 4$.'], lambda: 8 ** (2 / 3))
q(1150, ['exponents'], 'Solve for $x$: $9^x = 27$. (A fraction like 3/2 is fine.)', '3/2',
  ['Write both as powers of 3: $3^{2x} = 3^3$.', '$2x = 3$, so $x = \\frac32$.'], lambda: log(27, 9))
q(1150, ['logarithms'], 'What is $\\log_{10} 2 + \\log_{10} 50$?', '2', ['$\\log_{10}(2 \\cdot 50) = \\log_{10} 100 = 2$.'], lambda: math.log10(2) + math.log10(50))
q(1100, ['exponents'], 'What is $27^{1/3} \\cdot 16^{3/4}$?', '24', ['$27^{1/3} = 3$ and $16^{3/4} = (\\sqrt[4]{16})^3 = 8$.', '$3 \\cdot 8 = 24$.'], lambda: 27 ** (1 / 3) * 16 ** 0.75)
q(1200, ['logarithms'], 'What is $\\log_4 8$? (A fraction like 3/2 is fine.)', '3/2', ['$4^{3/2} = 8$, or $\\frac{\\log_2 8}{\\log_2 4} = \\frac32$.'], lambda: log(8, 4))
q(1500, ['logarithms'], 'What is $(\\log_2 9)(\\log_3 8)$?', '6',
  ['$\\log_2 9 = 2\\log_2 3$ and $\\log_3 8 = 3\\log_3 2$.', 'Product: $6 \\log_2 3 \\cdot \\log_3 2 = 6$.'], lambda: log(9, 2) * log(8, 3))

# ------------------------------------------------------------------ number theory
q(1100, ['number theory'], 'What is $\\gcd(84, 126)$?', '42', ['$84 = 2 \\cdot 42$ and $126 = 3 \\cdot 42$, with $\\gcd(2, 3) = 1$.'], lambda: gcd(84, 126))
q(1150, ['number theory'], 'What is the least common multiple of $12$, $18$ and $30$?', '180', ['$12 = 2^2 \\cdot 3$, $18 = 2 \\cdot 3^2$, $30 = 2 \\cdot 3 \\cdot 5$.', 'LCM $= 2^2 \\cdot 3^2 \\cdot 5 = 180$.'], lambda: lcm(12, 18, 30))
q(1300, ['number theory'], 'What is the remainder when $3^{20}$ is divided by $5$?', '1', ['$3^4 = 81 \\equiv 1 \\pmod 5$.', '$3^{20} = (3^4)^5 \\equiv 1$.'], lambda: pow(3, 20, 5))
q(1350, ['number theory'], 'How many positive divisors does $720$ have?', '30', ['$720 = 2^4 \\cdot 3^2 \\cdot 5$.', '$(4+1)(2+1)(1+1) = 30$.'], lambda: len(divisors(720)))
q(950, ['number theory'], 'What is the sum of the digits of $2^{10}$?', '7', ['$2^{10} = 1024$; $1 + 0 + 2 + 4 = 7$.'], lambda: sum(map(int, str(2**10))))
q(1250, ['number theory'], 'What is the units digit of $3^{2025}$?', '3', ['Units digits of powers of 3 cycle $3, 9, 7, 1$.', '$2025 \\equiv 1 \\pmod 4$, so the units digit is $3$.'], lambda: pow(3, 2025, 10))
q(1450, ['number theory'], 'What is the smallest positive integer that leaves remainder 2 when divided by 3, remainder 3 when divided by 5, and remainder 2 when divided by 7?', '23',
  ['Remainder 2 mod 3 and mod 7 means $n \\equiv 2 \\pmod{21}$: $2, 23, 44, \\ldots$', '$23 \\equiv 3 \\pmod 5$. ✓'],
  lambda: next(m for m in range(1, 1000) if m % 3 == 2 and m % 5 == 3 and m % 7 == 2))
q(1100, ['number theory'], 'How many primes are less than $50$?', '15', ['$2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47$.'], lambda: sum(1 for m in range(50) if is_prime(m)))
q(1400, ['number theory'], 'How many zeros does $125!$ end with?', '31', ['Count factors of 5: $\\lfloor 125/5 \\rfloor + \\lfloor 125/25 \\rfloor + \\lfloor 125/125 \\rfloor = 25 + 5 + 1$.'],
  lambda: len(str(factorial(125))) - len(str(factorial(125)).rstrip('0')))
q(1500, ['number theory'], 'What is the largest prime factor of $2^{12} - 1$?', '13', ['$2^{12} - 1 = (2^6 - 1)(2^6 + 1) = 63 \\cdot 65 = 3^2 \\cdot 7 \\cdot 5 \\cdot 13$.'],
  lambda: max(p for p in range(2, 4096) if (2**12 - 1) % p == 0 and is_prime(p)))
q(1550, ['number theory'], 'How many integers from $1$ to $100$ share no common factor (other than 1) with $100$?', '40',
  ['Count numbers divisible by neither 2 nor 5: $100 - 50 - 20 + 10 = 40$.', '(This is Euler\'s $\\varphi(100) = 100 \\cdot \\frac12 \\cdot \\frac45$.)'], lambda: phi(100))
q(1450, ['number theory'], 'What is the remainder when $1! + 2! + 3! + \\cdots + 100!$ is divided by $12$?', '9',
  ['From $4! = 24$ on, every factorial is divisible by 12.', '$1 + 2 + 6 = 9$.'], lambda: sum(factorial(i) for i in range(1, 101)) % 12)
q(1400, ['number theory'], 'What is the sum of all positive divisors of $60$?', '168', ['$60 = 2^2 \\cdot 3 \\cdot 5$.', '$(1+2+4)(1+3)(1+5) = 7 \\cdot 4 \\cdot 6 = 168$.'], lambda: sum(divisors(60)))
q(1650, ['number theory'], 'How many perfect squares divide $2^4 \\cdot 3^6$?', '12',
  ['A square divisor is $2^a 3^b$ with $a, b$ even.', '$a \\in \\{0, 2, 4\\}$ (3 ways), $b \\in \\{0, 2, 4, 6\\}$ (4 ways): $12$.'],
  lambda: sum(1 for d in divisors(2**4 * 3**6) if isqrt(d) ** 2 == d))
q(1700, ['number theory'], 'What are the last two digits of $7^{100}$? (Answer as a number, e.g. 1 for 01.)', '1',
  ['$7^4 = 2401 \\equiv 1 \\pmod{100}$.', '$7^{100} = (7^4)^{25} \\equiv 1$: the last two digits are $01$.'], lambda: pow(7, 100, 100))
q(1900, ['number theory'], 'How many ordered pairs of positive integers $(a, b)$ have $\\operatorname{lcm}(a, b) = 72$?', '35',
  ['$72 = 2^3 \\cdot 3^2$. For each prime, the larger exponent must equal the exponent in 72.',
   'For $2^3$: $2 \\cdot 3 + 1 = 7$ exponent pairs; for $3^2$: $2 \\cdot 2 + 1 = 5$. Total $35$.'],
  lambda: sum(1 for a in range(1, 73) for b in range(1, 73) if a * b // gcd(a, b) == 72))
q(1400, ['number theory'], 'How many digits does $2^{10} \\cdot 5^{7}$ have?', '8', ['$2^{10} 5^7 = 2^3 \\cdot 10^7 = 8 \\cdot 10^7 = 80{,}000{,}000$.'], lambda: len(str(2**10 * 5**7)))
q(1100, ['number theory'], 'Write the binary number $101101_2$ in base 10.', '45', ['$32 + 8 + 4 + 1 = 45$.'], lambda: int('101101', 2))
q(900, ['sequences'], 'What is the sum of the first $20$ odd positive integers?', '400', ['The sum of the first $n$ odd numbers is $n^2 = 400$.'], lambda: sum(range(1, 40, 2)))
q(1400, ['number theory'], 'What is the remainder when $2^{2025}$ is divided by $7$?', '1', ['$2^3 = 8 \\equiv 1 \\pmod 7$.', '$2025 = 3 \\cdot 675$, so $2^{2025} \\equiv 1$.'], lambda: pow(2, 2025, 7))
q(1600, ['number theory'], 'How many positive integers $n \\le 1000$ are perfect squares or perfect cubes (or both)?', '38',
  ['Squares: $31$ ($31^2 = 961$). Cubes: $10$. Both (sixth powers): $1, 64, 729$ — 3.', '$31 + 10 - 3 = 38$.'],
  lambda: sum(1 for m in range(1, 1001) if isqrt(m) ** 2 == m or round(m ** (1 / 3)) ** 3 == m))
q(2000, ['number theory'], 'What is the sum of all positive integers $n$ for which $n^2 - 19n + 99$ is a perfect square?', '38',
  ['Set $n^2 - 19n + 99 = m^2$ and multiply by 4: $(2n - 19)^2 + 35 = 4m^2$.', 'So $(2m - 2n + 19)(2m + 2n - 19) = 35$: factor pairs $1 \\cdot 35$ and $5 \\cdot 7$.',
   'Solutions $n = 1, 9, 10, 18$, which sum to $38$.'],
  lambda: sum(m for m in range(1, 10000) if isqrt(m * m - 19 * m + 99) ** 2 == m * m - 19 * m + 99))
q(1400, ['number theory'], 'For how many positive integers $n$ is $\\frac{n + 18}{n}$ an integer?', '6', ['$\\frac{n+18}{n} = 1 + \\frac{18}{n}$, so $n$ must divide 18.', '18 has $6$ divisors: $1, 2, 3, 6, 9, 18$.'],
  lambda: sum(1 for m in range(1, 100) if (m + 18) % m == 0))
q(1850, ['number theory'], 'What is the units digit of $7^{7^7}$?', '3',
  ['Units digits of powers of 7 cycle with period 4: $7, 9, 3, 1$.', '$7^7 \\equiv (-1)^7 = -1 \\equiv 3 \\pmod 4$.', 'So the units digit is the 3rd in the cycle: $3$.'],
  lambda: pow(7, 7**7, 10))
q(1800, ['number theory'], 'How many ordered pairs of integers $(x, y)$ satisfy $x^2 - y^2 = 15$?', '8',
  ['$(x - y)(x + y) = 15$. Each factorization $15 = d \\cdot e$ (with signs) gives $x = \\frac{d+e}{2}$, $y = \\frac{e-d}{2}$.',
   'Both factors are odd, so all $4$ positive and $4$ negative factor pairs work: $8$.'],
  lambda: sum(1 for a in range(-20, 21) for b in range(-20, 21) if a * a - b * b == 15))
q(1600, ['number theory'], 'What is the smallest $n$ such that $n!$ is divisible by $1000$?', '15', ['$1000 = 2^3 5^3$; factors of 2 are plentiful, so we need three factors of 5.', '$5, 10, 15$: the smallest is $n = 15$.'],
  lambda: next(m for m in range(1, 100) if factorial(m) % 1000 == 0))
q(1500, ['number theory'], 'How many positive integers less than $200$ are divisible by $7$ but not by $11$?', '26',
  ['Multiples of 7 below 200: $\\lfloor 199/7 \\rfloor = 28$. Multiples of 77: $77, 154$ — 2.', '$28 - 2 = 26$.'],
  lambda: sum(1 for m in range(1, 200) if m % 7 == 0 and m % 11))
q(1250, ['sequences'], 'What is the sum of all integers from $-50$ to $52$, inclusive?', '103', ['$-50$ to $50$ cancels out, leaving $51 + 52 = 103$.'], lambda: sum(range(-50, 53)))
q(1900, ['number theory'], 'How many ordered pairs of positive integers $(a, b)$ satisfy $a^2 - b^2 = 2025$?', '7',
  ['$(a - b)(a + b) = 2025 = 3^4 \\cdot 5^2$, which has $15$ divisors, all odd.', 'Each factor pair $d < e$ gives one solution (the pair $45 \\cdot 45$ gives $b = 0$): $7$ pairs.'],
  lambda: sum(1 for b in range(1, 2025) if isqrt(2025 + b * b) ** 2 == 2025 + b * b))
q(1250, ['number theory'], 'How many three-digit palindromes are there?', '90', ['A palindrome $\\overline{aba}$: $a$ has 9 choices (1–9), $b$ has 10.', '$9 \\cdot 10 = 90$.'],
  lambda: sum(1 for m in range(100, 1000) if str(m) == str(m)[::-1]))
q(1600, ['probability', 'number theory'], 'A positive divisor of $60$ is chosen at random. What is the probability that it is even?', '2/3',
  ['$60 = 2^2 \\cdot 3 \\cdot 5$ has $12$ divisors; the odd ones are the divisors of $15$: $4$.', 'Even: $8/12 = 2/3$.'],
  lambda: sum(1 for d in divisors(60) if d % 2 == 0) / len(divisors(60)))

# ------------------------------------------------------------------ counting & probability
q(1050, ['counting'], 'How many ways are there to choose $3$ people from a group of $10$?', '120', ['$\\binom{10}{3} = \\frac{10 \\cdot 9 \\cdot 8}{6} = 120$.'], lambda: comb(10, 3))
q(1250, ['counting'], 'How many distinct arrangements of the letters in LEVEL are there?', '30', ['5 letters with L and E each twice: $\\frac{5!}{2!\\,2!} = 30$.'],
  lambda: len(set(itertools.permutations('LEVEL'))))
q(1200, ['counting', 'geometry'], 'How many diagonals does a decagon (10 sides) have?', '35', ['$\\frac{n(n-3)}{2} = \\frac{10 \\cdot 7}{2} = 35$.'], lambda: comb(10, 2) - 10)
q(1300, ['counting'], 'How many shortest grid paths go from $(0, 0)$ to $(4, 3)$, moving one unit right or up at a time?', '35', ['Choose which $3$ of the $7$ steps go up: $\\binom{7}{3} = 35$.'],
  lambda: sum(1 for p in itertools.product('RU', repeat=7) if p.count('U') == 3))
q(1250, ['probability'], 'A fair coin is flipped $4$ times. What is the probability of exactly $2$ heads?', '3/8', ['$\\binom42 / 2^4 = 6/16 = 3/8$.'],
  lambda: sum(1 for p in itertools.product('HT', repeat=4) if p.count('H') == 2) / 16)
q(1150, ['probability'], 'Two fair dice are rolled. What is the probability that the sum is $8$?', '5/36', ['Pairs: $(2,6), (3,5), (4,4), (5,3), (6,2)$ — 5 of 36.'],
  lambda: sum(1 for a in range(1, 7) for b in range(1, 7) if a + b == 8) / 36)
q(1000, ['counting'], 'Twelve people each shake hands with everyone else exactly once. How many handshakes are there?', '66', ['$\\binom{12}{2} = 66$.'], lambda: comb(12, 2))
q(1350, ['counting'], 'In how many ways can $5$ people sit around a round table (rotations count as the same)?', '24', ['Fix one person\'s seat and arrange the rest: $4! = 24$.'], lambda: factorial(5) // 5)
q(1400, ['counting'], 'How many four-digit numbers have only even digits?', '500', ['First digit: $2, 4, 6, 8$ (4 choices); others: $0, 2, 4, 6, 8$ (5 each).', '$4 \\cdot 5^3 = 500$.'],
  lambda: sum(1 for m in range(1000, 10000) if all(int(c) % 2 == 0 for c in str(m))))
q(1100, ['counting'], 'How many nonempty subsets does $\\{1, 2, 3, 4, 5, 6, 7, 8\\}$ have?', '255', ['$2^8 - 1 = 255$.'], lambda: 2**8 - 1)
q(1450, ['counting'], 'How many ordered triples of nonnegative integers $(a, b, c)$ satisfy $a + b + c = 10$?', '66', ['Stars and bars: $\\binom{10 + 2}{2} = 66$.'],
  lambda: sum(1 for a in range(11) for b in range(11) if a + b <= 10))
q(1550, ['counting'], 'How many ordered quadruples of positive integers $(a, b, c, d)$ satisfy $a + b + c + d = 10$?', '84', ['Stars and bars with each part $\\ge 1$: $\\binom{9}{3} = 84$.'],
  lambda: sum(1 for a in range(1, 10) for b in range(1, 10) for c in range(1, 10) if 10 - a - b - c >= 1))
q(1700, ['probability'], 'A random permutation of $1, 2, 3, 4$ is chosen. What is the probability that no number is in its original position?', '3/8',
  ['Derangements of 4: $!4 = 9$.', '$9/24 = 3/8$.'], lambda: sum(1 for p in itertools.permutations(range(4)) if all(p[i] != i for i in range(4))) / 24)
q(1550, ['probability'], 'Two fair dice are rolled. What is the expected value of the product of the two numbers? (A fraction like 49/4 is fine.)', '49/4',
  ['The dice are independent, so $E[XY] = E[X]\\,E[Y] = 3.5^2 = \\frac{49}{4}$.'], lambda: sum(a * b for a in range(1, 7) for b in range(1, 7)) / 36)
q(1350, ['probability'], 'On average, how many rolls of a fair die does it take to get the first $6$?', '6', ['Geometric distribution with $p = \\frac16$: expected value $\\frac1p = 6$.'],
  lambda: sum(i * (5 / 6) ** (i - 1) / 6 for i in range(1, 2000)))
q(1350, ['counting'], 'In how many ways can $6$ different books be arranged on a shelf if two particular books must be next to each other?', '240',
  ['Glue the two books together: $5!$ arrangements, times $2$ orders inside the pair.', '$2 \\cdot 120 = 240$.'],
  lambda: sum(1 for p in itertools.permutations(range(6)) if abs(p.index(0) - p.index(1)) == 1))
q(1600, ['counting', 'geometry'], 'How many rectangles (of any size) are there in a $4 \\times 4$ grid of unit squares?', '100', ['Choose 2 of the 5 vertical lines and 2 of the 5 horizontal lines: $\\binom52^2 = 100$.'],
  lambda: sum(1 for a in range(5) for b in range(a + 1, 5) for c in range(5) for d in range(c + 1, 5)))
q(1200, ['counting', 'geometry'], 'How many triangles have all three vertices among the vertices of a regular octagon?', '56', ['$\\binom83 = 56$ (no three vertices are collinear).'], lambda: comb(8, 3))
q(1450, ['probability'], 'Two cards are drawn from a standard 52-card deck without replacement. What is the probability that both are hearts?', '1/17',
  ['$\\frac{13}{52} \\cdot \\frac{12}{51} = \\frac14 \\cdot \\frac{4}{17} = \\frac{1}{17}$.'], lambda: comb(13, 2) / comb(52, 2))
q(1800, ['counting', 'recursion'], 'In how many ways can a $2 \\times 8$ board be tiled with $1 \\times 2$ dominoes?', '34',
  ['Let $t_n$ count tilings of $2 \\times n$: the left end is one vertical domino or two horizontal ones, so $t_n = t_{n-1} + t_{n-2}$.', '$1, 2, 3, 5, 8, 13, 21, 34$.'],
  lambda: (lambda f: f(f, 8))(lambda f, m: 1 if m <= 1 else f(f, m - 1) + f(f, m - 2)))
q(1750, ['counting', 'recursion'], 'How many binary strings of length $8$ have no two consecutive 1s?', '55', ['These follow the Fibonacci numbers: lengths $1, 2, 3, \\ldots$ give $2, 3, 5, 8, 13, 21, 34, 55$.'],
  lambda: sum(1 for p in itertools.product('01', repeat=8) if '11' not in ''.join(p)))
q(1600, ['counting', 'recursion'], 'In how many ways can you climb $10$ stairs taking $1$ or $2$ steps at a time?', '89', ['$w_n = w_{n-1} + w_{n-2}$ with $w_1 = 1$, $w_2 = 2$: $1, 2, 3, 5, 8, 13, 21, 34, 55, 89$.'],
  lambda: (lambda f: f(f, 10))(lambda f, m: 1 if m <= 1 else f(f, m - 1) + f(f, m - 2)))
q(1800, ['counting'], 'Five people each write their name on a slip; the slips are shuffled and handed back. In how many ways can nobody get their own slip?', '44',
  ['Derangements: $!5 = 5!\\left(1 - 1 + \\frac1{2!} - \\frac1{3!} + \\frac1{4!} - \\frac1{5!}\\right) = 44$.'],
  lambda: sum(1 for p in itertools.permutations(range(5)) if all(p[i] != i for i in range(5))))
q(1550, ['number theory', 'geometry'], 'How many lattice points (points with integer coordinates) lie on the circle $x^2 + y^2 = 25$?', '12',
  ['$(\\pm5, 0), (0, \\pm5)$, and $(\\pm3, \\pm4), (\\pm4, \\pm3)$.', '$4 + 8 = 12$.'],
  lambda: sum(1 for a in range(-6, 7) for b in range(-6, 7) if a * a + b * b == 25))
q(1000, ['probability'], 'Three fair coins are flipped. What is the probability of at least one head?', '7/8', ['$1 - P(\\text{no heads}) = 1 - \\frac18 = \\frac78$.'], lambda: 1 - 1 / 8)
q(1500, ['counting'], 'A committee of $3$ is chosen from $5$ men and $4$ women. How many committees include at least one woman?', '74', ['All committees minus all-men: $\\binom93 - \\binom53 = 84 - 10 = 74$.'],
  lambda: sum(1 for c in itertools.combinations(range(9), 3) if any(i >= 5 for i in c)))
q(1350, ['counting'], 'How many distinct arrangements of the letters in BANANA are there?', '60', ['$\\frac{6!}{3!\\,2!} = 60$ (three A\'s, two N\'s).'], lambda: len(set(itertools.permutations('BANANA'))))
q(1550, ['probability'], 'Two different numbers are chosen at random from $1, 2, \\ldots, 10$. What is the probability that their sum is even?', '4/9',
  ['The sum is even when both are even or both are odd: $2\\binom52 = 20$ of $\\binom{10}{2} = 45$ pairs.', '$20/45 = 4/9$.'],
  lambda: sum(1 for a, b in itertools.combinations(range(1, 11), 2) if (a + b) % 2 == 0) / comb(10, 2))
q(1650, ['counting'], 'How many integers from $1$ to $100$ are divisible by $2$, $3$ or $5$?', '74', ['Inclusion–exclusion: $50 + 33 + 20 - 16 - 10 - 6 + 3 = 74$.'],
  lambda: sum(1 for m in range(1, 101) if m % 2 == 0 or m % 3 == 0 or m % 5 == 0))
q(1500, ['counting'], 'In how many ways can $5$ identical balls be put into $3$ different boxes?', '21', ['Stars and bars: $\\binom{5+2}{2} = 21$.'],
  lambda: sum(1 for a in range(6) for b in range(6) if a + b <= 5))
q(1550, ['probability'], 'Two cards are drawn from a standard 52-card deck without replacement. What is the probability that they are the same suit?', '4/17',
  ['Whatever the first card, $12$ of the remaining $51$ match its suit.', '$12/51 = 4/17$.'], lambda: 4 * comb(13, 2) / comb(52, 2))
q(1700, ['counting'], 'How many ways can you make $25$ cents from pennies, nickels and dimes?', '12',
  ['0 dimes: 0–5 nickels (6 ways). 1 dime: 0–3 nickels (4). 2 dimes: 0–1 nickels (2).', '$6 + 4 + 2 = 12$.'],
  lambda: sum(1 for d in range(3) for nk in range(6) if 10 * d + 5 * nk <= 25))
q(1800, ['counting'], 'In how many ways can $8$ people be split into $4$ unordered pairs?', '105', ['$7 \\cdot 5 \\cdot 3 \\cdot 1 = 105$: the first person has 7 partners, the next unpaired person 5, and so on.'],
  lambda: factorial(8) // (2**4 * factorial(4)))
q(1550, ['counting', 'geometry'], 'How many squares (of any size) are in a $5 \\times 5$ grid of unit squares?', '55',
  ['$k \\times k$ squares: $(6-k)^2$ of them. $25 + 16 + 9 + 4 + 1 = 55$.'], lambda: sum((6 - t) ** 2 for t in range(1, 6)))
q(1700, ['counting', 'geometry'], 'Into how many regions do $4$ lines divide the plane if no two are parallel and no three meet at a point?', '11',
  ['The $k$-th line crosses the previous $k-1$ lines and adds $k$ regions.', '$1 + 1 + 2 + 3 + 4 = 11$.'], lambda: 1 + sum(range(1, 5)))
q(1550, ['probability', 'geometry'], 'A point is chosen at random in a square of side $2$. What is the probability that it is within distance $1$ of the center? (An answer like pi/4 is fine.)', 'pi/4',
  ['The good region is the inscribed circle of radius 1: area $\\pi$.', '$\\pi / 4$.'], lambda: pi / 4)
q(1450, ['probability'], 'A fair die is rolled twice. What is the probability that the second roll is greater than the first?', '5/12',
  ['$P(\\text{equal}) = \\frac16$, and "greater" and "less" are equally likely.', '$\\frac12\\left(1 - \\frac16\\right) = \\frac{5}{12}$.'],
  lambda: sum(1 for a in range(1, 7) for b in range(1, 7) if b > a) / 36)
q(1700, ['probability'], 'A random permutation of $1, 2, \\ldots, 10$ is chosen. What is the expected number of numbers that stay in their original position?', '1',
  ['Linearity of expectation: each number stays put with probability $\\frac{1}{10}$.', '$10 \\cdot \\frac{1}{10} = 1$.'],
  lambda: sum(sum(1 for i in range(5) if p[i] == i) for p in itertools.permutations(range(5))) / factorial(5))

# ------------------------------------------------------------------ geometry
q(1050, ['geometry'], 'A circle has circumference $10\\pi$. What is its area? (An answer like 25pi is fine.)', '25pi', ['$2\\pi r = 10\\pi$, so $r = 5$ and the area is $25\\pi$.'], lambda: pi * 25)
q(1050, ['geometry'], 'A right triangle has legs $8$ and $15$. What is its hypotenuse?', '17', ['$\\sqrt{64 + 225} = \\sqrt{289} = 17$ (an 8–15–17 right triangle).'], lambda: sqrt(64 + 225))
q(950, ['geometry'], 'What is each interior angle of a regular hexagon, in degrees?', '120', ['$\\frac{(6-2) \\cdot 180}{6} = 120$.'], lambda: (6 - 2) * 180 / 6)
q(1050, ['geometry'], 'What is the sum of the interior angles of a decagon, in degrees?', '1440', ['$(10 - 2) \\cdot 180 = 1440$.'], lambda: 8 * 180)
q(1250, ['geometry'], 'What is the area of an equilateral triangle with side $6$? (An answer like 9sqrt(3) is fine.)', '9sqrt(3)', ['Area $= \\frac{\\sqrt3}{4} s^2 = \\frac{\\sqrt3}{4} \\cdot 36 = 9\\sqrt3$.'], lambda: sqrt(3) / 4 * 36)
q(1300, ['geometry'], 'What is the length of the space diagonal of a cube with side $4$? (An answer like 4sqrt(3) is fine.)', '4sqrt(3)', ['$\\sqrt{4^2 + 4^2 + 4^2} = 4\\sqrt3$.'], lambda: sqrt(48))
q(1200, ['geometry'], 'What is the area of the triangle with vertices $(0, 0)$, $(4, 0)$ and $(1, 5)$?', '10', ['Base $4$ along the x-axis, height $5$: $\\frac12 \\cdot 4 \\cdot 5 = 10$.'],
  lambda: abs(4 * 5 - 0 * 1) / 2)
q(1450, ['geometry'], 'What is the distance from the point $(3, 4)$ to the line $3x + 4y = 0$?', '5', ['$\\frac{|3 \\cdot 3 + 4 \\cdot 4|}{\\sqrt{3^2 + 4^2}} = \\frac{25}{5} = 5$.'], lambda: abs(9 + 16) / 5)
q(1400, ['geometry'], 'What is the radius of the circle $x^2 + y^2 - 6x + 8y = 0$?', '5', ['Complete the squares: $(x-3)^2 + (y+4)^2 = 25$.', 'Radius $5$.'], lambda: sqrt(9 + 16))
q(1100, ['geometry'], 'What is the volume of a sphere of radius $3$? (An answer like 36pi is fine.)', '36pi', ['$\\frac43 \\pi r^3 = \\frac43 \\pi \\cdot 27 = 36\\pi$.'], lambda: 4 / 3 * pi * 27)
q(1450, ['geometry'], 'What is the radius of the circle inscribed in a $5$–$12$–$13$ right triangle?', '2', ['For a right triangle $r = \\frac{a + b - c}{2} = \\frac{5 + 12 - 13}{2} = 2$.', '(Or $r = \\text{Area}/s = 30/15$.)'],
  lambda: (5 * 12 / 2) / ((5 + 12 + 13) / 2))
q(1400, ['geometry'], 'What is the radius of the circle passing through the vertices of a $5$–$12$–$13$ right triangle? (A fraction like 13/2 is fine.)', '13/2',
  ['The hypotenuse of a right triangle is a diameter of its circumcircle.', 'Radius $= \\frac{13}{2}$.'], lambda: 5 * 12 * 13 / (4 * 30))
q(1500, ['geometry'], 'A rectangle has perimeter $20$ and area $21$. How long is its diagonal? (An answer like sqrt(58) is fine.)', 'sqrt(58)',
  ['Sides $a + b = 10$, $ab = 21$.', 'Diagonal$^2 = a^2 + b^2 = (a+b)^2 - 2ab = 100 - 42 = 58$.'], lambda: sqrt(3**2 + 7**2))
q(1350, ['geometry'], 'Chords $AB$ and $CD$ of a circle cross at $P$. If $AP = 3$, $PB = 8$ and $CP = 4$, what is $PD$?', '6',
  ['Intersecting chords: $AP \\cdot PB = CP \\cdot PD$.', '$24 = 4 \\cdot PD$, so $PD = 6$.'], lambda: 3 * 8 / 4)
q(1250, ['geometry'], 'What is the area of a square inscribed in a circle of radius $5$?', '50', ['The diagonal of the square is a diameter, $10$.', 'Area $= \\frac{d^2}{2} = 50$.'], lambda: (10 / sqrt(2)) ** 2)
q(1600, ['geometry'], 'What is the area of a triangle with sides $7$, $8$ and $9$? (An answer like 12sqrt(5) is fine.)', '12sqrt(5)',
  ['Heron: $s = 12$, area $= \\sqrt{12 \\cdot 5 \\cdot 4 \\cdot 3} = \\sqrt{720} = 12\\sqrt5$.'], lambda: sqrt(12 * 5 * 4 * 3))
q(1250, ['geometry'], 'What is the smaller angle between the hour and minute hands of a clock at 3:30, in degrees?', '75',
  ['Minute hand: $180°$. Hour hand: $90° + 15° = 105°$ (it moves $0.5°$ per minute).', 'Difference: $75°$.'], lambda: abs(180 - (90 + 30 * 0.5)))
q(1150, ['geometry'], 'What is the volume of a cone with radius $3$ and height $4$? (An answer like 12pi is fine.)', '12pi', ['$\\frac13 \\pi r^2 h = \\frac13 \\pi \\cdot 9 \\cdot 4 = 12\\pi$.'], lambda: pi * 9 * 4 / 3)
q(1300, ['geometry'], 'A regular polygon has interior angles of $156°$. How many sides does it have?', '15', ['Each exterior angle is $180° - 156° = 24°$.', '$360° / 24° = 15$ sides.'], lambda: 360 / (180 - 156))
q(1000, ['geometry'], 'The angles of a triangle are in the ratio $2 : 3 : 4$. What is the largest angle, in degrees?', '80', ['$2k + 3k + 4k = 180$, so $k = 20$.', 'Largest: $4k = 80$.'], lambda: 4 * 180 / 9)
q(1450, ['geometry'], 'What is the area enclosed by $|x| + |y| = 4$?', '32', ['It is a square (diamond) with diagonals of length $8$.', 'Area $= \\frac{8 \\cdot 8}{2} = 32$.'],
  lambda: abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip([(4, 0), (0, 4), (-4, 0), (0, -4)], [(0, 4), (-4, 0), (0, -4), (4, 0)]))) / 2)
q(1350, ['geometry'], 'What is the area of the triangle formed by the lines $y = x$, $y = -x$ and $y = 6$?', '36', ['Vertices $(0,0)$, $(6,6)$, $(-6,6)$: base $12$, height $6$.', 'Area $= 36$.'], lambda: 12 * 6 / 2)
q(1500, ['geometry'], 'A tangent is drawn from the point $(7, 0)$ to the circle $x^2 + y^2 = 24$. How long is the tangent segment?', '5',
  ['Tangent length$^2$ = (distance to center)$^2$ − radius$^2$ $= 49 - 24 = 25$.', 'Length $5$.'], lambda: sqrt(49 - 24))
q(1150, ['geometry'], 'What is the largest possible area of a rectangle with perimeter $40$?', '100', ['For a fixed perimeter the square is best: side $10$, area $100$.'], lambda: max(w * (20 - w) for w in [i / 100 for i in range(0, 2001)]))
q(1300, ['geometry'], 'Two similar triangles have areas in the ratio $9 : 16$. What is the ratio of their perimeters? (A fraction like 3/4 is fine.)', '3/4',
  ['Areas scale with the square of lengths, so lengths scale by $\\sqrt{9/16} = 3/4$.'], lambda: sqrt(9 / 16))
q(1250, ['geometry'], 'What is the distance between the points $(1, 2, 3)$ and $(4, 6, 15)$?', '13', ['$\\sqrt{3^2 + 4^2 + 12^2} = \\sqrt{169} = 13$.'], lambda: sqrt(9 + 16 + 144))
q(1150, ['geometry'], 'An inscribed angle intercepts an arc of $100°$. How large is the angle, in degrees?', '50', ['An inscribed angle is half its intercepted arc: $50°$.'], lambda: 100 / 2)
q(1550, ['geometry'], 'A regular hexagon has area $54\\sqrt{3}$. What is its side length?', '6', ['A regular hexagon is 6 equilateral triangles: area $= \\frac{3\\sqrt3}{2} s^2$.', '$\\frac{3\\sqrt3}{2} s^2 = 54\\sqrt3$ gives $s^2 = 36$, so $s = 6$.'],
  lambda: sqrt(54 * sqrt(3) / (3 * sqrt(3) / 2)))
q(1350, ['geometry'], 'What is the area of the quadrilateral with vertices $(0, 0)$, $(5, 0)$, $(5, 3)$ and $(0, 7)$?', '25',
  ['It is a trapezoid with parallel vertical sides $7$ and $3$, a distance $5$ apart.', 'Area $= \\frac{7 + 3}{2} \\cdot 5 = 25$.'],
  lambda: abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip([(0, 0), (5, 0), (5, 3), (0, 7)], [(5, 0), (5, 3), (0, 7), (0, 0)]))) / 2)
q(1350, ['geometry'], 'A convex polyhedron has $12$ vertices and $30$ edges. How many faces does it have?', '20', ['Euler\'s formula: $V - E + F = 2$.', '$12 - 30 + F = 2$, so $F = 20$.'], lambda: 2 - 12 + 30)
q(1400, ['geometry'], 'How many edges does a regular icosahedron (20 triangular faces) have?', '30', ['Each of the 20 triangles has 3 edges, and each edge is shared by 2 faces.', '$\\frac{20 \\cdot 3}{2} = 30$.'], lambda: 20 * 3 / 2)

# ------------------------------------------------------------------ trigonometry
q(900, ['trigonometry'], 'What is $\\sin^2 37° + \\cos^2 37°$?', '1', ['$\\sin^2\\theta + \\cos^2\\theta = 1$ for every angle.'], lambda: math.sin(math.radians(37)) ** 2 + math.cos(math.radians(37)) ** 2)
q(1000, ['trigonometry'], 'What is $\\sin 30° \\cdot \\cos 60°$?', '1/4', ['$\\frac12 \\cdot \\frac12 = \\frac14$.'], lambda: math.sin(math.radians(30)) * math.cos(math.radians(60)))
q(1150, ['trigonometry'], 'If $\\sin\\theta = \\frac35$ and $\\theta$ is acute, what is $\\tan\\theta$?', '3/4', ['$\\cos\\theta = \\frac45$ (a 3–4–5 triangle).', '$\\tan\\theta = \\frac{3/5}{4/5} = \\frac34$.'],
  lambda: math.tan(math.asin(3 / 5)))
q(1350, ['trigonometry'], 'If $\\cos\\theta = \\frac13$, what is $\\cos 2\\theta$? (A fraction like -7/9 is fine.)', '-7/9', ['$\\cos 2\\theta = 2\\cos^2\\theta - 1 = \\frac29 - 1 = -\\frac79$.'], lambda: math.cos(2 * math.acos(1 / 3)))
q(1500, ['trigonometry'], 'What is $\\sin 15° \\cos 15°$?', '1/4', ['$\\sin\\theta\\cos\\theta = \\frac12 \\sin 2\\theta$.', '$\\frac12 \\sin 30° = \\frac14$.'], lambda: math.sin(math.radians(15)) * math.cos(math.radians(15)))
q(1550, ['trigonometry'], 'What is the exact value of $\\sin 75°$? (An answer like (sqrt(6)+sqrt(2))/4 is fine.)', '(sqrt(6)+sqrt(2))/4',
  ['$\\sin(45° + 30°) = \\sin45°\\cos30° + \\cos45°\\sin30°$.', '$= \\frac{\\sqrt2}{2}\\cdot\\frac{\\sqrt3}{2} + \\frac{\\sqrt2}{2}\\cdot\\frac12 = \\frac{\\sqrt6 + \\sqrt2}{4}$.'], lambda: math.sin(math.radians(75)))
q(1450, ['trigonometry'], 'What is the maximum value of $3\\sin x + 4\\cos x$?', '5', ['$a\\sin x + b\\cos x$ has maximum $\\sqrt{a^2 + b^2} = 5$.'],
  lambda: max(3 * math.sin(t / 1000) + 4 * math.cos(t / 1000) for t in range(0, 6284)))
q(1200, ['trigonometry'], 'How many solutions does $\\sin x = \\frac12$ have for $0 \\le x < 2\\pi$?', '2', ['$x = \\frac{\\pi}{6}$ and $x = \\frac{5\\pi}{6}$.'],
  lambda: len(sp.solveset(sp.sin(x) - sp.Rational(1, 2), x, sp.Interval.Ropen(0, 2 * sp.pi))))
q(1950, ['trigonometry'], 'What is $\\tan 20° \\tan 40° \\tan 80°$? (An answer like sqrt(3) is fine.)', 'sqrt(3)',
  ['Identity: $\\tan\\theta \\tan(60° - \\theta)\\tan(60° + \\theta) = \\tan 3\\theta$.', 'With $\\theta = 20°$: $\\tan 60° = \\sqrt3$.'],
  lambda: math.tan(math.radians(20)) * math.tan(math.radians(40)) * math.tan(math.radians(80)))
q(2000, ['trigonometry'], 'What is $\\cos 36° - \\cos 72°$?', '1/2',
  ['Let $a = \\cos 36°$, $b = \\cos 72°$. Using $\\cos 2\\theta = 2\\cos^2\\theta - 1$: $b = 2a^2 - 1$ and $-a = \\cos 144° = 2b^2 - 1$.',
   'Subtract: $a + b = 2(a^2 - b^2)$, so (as $a + b \\ne 0$) $a - b = \\frac12$.'],
  lambda: math.cos(math.radians(36)) - math.cos(math.radians(72)))
q(1950, ['trigonometry'], 'What is $\\sin 10° \\sin 50° \\sin 70°$?', '1/8',
  ['Identity: $\\sin\\theta \\sin(60° - \\theta)\\sin(60° + \\theta) = \\frac14 \\sin 3\\theta$.', 'With $\\theta = 10°$: $\\frac14 \\sin 30° = \\frac18$.'],
  lambda: math.sin(math.radians(10)) * math.sin(math.radians(50)) * math.sin(math.radians(70)))
q(1250, ['trigonometry'], 'What is the period of $f(x) = \\sin 3x$? (An answer like 2pi/3 is fine.)', '2pi/3', ['$\\sin(kx)$ has period $\\frac{2\\pi}{k}$.'], lambda: 2 * pi / 3)
q(1550, ['trigonometry'], 'In a triangle, $a = 7$, $b = 8$ and the angle between them is $60°$. What is the third side $c$? (An answer like sqrt(57) is fine.)', 'sqrt(57)',
  ['Law of cosines: $c^2 = 49 + 64 - 2 \\cdot 7 \\cdot 8 \\cos 60° = 113 - 56 = 57$.'], lambda: sqrt(49 + 64 - 2 * 7 * 8 * 0.5))
q(1850, ['trigonometry'], 'What is $\\sin^2 1° + \\sin^2 2° + \\cdots + \\sin^2 89°$? (A fraction like 89/2 is fine.)', '89/2',
  ['Pair $\\sin^2 k° + \\sin^2 (90 - k)° = \\sin^2 k° + \\cos^2 k° = 1$ for $k = 1, \\ldots, 44$.', 'That gives $44$, plus $\\sin^2 45° = \\frac12$: $\\frac{89}{2}$.'],
  lambda: sum(math.sin(math.radians(d)) ** 2 for d in range(1, 90)))

# ------------------------------------------------------------------ complex numbers
q(1000, ['complex numbers'], 'What is $|3 + 4i|$?', '5', ['$\\sqrt{3^2 + 4^2} = 5$.'], lambda: abs(3 + 4j))
q(1050, ['complex numbers'], 'What is $(2 + i)(2 - i)$?', '5', ['$4 - i^2 = 4 + 1 = 5$.'], lambda: ((2 + 1j) * (2 - 1j)).real)
q(1450, ['complex numbers'], 'Let $i^2 = -1$. What is $i + i^2 + i^3 + \\cdots + i^{100}$?', '0', ['Every 4 consecutive powers sum to $i - 1 - i + 1 = 0$, and $100$ is a multiple of 4.'],
  lambda: abs(sum(1j ** p for p in range(1, 101))))
q(1550, ['complex numbers'], 'What is the imaginary part of $(1 + i)^6$?', '-8', ['$(1 + i)^2 = 2i$, so $(1+i)^6 = (2i)^3 = -8i$.'], lambda: ((1 + 1j) ** 6).imag)
q(1550, ['complex numbers'], 'What is the product of the two non-real cube roots of $1$?', '1', ['They are $\\omega$ and $\\omega^2$ with $\\omega^3 = 1$.', '$\\omega \\cdot \\omega^2 = \\omega^3 = 1$.'],
  lambda: (complex(math.cos(2 * pi / 3), math.sin(2 * pi / 3)) * complex(math.cos(4 * pi / 3), math.sin(4 * pi / 3))).real)
q(1300, ['complex numbers'], 'What is $\\left|\\frac{1}{1 + i}\\right|$? (An answer like sqrt(2)/2 is fine.)', 'sqrt(2)/2', ['$\\left|\\frac{1}{1+i}\\right| = \\frac{1}{|1+i|} = \\frac{1}{\\sqrt2} = \\frac{\\sqrt2}{2}$.'], lambda: abs(1 / (1 + 1j)))
q(1500, ['complex numbers'], 'What is the sum of the five 5th roots of unity?', '0', ['They are the roots of $z^5 - 1 = 0$; by Vieta their sum is minus the $z^4$ coefficient, $0$.'],
  lambda: abs(sum(complex(math.cos(2 * pi * j / 5), math.sin(2 * pi * j / 5)) for j in range(5))))

# ------------------------------------------------------------------ calculus
q(1150, ['calculus'], 'What is the derivative of $x^3$ at $x = 2$?', '12', ['$\\frac{d}{dx} x^3 = 3x^2$, which is $12$ at $x = 2$.'], lambda: float(sp.diff(x**3, x).subs(x, 2)))
q(1250, ['calculus'], 'Evaluate $\\displaystyle\\int_0^2 3x^2 \\, dx$.', '8', ['$\\left[x^3\\right]_0^2 = 8$.'], lambda: integ(3 * x**2, 0, 2))
q(1150, ['calculus'], 'Evaluate $\\displaystyle\\lim_{x \\to 2} \\frac{x^2 - 4}{x - 2}$.', '4', ['$\\frac{(x-2)(x+2)}{x-2} = x + 2 \\to 4$.'], lambda: lim((x**2 - 4) / (x - 2), 2))
q(1350, ['calculus'], 'What is the derivative of $\\sin x \\cos x$ at $x = 0$?', '1', ['$\\sin x\\cos x = \\frac12 \\sin 2x$, whose derivative is $\\cos 2x$.', 'At $x = 0$: $1$.'],
  lambda: float(sp.diff(sp.sin(x) * sp.cos(x), x).subs(x, 0)))
q(1300, ['calculus'], 'Evaluate $\\displaystyle\\int_0^\\pi \\sin x \\, dx$.', '2', ['$\\left[-\\cos x\\right]_0^\\pi = 1 - (-1) = 2$.'], lambda: integ(sp.sin(x), 0, sp.pi))
q(1550, ['calculus'], 'Evaluate $\\displaystyle\\lim_{n \\to \\infty} \\left(1 + \\frac{1}{n}\\right)^{2n}$. (An answer like e^2 is fine.)', 'e^2',
  ['$\\left(1 + \\frac1n\\right)^{2n} = \\left[\\left(1 + \\frac1n\\right)^n\\right]^2 \\to e^2$.'], lambda: float(sp.limit((1 + 1 / n) ** (2 * n), n, sp.oo)))
q(1250, ['calculus'], 'What is the slope of the tangent line to $y = \\ln x$ at $x = 2$? (A fraction like 1/2 is fine.)', '1/2', ['$\\frac{d}{dx}\\ln x = \\frac1x$, which is $\\frac12$ at $x = 2$.'], lambda: 1 / 2)
q(1250, ['calculus'], 'Evaluate $\\displaystyle\\int_1^e \\frac{1}{x} \\, dx$.', '1', ['$\\left[\\ln x\\right]_1^e = 1 - 0 = 1$.'], lambda: integ(1 / x, 1, sp.E))
q(1650, ['calculus'], 'What is the maximum value of $f(x) = x e^{-x}$ for $x \\ge 0$? (An answer like 1/e is fine.)', '1/e',
  ['$f\'(x) = (1 - x)e^{-x} = 0$ at $x = 1$.', '$f(1) = e^{-1} = \\frac1e$.'], lambda: max(t / 1000 * math.exp(-t / 1000) for t in range(0, 20000)))
q(1550, ['calculus'], 'Evaluate $\\displaystyle\\lim_{x \\to 0} \\frac{1 - \\cos x}{x^2}$. (A fraction like 1/2 is fine.)', '1/2', ['$1 - \\cos x \\approx \\frac{x^2}{2}$ for small $x$ (or apply L\'Hôpital twice).'], lambda: lim((1 - sp.cos(x)) / x**2, 0))
q(1300, ['calculus'], 'Evaluate $\\displaystyle\\int_0^1 x(1 - x) \\, dx$. (A fraction like 1/6 is fine.)', '1/6', ['$\\int_0^1 (x - x^2)\\,dx = \\frac12 - \\frac13 = \\frac16$.'], lambda: integ(x * (1 - x), 0, 1))
q(1450, ['calculus'], 'Evaluate $\\displaystyle\\int_0^1 e^{2x} \\, dx$. (An answer like (e^2-1)/2 is fine.)', '(e^2-1)/2', ['$\\left[\\frac12 e^{2x}\\right]_0^1 = \\frac{e^2 - 1}{2}$.'], lambda: integ(sp.exp(2 * x), 0, 1))
q(1450, ['calculus'], 'What is the derivative of $e^{x^2}$ at $x = 1$? (An answer like 2e is fine.)', '2e', ['Chain rule: $\\frac{d}{dx} e^{x^2} = 2x e^{x^2}$.', 'At $x = 1$: $2e$.'], lambda: float(sp.diff(sp.exp(x**2), x).subs(x, 1)))
q(1100, ['calculus'], 'Evaluate $\\displaystyle\\lim_{x \\to \\infty} \\frac{3x^2 + 1}{x^2 - 5}$.', '3', ['Divide top and bottom by $x^2$: $\\frac{3 + 1/x^2}{1 - 5/x^2} \\to 3$.'], lambda: lim((3 * x**2 + 1) / (x**2 - 5), sp.oo))
q(1300, ['calculus'], 'Evaluate $\\displaystyle\\int_{-1}^{1} |x| \\, dx$.', '1', ['Two triangles of area $\\frac12$ each.'], lambda: integ(sp.Abs(x), -1, 1))
q(1000, ['series'], 'What is $1 + \\frac12 + \\frac14 + \\frac18 + \\cdots$?', '2', ['Geometric series: $\\frac{1}{1 - 1/2} = 2$.'], lambda: sum(0.5 ** i for i in range(200)))
q(1800, ['series'], 'Evaluate $\\displaystyle\\sum_{n=1}^{\\infty} \\frac{n}{2^n}$.', '2',
  ['$\\sum n r^n = \\frac{r}{(1 - r)^2}$ for $|r| < 1$.', 'With $r = \\frac12$: $\\frac{1/2}{1/4} = 2$.'], lambda: sum(i / 2**i for i in range(1, 200)))
q(1650, ['series'], 'Evaluate $\\displaystyle\\sum_{n=1}^{\\infty} \\frac{1}{n^2}$. (An answer like pi^2/6 is fine.)', 'pi^2/6', ['This is the Basel problem (Euler): $\\frac{\\pi^2}{6}$.'],
  lambda: float(sp.summation(1 / n**2, (n, 1, sp.oo))))
q(1450, ['calculus'], 'Evaluate $\\displaystyle\\int_0^\\infty e^{-2x} \\, dx$. (A fraction like 1/2 is fine.)', '1/2', ['$\\left[-\\frac12 e^{-2x}\\right]_0^\\infty = 0 + \\frac12$.'], lambda: integ(sp.exp(-2 * x), 0, sp.oo))
q(1400, ['calculus'], 'How many local extrema (maxima or minima) does $f(x) = x^3 - 3x$ have?', '2', ['$f\'(x) = 3x^2 - 3 = 0$ at $x = \\pm1$, and $f\'$ changes sign at both.', 'A local max at $x = -1$ and a local min at $x = 1$.'],
  lambda: len(real_roots(sp.diff(x**3 - 3 * x, x))))
q(1450, ['calculus'], 'Evaluate $\\displaystyle\\int_0^{\\pi/4} \\sec^2 x \\, dx$.', '1', ['$\\left[\\tan x\\right]_0^{\\pi/4} = 1 - 0$.'], lambda: integ(1 / sp.cos(x) ** 2, 0, sp.pi / 4))
q(1700, ['calculus'], 'Evaluate $\\displaystyle\\lim_{x \\to 0} \\frac{e^x - 1 - x}{x^2}$. (A fraction like 1/2 is fine.)', '1/2', ['Taylor: $e^x = 1 + x + \\frac{x^2}{2} + \\cdots$, so the ratio $\\to \\frac12$.'], lambda: lim((sp.exp(x) - 1 - x) / x**2, 0))
q(1400, ['calculus'], 'Evaluate $\\displaystyle\\int_0^1 \\frac{1}{1 + x} \\, dx$. (An answer like ln(2) is fine.)', 'ln(2)', ['$\\left[\\ln(1 + x)\\right]_0^1 = \\ln 2$.'], lambda: integ(1 / (1 + x), 0, 1))
q(1500, ['calculus'], 'What is the area between the curves $y = x$ and $y = x^2$? (A fraction like 1/6 is fine.)', '1/6', ['They meet at $x = 0$ and $x = 1$, with $x \\ge x^2$ in between.', '$\\int_0^1 (x - x^2)\\,dx = \\frac12 - \\frac13 = \\frac16$.'], lambda: integ(x - x**2, 0, 1))
q(1200, ['calculus'], 'What is the second derivative of $x^4$ at $x = 1$?', '12', ['$\\frac{d^2}{dx^2} x^4 = 12x^2$, which is $12$ at $x = 1$.'], lambda: float(sp.diff(x**4, x, 2).subs(x, 1)))
q(1650, ['calculus'], 'Evaluate $\\displaystyle\\int_0^2 x e^{x^2} \\, dx$. (An answer like (e^4-1)/2 is fine.)', '(e^4-1)/2', ['Substitute $u = x^2$, $du = 2x\\,dx$: $\\frac12 \\int_0^4 e^u\\,du = \\frac{e^4 - 1}{2}$.'], lambda: integ(x * sp.exp(x**2), 0, 2))
q(1450, ['calculus'], 'Evaluate $\\displaystyle\\lim_{x \\to 0} \\frac{\\sin 3x}{\\sin 5x}$. (A fraction like 3/5 is fine.)', '3/5', ['$\\sin kx \\approx kx$ near 0, so the ratio $\\to \\frac{3x}{5x} = \\frac35$.'], lambda: lim(sp.sin(3 * x) / sp.sin(5 * x), 0))
q(1500, ['series'], 'Evaluate $\\displaystyle\\sum_{n=1}^{\\infty} \\frac{1}{n(n+1)}$.', '1', ['$\\frac{1}{n(n+1)} = \\frac1n - \\frac{1}{n+1}$ telescopes to $1$.'], lambda: float(sp.summation(1 / (n * (n + 1)), (n, 1, sp.oo))))

# ------------------------------------------------------------------ linear algebra
q(1100, ['matrices'], 'What is $\\det \\begin{pmatrix} 2 & 3 \\\\ 1 & 4 \\end{pmatrix}$?', '5', ['$2 \\cdot 4 - 3 \\cdot 1 = 5$.'], lambda: float(sp.Matrix([[2, 3], [1, 4]]).det()))
q(1250, ['matrices'], 'What is $\\det \\begin{pmatrix} 2 & 7 & 1 \\\\ 0 & 3 & 5 \\\\ 0 & 0 & 4 \\end{pmatrix}$?', '24', ['The matrix is upper triangular: the determinant is the product of the diagonal, $2 \\cdot 3 \\cdot 4$.'],
  lambda: float(sp.Matrix([[2, 7, 1], [0, 3, 5], [0, 0, 4]]).det()))
q(1350, ['matrices'], 'A $2 \\times 2$ matrix $A$ has $\\det A = 3$. What is $\\det(A^{-1})$? (A fraction like 1/3 is fine.)', '1/3', ['$\\det(A^{-1}) = \\frac{1}{\\det A}$.'], lambda: float(sp.Matrix([[3, 0], [0, 1]]).inv().det()))
q(1400, ['matrices'], 'A $2 \\times 2$ matrix $A$ has $\\det A = 5$. What is $\\det(2A)$?', '20', ['Scaling an $n \\times n$ matrix by $c$ scales the determinant by $c^n$: $2^2 \\cdot 5$.'], lambda: float((2 * sp.Matrix([[5, 0], [0, 1]])).det()))
q(1350, ['matrices'], 'What is the rank of $\\begin{pmatrix} 1 & 2 \\\\ 2 & 4 \\end{pmatrix}$?', '1', ['The second row is twice the first, so only one row is independent.'], lambda: sp.Matrix([[1, 2], [2, 4]]).rank())
q(1550, ['matrices'], 'What is the largest eigenvalue of $\\begin{pmatrix} 4 & 1 \\\\ 2 & 3 \\end{pmatrix}$?', '5',
  ['Trace $7$ and determinant $10$, so the eigenvalues solve $\\lambda^2 - 7\\lambda + 10 = 0$.', '$\\lambda = 2$ or $5$.'], lambda: float(max(sp.Matrix([[4, 1], [2, 3]]).eigenvals())))
q(1050, ['vectors'], 'What is the dot product of $(1, 2, 3)$ and $(4, -5, 6)$?', '12', ['$4 - 10 + 18 = 12$.'], lambda: 4 - 10 + 18)
q(1000, ['vectors'], 'What is the length of the vector $(1, 2, 2)$?', '3', ['$\\sqrt{1 + 4 + 4} = 3$.'], lambda: sqrt(9))
q(1200, ['vectors'], 'What is the angle between the vectors $(1, 0)$ and $(1, 1)$, in degrees?', '45', ['$\\cos\\theta = \\frac{1}{1 \\cdot \\sqrt2}$, so $\\theta = 45°$.'], lambda: math.degrees(math.acos(1 / sqrt(2))))
q(1350, ['vectors', 'matrices'], 'What is the area of the parallelogram spanned by $(3, 1)$ and $(1, 2)$?', '5', ['Area $= |\\det| = |3 \\cdot 2 - 1 \\cdot 1| = 5$.'], lambda: abs(3 * 2 - 1 * 1))
q(1600, ['matrices'], 'Let $A = \\begin{pmatrix} 0 & 1 \\\\ -1 & 0 \\end{pmatrix}$. What is the trace of $A^{4}$?', '2', ['$A^2 = -I$, so $A^4 = I$.', '$\\operatorname{tr} I = 2$.'], lambda: float((sp.Matrix([[0, 1], [-1, 0]]) ** 4).trace()))
q(1450, ['matrices'], 'Let $A = \\begin{pmatrix} 1 & 1 \\\\ 0 & 1 \\end{pmatrix}$. What is the top-right entry of $A^{10}$?', '10', ['$A^n = \\begin{pmatrix} 1 & n \\\\ 0 & 1 \\end{pmatrix}$ (each multiplication adds 1 to the corner).'],
  lambda: float((sp.Matrix([[1, 1], [0, 1]]) ** 10)[0, 1]))
q(1550, ['matrices'], 'What is $\\det \\begin{pmatrix} 1 & 1 & 1 \\\\ 1 & 2 & 3 \\\\ 1 & 4 & 9 \\end{pmatrix}$?', '2', ['Vandermonde with nodes $1, 2, 3$: $(2-1)(3-1)(3-2) = 2$.'],
  lambda: float(sp.Matrix([[1, 1, 1], [1, 2, 3], [1, 4, 9]]).det()))

# ------------------------------------------------------------------ statistics
q(950, ['statistics'], 'What is the mean of $2, 4, 4, 4, 5, 5, 7, 9$?', '5', ['Sum $40$ over $8$ numbers: $5$.'], lambda: sum([2, 4, 4, 4, 5, 5, 7, 9]) / 8)
q(1350, ['statistics'], 'What is the (population) standard deviation of $2, 4, 4, 4, 5, 5, 7, 9$?', '2', ['Mean $5$; squared deviations $9, 1, 1, 1, 0, 0, 4, 16$ sum to $32$.', 'Variance $32/8 = 4$, so the standard deviation is $2$.'],
  lambda: sqrt(sum((v - 5) ** 2 for v in [2, 4, 4, 4, 5, 5, 7, 9]) / 8))
q(1100, ['statistics'], 'What is the median of $3, 1, 4, 1, 5, 9, 2, 6$? (A fraction like 7/2 is fine.)', '7/2', ['Sorted: $1, 1, 2, 3, 4, 5, 6, 9$. The middle two are $3$ and $4$.', 'Median $= \\frac{7}{2}$.'],
  lambda: (sorted([3, 1, 4, 1, 5, 9, 2, 6])[3] + sorted([3, 1, 4, 1, 5, 9, 2, 6])[4]) / 2)
q(1150, ['statistics'], 'Five numbers have mean $12$. After one is removed, the other four have mean $10$. What number was removed?', '20', ['Total before: $60$. Total after: $40$.', 'Removed: $20$.'], lambda: 5 * 12 - 4 * 10)
q(1650, ['probability', 'statistics'], 'What is the variance of a single roll of a fair six-sided die? (A fraction like 35/12 is fine.)', '35/12', ['$E[X^2] = \\frac{91}{6}$ and $E[X] = \\frac72$.', '$\\frac{91}{6} - \\frac{49}{4} = \\frac{35}{12}$.'],
  lambda: sum(v * v for v in range(1, 7)) / 6 - 3.5**2)
q(1800, ['probability'], 'Two fair four-sided dice (numbered 1–4) are rolled. What is the expected value of the larger number? (A fraction like 25/8 is fine.)', '25/8',
  ['$P(\\max \\le m) = \\frac{m^2}{16}$, so $P(\\max = m) = \\frac{2m - 1}{16}$: $\\frac{1}{16}, \\frac{3}{16}, \\frac{5}{16}, \\frac{7}{16}$.',
   '$E = \\frac{1 + 6 + 15 + 28}{16} = \\frac{50}{16} = \\frac{25}{8}$.'],
  lambda: sum(max(a, b) for a in range(1, 5) for b in range(1, 5)) / 16)

# ------------------------------------------------------------------ sequences & series
q(1000, ['sequences'], 'What is the $20$th term of the arithmetic sequence $3, 7, 11, 15, \\ldots$?', '79', ['$a_n = 3 + 4(n - 1)$, so $a_{20} = 3 + 76 = 79$.'], lambda: 3 + 19 * 4)
q(900, ['sequences'], 'What is $1 + 2 + 3 + \\cdots + 100$?', '5050', ['$\\frac{100 \\cdot 101}{2} = 5050$.'], lambda: sum(range(101)))
q(1250, ['sequences'], 'What is $1 + 3 + 9 + 27 + 81$?', '121', ['Geometric series: $\\frac{3^5 - 1}{3 - 1} = \\frac{242}{2} = 121$ (or just add).'], lambda: sum(3**i for i in range(5)))
q(1450, ['sequences', 'recursion'], 'A sequence has $a_1 = 1$ and $a_{n+1} = 2a_n + 1$. What is $a_{10}$?', '1023', ['$a_n + 1$ doubles each step: $a_n + 1 = 2^n$.', '$a_{10} = 2^{10} - 1 = 1023$.'],
  lambda: (lambda f: f(f, 10))(lambda f, m: 1 if m == 1 else 2 * f(f, m - 1) + 1))
q(1400, ['sequences'], 'What is $1^2 + 2^2 + 3^2 + \\cdots + 10^2$?', '385', ['$\\frac{n(n+1)(2n+1)}{6} = \\frac{10 \\cdot 11 \\cdot 21}{6} = 385$.'], lambda: sum(i * i for i in range(11)))
q(1000, ['sequences'], 'With $F_1 = F_2 = 1$ and $F_{n} = F_{n-1} + F_{n-2}$, what is the Fibonacci number $F_{10}$?', '55', ['$1, 1, 2, 3, 5, 8, 13, 21, 34, 55$.'],
  lambda: (lambda f: f(f, 10))(lambda f, m: 1 if m <= 2 else f(f, m - 1) + f(f, m - 2)))
q(1400, ['sequences'], 'What is the sum of all two-digit multiples of $11$?', '495', ['They are $11, 22, \\ldots, 99$: $11(1 + 2 + \\cdots + 9) = 11 \\cdot 45 = 495$.'], lambda: sum(m for m in range(10, 100) if m % 11 == 0))
q(1150, ['sequences'], 'How many terms are in the sequence $5, 8, 11, \\ldots, 200$?', '66', ['$\\frac{200 - 5}{3} + 1 = 65 + 1 = 66$.'], lambda: len(range(5, 201, 3)))

# ------------------------------------------------------------------ optimization / inequalities
q(1400, ['inequalities'], 'What is the minimum value of $x + \\frac{4}{x}$ for $x > 0$?', '4', ['AM–GM: $x + \\frac4x \\ge 2\\sqrt{x \\cdot \\frac4x} = 4$, with equality at $x = 2$.'],
  lambda: min(t / 1000 + 4 / (t / 1000) for t in range(1, 20000)))
q(1150, ['inequalities'], 'If $x + y = 10$, what is the largest possible value of $xy$?', '25', ['$xy = x(10 - x)$ is largest at $x = 5$: $25$.'], lambda: max(t / 100 * (10 - t / 100) for t in range(0, 1001)))
q(1350, ['inequalities'], 'What is the minimum of $x^2 + y^2$ if $x + y = 4$?', '8', ['By symmetry (or QM–AM) the minimum is at $x = y = 2$: $4 + 4 = 8$.'], lambda: min((t / 100) ** 2 + (4 - t / 100) ** 2 for t in range(-1000, 1000)))
q(1300, ['algebra'], 'What is the minimum value of $(x - 1)^2 + (x - 5)^2$?', '8', ['The minimum is at the average, $x = 3$: $4 + 4 = 8$.'], lambda: min((t / 100 - 1) ** 2 + (t / 100 - 5) ** 2 for t in range(-1000, 1000)))


# ------------------------------------------------------------------ harder: AMC 10/12 and university
q(1700, ['number theory'], 'What is the remainder when $2^{100}$ is divided by $101$?', '1',
  ['$101$ is prime, so by Fermat\'s little theorem $2^{100} \\equiv 1 \\pmod{101}$.'], lambda: pow(2, 100, 101))
q(2050, ['number theory'], 'What is the largest $k$ such that $2^k$ divides $3^{1024} - 1$?', '12',
  ['Factor repeatedly: $3^{1024} - 1 = (3 - 1)(3 + 1)(3^2 + 1)(3^4 + 1)\\cdots(3^{512} + 1)$.',
   '$3 - 1$ gives $2^1$, $3 + 1$ gives $2^2$, and each of the 9 factors $3^{2^j} + 1$ ($j \\ge 1$) is $2 \\pmod 4$: one factor of 2 each.', '$1 + 2 + 9 = 12$.'],
  lambda: (lambda v: (v & -v).bit_length() - 1)(3**1024 - 1))
q(1650, ['number theory'], 'How many ordered pairs of positive integers $(x, y)$ satisfy $3x + 5y = 100$?', '6',
  ['$100 - 5y$ must be a positive multiple of 3, so $y \\equiv 2 \\pmod 3$.', '$y = 2, 5, 8, 11, 14, 17$: six solutions.'],
  lambda: sum(1 for a in range(1, 100) for b in range(1, 100) if 3 * a + 5 * b == 100))
q(1700, ['complex numbers', 'algebra'], 'If $x^2 + x + 1 = 0$, what is $x^{2025}$?', '1',
  ['Multiply by $x - 1$: $x^3 - 1 = 0$, so $x^3 = 1$.', '$2025 = 3 \\cdot 675$, so $x^{2025} = 1$.'],
  lambda: (complex(-0.5, sqrt(3) / 2) ** 2025).real)
q(1600, ['sequences'], 'What is $1 \\cdot 2 + 2 \\cdot 3 + 3 \\cdot 4 + \\cdots + 10 \\cdot 11$?', '440',
  ['$\\sum_{k=1}^{n} k(k+1) = \\frac{n(n+1)(n+2)}{3} = \\frac{10 \\cdot 11 \\cdot 12}{3} = 440$.'], lambda: sum(i * (i + 1) for i in range(1, 11)))
q(1600, ['algebra'], 'What is $\\sqrt{2025 \\cdot 2027 + 1}$?', '2026', ['$(n - 1)(n + 1) + 1 = n^2$ with $n = 2026$.'], lambda: sqrt(2025 * 2027 + 1))
q(1450, ['exponents'], '$2^{2026} - 2^{2025} - 2^{2024} = 2^k$. What is $k$?', '2024', ['Factor out $2^{2024}$: $2^{2024}(4 - 2 - 1) = 2^{2024}$.'],
  lambda: (2**2026 - 2**2025 - 2**2024).bit_length() - 1)
q(1850, ['probability', 'counting'], 'Three different numbers are chosen at random from $1, 2, \\ldots, 10$. What is the probability that no two of them are consecutive?', '7/15',
  ['Choosing 3 non-consecutive numbers from 10 is the same as choosing any 3 from 8 (subtract 0, 1, 2 from the sorted picks): $\\binom83 = 56$.', '$56 / \\binom{10}{3} = 56/120 = 7/15$.'],
  lambda: sum(1 for c in itertools.combinations(range(1, 11), 3) if c[1] - c[0] > 1 and c[2] - c[1] > 1) / comb(10, 3))
q(1800, ['counting', 'geometry'], 'How many right triangles have all three vertices among the vertices of a regular octagon?', '24',
  ['A triangle inscribed in a circle is right exactly when one side is a diameter.', 'The octagon has 4 diameters, each with 6 choices of third vertex: $24$.'],
  lambda: sum(1 for c in itertools.combinations(range(8), 3) if any((c[i] - c[j]) % 8 == 4 for i in range(3) for j in range(3))))
q(1550, ['geometry'], 'The interior angles of a convex polygon add up to $1260°$. How many diagonals does it have?', '27',
  ['$(n - 2) \\cdot 180 = 1260$ gives $n = 9$.', 'Diagonals: $\\frac{9 \\cdot 6}{2} = 27$.'], lambda: (lambda m: m * (m - 3) // 2)(1260 // 180 + 2))
q(1650, ['geometry'], 'An equilateral triangle is inscribed in a circle of radius $2$. What is its area? (An answer like 3sqrt(3) is fine.)', '3sqrt(3)',
  ['The side is $r\\sqrt3 = 2\\sqrt3$.', 'Area $= \\frac{\\sqrt3}{4}(2\\sqrt3)^2 = 3\\sqrt3$.'],
  lambda: abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(
      [(2 * math.cos(2 * pi * j / 3), 2 * math.sin(2 * pi * j / 3)) for j in range(3)],
      [(2 * math.cos(2 * pi * (j + 1) / 3), 2 * math.sin(2 * pi * (j + 1) / 3)) for j in range(3)]))) / 2)
q(1450, ['geometry', 'counting'], 'A $3 \\times 3 \\times 3$ cube is painted on the outside and cut into 27 unit cubes. How many unit cubes have exactly two painted faces?', '12',
  ['Exactly two painted faces means the middle of an edge.', 'A cube has 12 edges, each with one middle cube: $12$.'],
  lambda: sum(1 for a in range(3) for b in range(3) for c in range(3) if sum(v in (0, 2) for v in (a, b, c)) == 2))
q(1900, ['probability'], 'A fair coin is flipped until two heads in a row appear. What is the expected number of flips?', '6',
  ['Let $E$ be the expected count from the start and $E_H$ after one head.', '$E = 1 + \\frac12 E_H + \\frac12 E$ and $E_H = 1 + \\frac12 \\cdot 0 + \\frac12 E$.', 'Solving: $E = 6$.'],
  # P(first HH lands on flip t) = F(t-1) / 2^t (Fibonacci), so E = sum t F(t-1) / 2^t.
  lambda: float(sum(t * sp.fibonacci(t - 1) / sp.Integer(2) ** t for t in range(2, 400))))
q(1650, ['number theory'], 'For how many positive integers $n \\le 100$ is $n^2 + n$ divisible by $6$?', '66',
  ['$n(n+1)$ is always even, so we need it divisible by 3: $n \\equiv 0$ or $2 \\pmod 3$.', 'That excludes the 34 numbers $\\equiv 1 \\pmod 3$: $100 - 34 = 66$.'],
  lambda: sum(1 for m in range(1, 101) if (m * m + m) % 6 == 0))
q(1750, ['counting'], 'How many four-digit numbers have strictly increasing digits (like 1357)?', '126',
  ['Increasing digits can\'t include 0 (it would have to lead), and any 4 of the digits 1–9 can be arranged in increasing order in exactly one way.', '$\\binom94 = 126$.'],
  lambda: sum(1 for m in range(1000, 10000) if all(a < b for a, b in zip(str(m), str(m)[1:]))))
q(1850, ['number theory', 'counting'], 'How many ordered triples of positive integers $(a, b, c)$ satisfy $abc = 72$?', '60',
  ['$72 = 2^3 3^2$. Split the exponent 3 among three numbers: $\\binom{5}{2} = 10$ ways; the exponent 2: $\\binom42 = 6$ ways.', '$10 \\cdot 6 = 60$.'],
  lambda: sum(1 for a in range(1, 73) for b in range(1, 73) if 72 % (a * b) == 0 and 72 % a == 0))
q(1800, ['number theory'], 'What is the smallest positive integer with exactly $12$ positive divisors?', '60',
  ['$12 = 12 = 6 \\cdot 2 = 4 \\cdot 3 = 3 \\cdot 2 \\cdot 2$ gives the candidates $2^{11}$, $2^5 3$, $2^3 3^2$, $2^2 \\cdot 3 \\cdot 5$.', 'Smallest: $2^2 \\cdot 3 \\cdot 5 = 60$.'],
  lambda: next(m for m in range(1, 1000) if len(divisors(m)) == 12))
q(1600, ['number theory'], 'What is the sum of all positive integers $n$ such that $n$ divides $n^2 + 10$?', '18',
  ['$n \\mid n^2$, so $n \\mid n^2 + 10$ exactly when $n \\mid 10$.', '$1 + 2 + 5 + 10 = 18$.'], lambda: sum(m for m in range(1, 1000) if (m * m + 10) % m == 0))
q(1700, ['functions', 'polynomials'], 'Let $f(x) = ax^7 + bx^3 + cx - 5$. If $f(-7) = 7$, what is $f(7)$?', '-17',
  ['$g(x) = ax^7 + bx^3 + cx$ is odd, and $g(-7) = 7 + 5 = 12$.', 'So $g(7) = -12$ and $f(7) = -12 - 5 = -17$.'],
  # Any a, b work: pick a = 1, b = 2 and solve f(-7) = 7 for c, then evaluate f(7).
  lambda: (lambda c: 7**7 + 2 * 7**3 + c * 7 - 5)(float(sp.solve(-(7**7) - 2 * 7**3 - 7 * k - 5 - 7, k)[0])))
q(1950, ['trigonometry'], 'How many real solutions does $\\frac{x}{10} = \\sin x$ have?', '7',
  ['Solutions need $|x| \\le 10 < \\frac{7\\pi}{2}$. For $x > 0$ the line meets $\\sin x$ once in $(0, \\pi)$ and twice in $(2\\pi, 3\\pi)$.',
   'By symmetry there are $3$ more for $x < 0$, plus $x = 0$: $7$.'],
  lambda: sum(1 for a, b in zip([i / 1000 for i in range(-20000, 20000)], [i / 1000 for i in range(-19999, 20001)])
              if (a / 10 - math.sin(a)) == 0 or (a / 10 - math.sin(a)) * (b / 10 - math.sin(b)) < 0))
q(1750, ['algebra', 'radicals'], 'Evaluate $\\displaystyle\\sum_{k=1}^{99} \\frac{1}{\\sqrt{k} + \\sqrt{k+1}}$.', '9',
  ['Rationalize: $\\frac{1}{\\sqrt k + \\sqrt{k+1}} = \\sqrt{k+1} - \\sqrt k$.', 'The sum telescopes to $\\sqrt{100} - \\sqrt1 = 9$.'],
  lambda: sum(1 / (sqrt(i) + sqrt(i + 1)) for i in range(1, 100)))
q(1600, ['logarithms'], 'If $\\log_a b = 2$ and $\\log_b c = 3$, what is $\\log_c a$? (A fraction like 1/6 is fine.)', '1/6',
  ['$c = b^3 = a^6$.', 'So $a = c^{1/6}$ and $\\log_c a = \\frac16$.'], lambda: log(3.0, 3.0**6))
q(1700, ['calculus'], 'Evaluate $\\displaystyle\\int_0^1 x \\ln x \\, dx$. (A fraction like -1/4 is fine.)', '-1/4',
  ['By parts: $\\int x\\ln x\\,dx = \\frac{x^2}{2}\\ln x - \\frac{x^2}{4}$.', 'From 0 to 1: $0 - \\frac14 - 0 = -\\frac14$.'], lambda: integ(x * sp.log(x), 0, 1))
q(1900, ['calculus'], 'Evaluate $\\displaystyle\\int_0^{\\pi/2} \\ln(\\tan x) \\, dx$.', '0',
  ['Substitute $x \\to \\frac\\pi2 - x$: $\\tan$ becomes $\\cot$, so the integral equals its own negative.', 'Hence it is $0$.'],
  lambda: float(sp.Integral(sp.log(sp.tan(x)), (x, 0, sp.pi / 2)).evalf()))
q(1900, ['calculus'], 'Evaluate $\\displaystyle\\int_0^{\\pi/2} \\frac{\\sin x}{\\sin x + \\cos x} \\, dx$. (An answer like pi/4 is fine.)', 'pi/4',
  ['Call it $I$. Substituting $x \\to \\frac\\pi2 - x$ gives the same integral with $\\cos x$ on top.', 'Adding the two: $2I = \\int_0^{\\pi/2} 1\\,dx = \\frac\\pi2$, so $I = \\frac\\pi4$.'],
  lambda: float(sp.Integral(sp.sin(x) / (sp.sin(x) + sp.cos(x)), (x, 0, sp.pi / 2)).evalf()))
q(1750, ['calculus'], 'Evaluate $\\displaystyle\\lim_{n \\to \\infty} n\\left(\\sqrt{n^2 + 1} - n\\right)$. (A fraction like 1/2 is fine.)', '1/2',
  ['Multiply by the conjugate: $n\\left(\\sqrt{n^2+1} - n\\right) = \\frac{n}{\\sqrt{n^2+1} + n}$.', 'This tends to $\\frac{n}{2n} = \\frac12$.'],
  lambda: float(sp.limit(n * (sp.sqrt(n**2 + 1) - n), n, sp.oo)))
q(1950, ['series'], 'Evaluate $\\displaystyle\\sum_{n=0}^{\\infty} \\frac{n^2}{2^n}$.', '6',
  ['$\\sum n^2 r^n = \\frac{r(1 + r)}{(1 - r)^3}$ for $|r| < 1$.', 'With $r = \\frac12$: $\\frac{\\frac12 \\cdot \\frac32}{\\frac18} = 6$.'], lambda: float(sp.summation(n**2 / 2**n, (n, 0, sp.oo))))
q(2000, ['series', 'calculus'], 'What is the radius of convergence of $\\displaystyle\\sum_{n=1}^{\\infty} \\frac{n!}{n^n} x^n$? (An answer like e is fine.)', 'e',
  ['Ratio test: $\\frac{a_{n+1}}{a_n} = \\frac{(n+1)!\\,n^n}{(n+1)^{n+1} n!} = \\left(\\frac{n}{n+1}\\right)^n \\to \\frac1e$.', 'So the radius is $e$.'],
  lambda: float(1 / sp.limit((n / (n + 1)) ** n, n, sp.oo)))
q(1750, ['matrices'], 'What is $\\det \\begin{pmatrix} 2 & 1 & 1 \\\\ 1 & 2 & 1 \\\\ 1 & 1 & 2 \\end{pmatrix}$?', '4',
  ['The matrix is $I + J$ ($J$ = all ones). $J$ has eigenvalues $3, 0, 0$, so $I + J$ has $4, 1, 1$.', 'Determinant: $4 \\cdot 1 \\cdot 1 = 4$.'],
  lambda: float(sp.Matrix([[2, 1, 1], [1, 2, 1], [1, 1, 2]]).det()))
q(1850, ['matrices'], 'A $3 \\times 3$ matrix $A$ has eigenvalues $1$, $2$ and $3$. What is $\\det(A^2 + I)$?', '100',
  ['$A^2 + I$ has eigenvalues $\\lambda^2 + 1$: $2, 5, 10$.', 'Determinant: $2 \\cdot 5 \\cdot 10 = 100$.'],
  lambda: float((lambda P: (P * sp.diag(1, 2, 3) * P.inv()) ** 2 + sp.eye(3))(sp.Matrix([[1, 2, 0], [0, 1, 3], [1, 0, 1]])).det()))
q(1850, ['matrices'], 'A $5 \\times 5$ matrix $P$ satisfies $P^2 = P$ and has rank $3$. What is the trace of $P$?', '3',
  ['$P^2 = P$ means every eigenvalue is $0$ or $1$; the rank counts the eigenvalue-1 directions.', 'Trace $=$ sum of eigenvalues $= 3$.'],
  lambda: float((lambda S: S * sp.diag(1, 1, 1, 0, 0) * S.inv())(sp.Matrix([[1, 1, 0, 0, 0], [0, 1, 1, 0, 0], [0, 0, 1, 1, 0], [0, 0, 0, 1, 1], [1, 0, 0, 0, 1]])).trace()))
q(1800, ['counting', 'number theory'], 'How many integers from $1$ to $1000$ have digits that add up to $10$?', '63',
  ['Count $(a, b, c)$ with digits $0$–$9$ and $a + b + c = 10$: $\\binom{12}{2} = 66$ by stars and bars.', 'Remove the 3 that use a "digit" of 10: $63$. (1000 has digit sum 1.)'],
  lambda: sum(1 for m in range(1, 1001) if sum(map(int, str(m))) == 10))
q(1400, ['geometry'], 'What is the area of a triangle with sides $10$, $10$ and $12$?', '48', ['Isosceles: the altitude to the base 12 splits it into two 6–8–10 right triangles.', 'Area $= \\frac12 \\cdot 12 \\cdot 8 = 48$.'],
  lambda: sqrt(16 * 6 * 6 * 4))
q(1800, ['geometry'], 'A circle is inscribed in a rhombus whose diagonals are $30$ and $40$. What is the radius of the circle?', '12',
  ['The side is $\\sqrt{15^2 + 20^2} = 25$ and the area is $\\frac{30 \\cdot 40}{2} = 600$.', 'Area $= \\text{perimeter} \\cdot \\frac r2$: $600 = 100 \\cdot \\frac r2$, so $r = 12$.'],
  lambda: abs(20 * 15 - 0) / sqrt(20**2 + 15**2))
q(1750, ['geometry'], 'Two circles have radii $5$ and $3$ and centers $10$ apart. How long is a common external tangent segment? (An answer like 4sqrt(6) is fine.)', '4sqrt(6)',
  ['External tangent length $= \\sqrt{d^2 - (r_1 - r_2)^2} = \\sqrt{100 - 4} = \\sqrt{96}$.', '$\\sqrt{96} = 4\\sqrt6$.'], lambda: sqrt(100 - 4))
q(1750, ['geometry'], 'Two circles have radii $5$ and $3$ and centers $10$ apart. How long is a common internal tangent segment (one that crosses between them)?', '6',
  ['Internal tangent length $= \\sqrt{d^2 - (r_1 + r_2)^2} = \\sqrt{100 - 64} = 6$.'], lambda: sqrt(100 - 64))
q(1550, ['geometry'], 'A right triangle has legs $6$ and $8$. How long is the altitude to the hypotenuse? (A fraction like 24/5 is fine.)', '24/5',
  ['The hypotenuse is $10$ and the area is $24$.', 'Altitude $= \\frac{2 \\cdot 24}{10} = \\frac{24}{5}$.'], lambda: abs(6 * 8) / sqrt(6**2 + 8**2))
q(1550, ['geometry'], 'In triangle $ABC$, $AB = 6$, $AC = 9$ and $BC = 10$. The bisector of angle $A$ meets $BC$ at $D$. What is $BD$?', '4',
  ['Angle bisector theorem: $\\frac{BD}{DC} = \\frac{AB}{AC} = \\frac69$.', '$BD = 10 \\cdot \\frac{6}{15} = 4$.'], lambda: 10 * 6 / 15)
q(1750, ['geometry', 'counting'], 'How many non-congruent triangles with integer side lengths have perimeter $12$?', '3',
  ['Sides $a \\le b \\le c$ with $a + b > c$ and $a + b + c = 12$ force $c \\le 5$.', 'Only $(2, 5, 5)$, $(3, 4, 5)$ and $(4, 4, 4)$.'],
  lambda: sum(1 for a in range(1, 12) for b in range(a, 12) for c in range(b, 12) if a + b + c == 12 and a + b > c))
q(1500, ['number theory'], 'How many zeros does $1000!$ end with?', '249', ['Count factors of 5: $200 + 40 + 8 + 1 = 249$.'],
  lambda: len(str(factorial(1000))) - len(str(factorial(1000)).rstrip('0')))
q(2000, ['probability', 'geometry'], 'Two points are chosen independently and uniformly at random on a segment of length $1$, cutting it into three pieces. What is the probability that the three pieces can form a triangle? (A fraction like 1/4 is fine.)', '1/4',
  ['The pieces form a triangle exactly when every piece is shorter than $\\frac12$.', 'In the unit square of choices, that region is two triangles of total area $\\frac14$.'],
  lambda: float(2 * sp.integrate(sp.integrate(1, (y, sp.Rational(1, 2), x + sp.Rational(1, 2))), (x, 0, sp.Rational(1, 2)))))
q(2050, ['number theory'], 'What is the remainder when $1^{2025} + 2^{2025} + 3^{2025} + \\cdots + 2024^{2025}$ is divided by $2025$?', '0',
  ['Pair $k$ with $2025 - k$: the exponent is odd, so $k^{2025} + (2025 - k)^{2025} \\equiv k^{2025} - k^{2025} = 0 \\pmod{2025}$.', 'The 2024 terms pair up completely, so the remainder is $0$.'],
  lambda: sum(pow(i, 2025, 2025) for i in range(1, 2025)) % 2025)
q(1950, ['algebra', 'polynomials'], 'Let $r$, $s$, $t$ be the roots of $x^3 - 6x^2 + 5x - 1 = 0$. What is $\\frac{1}{r} + \\frac{1}{s} + \\frac{1}{t}$?', '5',
  ['$\\frac1r + \\frac1s + \\frac1t = \\frac{rs + st + tr}{rst}$.', 'By Vieta this is $\\frac{5}{1} = 5$.'], lambda: sum(1 / r for r in roots(x**3 - 6 * x**2 + 5 * x - 1)).real)
q(2050, ['algebra', 'polynomials'], 'Let $r$, $s$, $t$ be the roots of $x^3 - 3x + 1 = 0$. What is $r^3 + s^3 + t^3$?', '-3',
  ['Each root satisfies $r^3 = 3r - 1$.', 'So $\\sum r^3 = 3\\sum r - 3 = 3 \\cdot 0 - 3 = -3$.'], lambda: sum(r**3 for r in roots(x**3 - 3 * x + 1)).real)
q(1900, ['counting'], 'How many subsets of $\\{1, 2, 3, \\ldots, 10\\}$ have an even sum? (The empty set counts, with sum 0.)', '512',
  ['Toggling the element $1$ in or out flips the parity of the sum, pairing even-sum subsets with odd-sum ones.', 'So exactly half of the $2^{10}$ subsets have an even sum: $512$.'],
  lambda: sum(1 for m in range(1 << 10) if sum(i + 1 for i in range(10) if m >> i & 1) % 2 == 0))


# ------------------------------------------------------------------ verify and write
from sympy.parsing.sympy_parser import parse_expr, standard_transformations, implicit_multiplication_application, convert_xor

TRANSFORMS = standard_transformations + (implicit_multiplication_application, convert_xor)


def value(answer):
    expr = parse_expr(answer.replace('ln(', 'log('), local_dict={'e': sp.E, 'pi': sp.pi}, transformations=TRANSFORMS)
    return float(sp.N(expr))


ok = True
ids = set()
out = []
for i, item in enumerate(Q, start=1):
    qid = f'ct-{i:03d}'
    want = value(item['answer'])
    got = float(item['check']())
    if abs(want - got) > 1e-6 * max(1, abs(want)):
        ok = False
        print(f'MISMATCH {qid}: answer {item["answer"]} = {want}, check = {got}\n   {item["prompt"]}')
    answer = item['answer']
    # The importer reads a lone letter like "e" as a text answer (flashcards), so spell those out.
    if not re.search(r'[0-9]|pi|sqrt', answer):
        answer = {'kind': 'numeric', 'value': want, 'display': answer}
    out.append({'id': qid, 'difficulty': item['rating'], 'prompt': item['prompt'], 'answer': answer, 'tags': item['tags'], 'steps': item['steps']})

prompts = [o['prompt'] for o in out]
dupes = {p for p in prompts if prompts.count(p) > 1}
if dupes:
    ok = False
    print('DUPLICATE PROMPTS', dupes)

print(f'{len(out)} questions, ratings {min(o["difficulty"] for o in out)}-{max(o["difficulty"] for o in out)}')
buckets = {}
for o in out:
    b = o['difficulty'] // 250 * 250
    buckets[b] = buckets.get(b, 0) + 1
print('by rating band:', dict(sorted(buckets.items())))
if not ok:
    sys.exit(1)
repo_root = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = os.path.join(repo_root, 'src', 'questions', 'data', 'contest.json')
deck = {
    # JSON has no comments, so the warning lives in the data (the deck importer ignores this key).
    '_generated': 'DO NOT EDIT BY HAND. Generated by scripts/generate_contest_deck.py (edit the questions there, '
                  'then run `npm run deck:contest`); manual changes here are overwritten.',
    'name': 'Contest Mix',
    'questions': out,
}
with open(path, 'w', encoding='utf8') as f:
    json.dump(deck, f, ensure_ascii=False, indent=2)
    f.write('\n')
print('wrote', path)
