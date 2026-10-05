import { describe, expect, it } from 'vitest';
import { cloneConfig, DEFAULT_CONFIG, type QuestionTypeConfig } from '../config/gameConfig';
import { createRng } from '../util/rng';
import { QuestionRegistry } from './registry';

const cfg = cloneConfig(DEFAULT_CONFIG);
const registry = new QuestionRegistry(() => cfg);

function counts(types: QuestionTypeConfig[], draws = 20000): number[] {
  const rng = createRng(11);
  const out = types.map(() => 0);
  for (let i = 0; i < draws; i++) out[registry.drawQuestion(types, rng)!.typeIndex]++;
  return out.map((c) => c / draws);
}

describe('drawQuestion', () => {
  it('picks question types according to their weights (default skews easy)', () => {
    const types = DEFAULT_CONFIG.questionTypes;
    const total = types.reduce((sum, t) => sum + t.weight, 0);
    const observed = counts(types);
    types.forEach((t, i) => expect(observed[i], t.label).toBeCloseTo(t.weight / total, 1));
    const [easy, medium, hard] = observed;
    expect(easy).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(hard);
  });

  it('never picks weight-0 types or types without usable sources', () => {
    const types = cloneConfig(DEFAULT_CONFIG).questionTypes;
    types[0].weight = 0;
    types[1].sources = [{ sourceId: 'deck:deleted', weight: 1 }];
    expect(counts(types, 2000)).toEqual([0, 0, 1]);
  });

  it('returns undefined when nothing can be picked', () => {
    const types = cloneConfig(DEFAULT_CONFIG).questionTypes.map((t) => ({ ...t, weight: 0 }));
    expect(registry.drawQuestion(types, createRng(1))).toBeUndefined();
  });

  it('draws questions from the chosen type', () => {
    const rng = createRng(3);
    for (let i = 0; i < 200; i++) {
      const { typeIndex, question } = registry.drawQuestion(DEFAULT_CONFIG.questionTypes, rng)!;
      const prefix = ['arith:', 'med:', 'hm-'][typeIndex];
      expect(question.id.startsWith(prefix), `${typeIndex} ${question.id}`).toBe(true);
    }
  });
});
