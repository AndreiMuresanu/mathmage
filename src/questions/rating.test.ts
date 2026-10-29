import { describe, expect, it } from 'vitest';
import { cloneConfig, DEFAULT_CONFIG } from '../config/gameConfig';
import { createRng } from '../util/rng';
import { TRICK_RATINGS, TRICK_TEMPLATES } from './sources/algebra_tricks';
import { generateMedium } from './sources/medium';
import { answerScore, kFactor, offsetForChance, SkillRatings, successChance, type AnswerResult } from './rating';
import { QuestionRegistry } from './registry';

const adaptive = DEFAULT_CONFIG.adaptive;

describe('rating maths', () => {
  it('predicts 50% at equal ratings and ~91% when 400 points better', () => {
    expect(successChance(1000, 1000)).toBe(0.5);
    expect(successChance(1400, 1000)).toBeCloseTo(0.909, 3);
    expect(offsetForChance(0.5)).toBeCloseTo(0);
    expect(successChance(0, offsetForChance(0.85))).toBeCloseTo(0.85);
  });

  it('scores answers by correctness, nudged by speed', () => {
    const cfg = { ...adaptive, timeWeight: 1, skipScore: 0.35 };
    expect(answerScore('correct', 0, 30, cfg)).toBe(1.25); // instant
    expect(answerScore('correct', 15, 30, cfg)).toBe(1); // half the limit = classic Elo
    expect(answerScore('correct', 30, 30, cfg)).toBe(0.75); // at the limit
    expect(answerScore('wrong', 0, 30, cfg)).toBe(-0.25); // snap guess
    expect(answerScore('wrong', 15, 30, cfg)).toBe(0);
    expect(answerScore('wrong', 30, 30, cfg)).toBe(0.25); // long honest attempt
    expect(answerScore('skipped', 5, 30, cfg)).toBe(0.35);
    expect(answerScore('timeout', 30, 30, cfg)).toBe(0.35);
    // Speed weight 0 = classic right/wrong.
    expect(answerScore('correct', 30, 30, { ...cfg, timeWeight: 0 })).toBe(1);
    expect(Math.abs(answerScore('wrong', 0, 30, { ...cfg, timeWeight: 0 }))).toBe(0);
    // No time limit: speed is judged against the reference time.
    expect(answerScore('correct', cfg.referenceTime, 0, cfg)).toBe(0.75);
  });

  it('takes big steps while uncertain and settles as answers accumulate', () => {
    expect(kFactor(0, adaptive)).toBe(adaptive.kMax);
    expect(kFactor(adaptive.kDecayAnswers, adaptive)).toBeCloseTo((adaptive.kMax + adaptive.kMin) / 2);
    expect(kFactor(10000, adaptive)).toBeLessThan(adaptive.kMin + 2);
  });

  it('a correct answer raises the rating, a wrong one lowers it, and ratings stay in range', () => {
    const r = new SkillRatings({ ...adaptive, startRating: 500 });
    expect(r.record('math', 500, 'correct', 3, 30).after).toBeGreaterThan(500);
    const before = r.rating('math');
    expect(r.record('math', 500, 'wrong', 3, 30).after).toBeLessThan(before);
    const low = new SkillRatings({ ...adaptive, startRating: 10 });
    for (let i = 0; i < 20; i++) low.record('math', 10, 'wrong', 1, 30);
    expect(low.rating('math')).toBe(0);
    expect(low.get('math')).toMatchObject({ answers: 20, misses: 20 });
    const high = new SkillRatings({ ...adaptive, startRating: 2990 });
    for (let i = 0; i < 20; i++) high.record('math', 2990, 'correct', 1, 30);
    expect(high.rating('math')).toBe(3000);
  });

  it('keeps each skill separate', () => {
    const r = new SkillRatings({ ...adaptive, startRating: 400 });
    r.record('math', 400, 'correct', 1, 30);
    expect(r.rating('math')).toBeGreaterThan(400);
    expect(r.rating('deck:spanish')).toBe(400);
  });
});

describe('question difficulty ratings', () => {
  it('rates every algebra trick template', () => {
    for (const family of Object.keys(TRICK_TEMPLATES) as (keyof typeof TRICK_TEMPLATES)[]) {
      expect(TRICK_RATINGS[family], family).toHaveLength(TRICK_TEMPLATES[family].length);
    }
  });

  it('rates every medium question', () => {
    const rng = createRng(4);
    for (let i = 0; i < 300; i++) {
      const q = generateMedium(DEFAULT_CONFIG.medium, rng);
      expect(q.difficulty, q.id).toBeGreaterThanOrEqual(600);
      expect(q.difficulty, q.id).toBeLessThanOrEqual(1300);
    }
  });
});

describe('simulated players', () => {
  const cfg = cloneConfig(DEFAULT_CONFIG);
  const registry = new QuestionRegistry(() => cfg);

  /** Play `answers` questions as a player whose true rating is `skill`. */
  function play(skill: number, answers: number, seed: number) {
    const rng = createRng(seed);
    const ratings = new SkillRatings(cfg.adaptive);
    const history: { correct: boolean; rating: number }[] = [];
    for (let i = 0; i < answers; i++) {
      const drawn = registry.drawQuestion(cfg.questionTypes, cfg.questionSources, ratings, rng, cfg.adaptive.spread)!;
      const limit = cfg.questionTypes[drawn.typeIndex].timeLimit;
      const correct = rng.next() < successChance(skill, drawn.question.difficulty!);
      // Correct answers take 15–60% of the limit; wrong ones 30–100%.
      const elapsed = limit * (correct ? 0.15 + 0.45 * rng.next() : 0.3 + 0.7 * rng.next());
      const result: AnswerResult = correct ? 'correct' : 'wrong';
      ratings.record(drawn.skill, drawn.question.difficulty!, result, elapsed, limit);
      history.push({ correct, rating: ratings.rating('math') });
    }
    return history;
  }

  for (const skill of [700, 1100, 1500, 1800]) {
    it(`a player of true skill ${skill} is found from a low start and then succeeds ~85% of the time`, () => {
      const finals: number[] = [];
      const rates: number[] = [];
      let reachedTotal = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const history = play(skill, 250, seed);
        finals.push(history.at(-1)!.rating);
        const reached = history.findIndex((h) => h.rating >= skill - 250);
        reachedTotal += reached < 0 ? Infinity : reached + 1;
        const later = history.slice(60);
        rates.push(later.filter((h) => h.correct).length / later.length);
      }
      const meanFinal = finals.reduce((a, b) => a + b, 0) / finals.length;
      const meanRate = rates.reduce((a, b) => a + b, 0) / rates.length;
      expect(Math.abs(meanFinal - skill), `final rating ${meanFinal.toFixed(0)}`).toBeLessThan(250);
      // On average; an unlucky streak occasionally takes longer.
      expect(reachedTotal / 6, 'average answers to get within 250 of the true skill').toBeLessThanOrEqual(20);
      expect(meanRate, `success rate ${meanRate.toFixed(3)}`).toBeGreaterThan(0.78);
      expect(meanRate).toBeLessThan(0.95);
    });
  }
});
