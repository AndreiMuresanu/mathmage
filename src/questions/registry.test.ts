import { beforeAll, describe, expect, it } from 'vitest';
import { cloneConfig, DEFAULT_CONFIG, type AdaptiveConfig, type QuestionTypeConfig } from '../config/gameConfig';
import { createRng } from '../util/rng';
import { SkillRatings, spreadCompensation } from './rating';
import { QuestionRegistry } from './registry';
import { MENTAL_MATH_TAG } from './types';

// Imported decks are saved to localStorage; give node an in-memory one.
beforeAll(() => {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
});

const cfg = cloneConfig(DEFAULT_CONFIG);
const registry = new QuestionRegistry(() => cfg);

/** Ratings fixed at `rating`, with tier offsets fully applied (no calibration phase). */
function ratingsAt(rating: number): SkillRatings {
  const adaptive: AdaptiveConfig = { ...DEFAULT_CONFIG.adaptive, startRating: rating, calibrationMisses: 0 };
  return new SkillRatings(adaptive);
}

const tier = (ratingOffset: number, weight = 1): QuestionTypeConfig => ({ ...DEFAULT_CONFIG.questionTypes[0], ratingOffset, weight });

describe('drawQuestion', () => {
  it('picks question types according to their weights', () => {
    const types = DEFAULT_CONFIG.questionTypes;
    const total = types.reduce((sum, t) => sum + t.weight, 0);
    const rng = createRng(11);
    const ratings = ratingsAt(1000);
    const counts = types.map(() => 0);
    const draws = 5000;
    for (let i = 0; i < draws; i++) counts[registry.drawQuestion(types, cfg.questionSources, ratings, rng)!.typeIndex]++;
    types.forEach((t, i) => expect(counts[i] / draws, t.label).toBeCloseTo(t.weight / total, 1));
  });

  it('serves questions rated near the target, across the whole scale', () => {
    const rng = createRng(5);
    for (const target of [100, 400, 700, 1000, 1300, 1600, 1900]) {
      const ratings = ratingsAt(target);
      const diffs: number[] = [];
      for (let i = 0; i < 150; i++) {
        const drawn = registry.drawQuestion([tier(0)], cfg.questionSources, ratings, rng)!;
        expect(drawn.target).toBe(target);
        diffs.push(drawn.question.difficulty! - target);
      }
      const meanAbs = diffs.reduce((s, d) => s + Math.abs(d), 0) / diffs.length;
      expect(meanAbs, `target ${target}`).toBeLessThan(140);
    }
  });

  it('applies the tier offset (Easy below, Hard above the player)', () => {
    const rng = createRng(9);
    const ratings = ratingsAt(1400);
    const mean = (offset: number) => {
      let sum = 0;
      for (let i = 0; i < 200; i++) sum += registry.drawQuestion([tier(offset)], cfg.questionSources, ratings, rng)!.question.difficulty!;
      return sum / 200;
    };
    const easy = mean(-400);
    const medium = mean(0);
    const hard = mean(150);
    expect(easy).toBeLessThan(medium - 250);
    expect(hard).toBeGreaterThan(medium + 60);
  });

  it('pitches questions right at the rating until the player has missed a few', () => {
    const ratings = new SkillRatings({ ...DEFAULT_CONFIG.adaptive, startRating: 800, calibrationMisses: 2 });
    expect(registry.drawQuestion([tier(-400)], cfg.questionSources, ratings, createRng(1))!.target).toBe(800);
    ratings.record('math', 800, 'wrong', 15, 30);
    const r = ratings.rating('math');
    const stretch = spreadCompensation(100);
    expect(registry.drawQuestion([tier(-400)], cfg.questionSources, ratings, createRng(1))!.target).toBeCloseTo(r - 200 * stretch);
    ratings.record('math', 800, 'wrong', 15, 30);
    const r2 = ratings.rating('math');
    expect(registry.drawQuestion([tier(-400)], cfg.questionSources, ratings, createRng(1))!.target).toBeCloseTo(r2 - 400 * stretch);
  });

  it('gives each imported deck its own skill', () => {
    registry.saveImportedDeck({
      id: 'spanish',
      name: 'Spanish',
      questions: [{ id: 's1', prompt: 'perro', answer: { kind: 'text', accepted: ['dog'] } }],
    });
    const drawn = registry.drawQuestion([tier(0)], [{ sourceId: 'deck:spanish', weight: 1 }], ratingsAt(300), createRng(2))!;
    expect(drawn.skill).toBe('deck:spanish');
    expect(registry.skillName(drawn.skill)).toBe('Spanish');
    expect(drawn.question.difficulty).toBe(1000); // unrated cards use the default
    const math = registry.drawQuestion([tier(0)], [{ sourceId: 'deck:hard-math', weight: 1 }], ratingsAt(300), createRng(2))!;
    expect(math.skill).toBe('math');
    registry.deleteImportedDeck('spanish');
  });

  it('returns undefined when nothing can be picked', () => {
    const ratings = ratingsAt(500);
    expect(registry.drawQuestion([tier(0, 0)], cfg.questionSources, ratings, createRng(1))).toBeUndefined();
    expect(registry.drawQuestion([tier(0)], [{ sourceId: 'deck:deleted', weight: 1 }], ratings, createRng(1))).toBeUndefined();
    expect(registry.drawQuestion([tier(0)], [], ratings, createRng(1))).toBeUndefined();
  });
});

describe('mental-math weighting', () => {
  /** Share of drawn questions tagged mental-math for targets across the low end of the scale. */
  const mentalShare = (weight: number, targets: number[]) => {
    const rng = createRng(21);
    let mental = 0;
    let total = 0;
    for (const target of targets) {
      for (let i = 0; i < 300; i++) {
        const q = registry.drawQuestion([tier(0)], cfg.questionSources, ratingsAt(target), rng, 100, weight)!.question;
        if (q.tags?.includes(MENTAL_MATH_TAG)) mental++;
        total++;
      }
    }
    return mental / total;
  };

  it('mostly serves idea questions instead of pure computation from 400 up', () => {
    const targets = [400, 500, 600, 700, 800, 900, 1000];
    const neutral = mentalShare(1, targets);
    const weighted = mentalShare(DEFAULT_CONFIG.adaptive.mentalMathWeight, targets);
    expect(weighted).toBeLessThan(0.15);
    expect(weighted).toBeLessThan(neutral / 2);
  });

  it('still has something to ask at the very bottom of the scale', () => {
    expect(mentalShare(DEFAULT_CONFIG.adaptive.mentalMathWeight, [100])).toBeGreaterThan(0.5);
  });
});
