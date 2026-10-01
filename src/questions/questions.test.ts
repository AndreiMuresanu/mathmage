import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../config/gameConfig';
import { createRng } from '../util/rng';
import { checkAnswer, parseNumber } from './answerCheck';
import hardMathFile from './data/hard-math.json';
import { importDelimited, parseDelimited } from './import/csv';
import { importJson } from './import/json';
import { generateArithmetic } from './sources/arithmetic';
import { createDeckSource } from './sources/deck';
import type { AnswerSpec } from './types';

describe('checkAnswer', () => {
  const half = { kind: 'numeric', value: 1.5, display: '3/2' } as const;

  it('accepts equivalent numeric forms', () => {
    for (const input of ['1.5', '3/2', '6/4', ' 1.50 ', '3 / 2']) expect(checkAnswer(half, input)).toBe('correct');
  });

  it('rejects wrong numbers and flags unparseable input as invalid', () => {
    expect(checkAnswer(half, '1.4')).toBe('wrong');
    expect(checkAnswer(half, 'abc')).toBe('invalid');
    expect(checkAnswer(half, '')).toBe('invalid');
    expect(checkAnswer(half, '3/')).toBe('invalid');
  });

  it('supports sqrt, pi, unicode symbols and thousands separators', () => {
    expect(checkAnswer({ kind: 'numeric', value: 6 * Math.sqrt(3), display: '' }, '6sqrt(3)')).toBe('correct');
    expect(checkAnswer({ kind: 'numeric', value: 6 * Math.sqrt(3), display: '' }, '6√3')).toBe('correct');
    expect(checkAnswer({ kind: 'numeric', value: Math.PI / 4, display: '' }, 'π/4')).toBe('correct');
    expect(checkAnswer({ kind: 'numeric', value: 34650, display: '' }, '34,650')).toBe('correct');
    expect(checkAnswer({ kind: 'numeric', value: -3, display: '' }, '−3')).toBe('correct');
  });

  it('does not let input call disabled functions', () => {
    expect(checkAnswer(half, 'import({}, {})')).toBe('invalid');
    expect(checkAnswer(half, 'evaluate("1.5")')).toBe('invalid');
  });

  it('normalizes text answers', () => {
    const spec: AnswerSpec = { kind: 'text', accepted: ['Hola', 'buenos días'] };
    expect(checkAnswer(spec, '  hola ')).toBe('correct');
    expect(checkAnswer(spec, 'Buenos   días')).toBe('correct');
    expect(checkAnswer(spec, 'adios')).toBe('wrong');
  });
});

describe('generateArithmetic', () => {
  it('produces integer answers whose steps match, within the configured limits', () => {
    const rng = createRng(1234);
    const cfg = DEFAULT_CONFIG.arithmetic;
    for (let i = 0; i < 500; i++) {
      const q = generateArithmetic(cfg, rng);
      if (q.answer.kind !== 'numeric') throw new Error('expected numeric');
      expect(Number.isInteger(q.answer.value)).toBe(true);
      expect(Math.abs(q.answer.value)).toBeLessThanOrEqual(cfg.maxAbsResult);
      // The last step's result is the answer.
      expect(q.steps!.at(-1)).toMatch(new RegExp(`= ${q.answer.value}\\$$`));
      // The LaTeX prompt evaluates to the answer.
      const plain = q.prompt
        .replaceAll('$$', '')
        .replaceAll('\\times', '*')
        .replaceAll('\\div', '/')
        .replaceAll('\\left(', '(')
        .replaceAll('\\right)', ')');
      expect(parseNumber(plain)).toBeCloseTo(q.answer.value, 9);
    }
  });

  it('respects allowParens = false and a single operator', () => {
    const rng = createRng(7);
    const cfg = { ...DEFAULT_CONFIG.arithmetic, allowParens: false, allowAdd: false, allowSubtract: false, allowDivide: false };
    for (let i = 0; i < 100; i++) {
      const q = generateArithmetic(cfg, rng);
      expect(q.prompt).not.toContain('\\left(');
      expect(q.prompt).not.toMatch(/[+\-]|\\div/);
    }
  });
});

describe('hard-math dataset', () => {
  const result = importJson(JSON.stringify(hardMathFile), 'hard-math');

  it('imports every card without warnings, all numeric with steps', () => {
    expect(result.warnings).toEqual([]);
    expect(result.questions.length).toBe(hardMathFile.questions.length);
    for (const q of result.questions) {
      expect(q.answer.kind, q.id).toBe('numeric');
      expect(q.steps?.length, q.id).toBeGreaterThan(0);
    }
  });

  it('has unique ids', () => {
    const ids = result.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('spot-checks answers', () => {
    const byId = new Map(result.questions.map((q) => [q.id, q]));
    expect(checkAnswer(byId.get('hm-001')!.answer, '4')).toBe('correct');
    expect(checkAnswer(byId.get('hm-030')!.answer, '0.785398163')).toBe('correct');
    expect(checkAnswer(byId.get('hm-013')!.answer, '0.99')).toBe('correct');
  });
});

describe('importDelimited', () => {
  it('parses quoted fields with commas, escaped quotes and newlines', () => {
    expect(parseDelimited('a,"b, c","say ""hi""\nthere"\nd,e,f', ',')).toEqual([
      ['a', 'b, c', 'say "hi"\nthere'],
      ['d', 'e', 'f'],
    ]);
  });

  it('handles Anki plain-text exports with headers, html and a tags column', () => {
    const text = [
      '#separator:tab',
      '#html:true',
      '#tags column:3',
      'el perro\tthe dog | dog\tanimals',
      'dos + tres<br>(número)\t5\tnumbers',
    ].join('\n');
    const { questions, warnings } = importDelimited(text, 'spanish');
    expect(warnings).toEqual([]);
    expect(questions).toHaveLength(2);
    expect(questions[0].answer).toEqual({ kind: 'text', accepted: ['the dog', 'dog'] });
    expect(questions[1].prompt).toBe('dos + tres\n(número)');
    expect(questions[1].answer).toMatchObject({ kind: 'numeric', value: 5 });
  });

  it('auto-detects CSV and skips incomplete rows', () => {
    const { questions, warnings } = importDelimited('2+2,4\nonly front\n"capital of France",Paris,Explained here', 'd');
    expect(questions).toHaveLength(2);
    expect(questions[1].solution).toBe('Explained here');
    expect(warnings).toHaveLength(1);
  });

  it('treats letter answers as text, not math constants', () => {
    const { questions } = importDelimited('e as a letter\te\nnumber\t1/2', 'd');
    expect(questions[0].answer.kind).toBe('text');
    expect(questions[1].answer).toMatchObject({ kind: 'numeric', value: 0.5 });
  });
});

describe('importJson', () => {
  it('accepts arrays, front/back aliases and explicit AnswerSpecs', () => {
    const { questions, warnings } = importJson(
      JSON.stringify([
        { front: 'Q1', back: 'A1' },
        { prompt: 'Q2', answer: 3 },
        { prompt: 'Q3', answer: { kind: 'text', accepted: ['x'] } },
        { prompt: 'no answer' },
      ]),
      'd',
    );
    expect(questions).toHaveLength(3);
    expect(warnings).toHaveLength(1);
    expect(questions[1].answer).toEqual({ kind: 'numeric', value: 3, display: '3' });
  });

  it('reports invalid JSON', () => {
    expect(importJson('{', 'd').warnings[0]).toMatch(/Invalid JSON/);
  });
});

describe('deck source', () => {
  it('cycles through every card before repeating', () => {
    const deck = { id: 'd', name: 'D', questions: [1, 2, 3, 4].map((n) => ({ id: String(n), prompt: String(n), answer: { kind: 'text', accepted: ['x'] } satisfies AnswerSpec })) };
    const source = createDeckSource(deck, '');
    const rng = createRng(3);
    const firstRound = new Set(Array.from({ length: 4 }, () => source.next(rng).id));
    expect(firstRound.size).toBe(4);
  });
});
