import type { AdaptiveConfig } from '../config/gameConfig';

/**
 * Elo-style adaptive difficulty. Players and questions share one rating scale:
 *   ~100        1 + 1
 *   ~500        times tables, short mixed arithmetic
 *   ~900        percentages, fractions, linear equations
 *   ~1200       quadratics, simple competition warm-ups
 *   ~1500–1800  algebra tricks, calculus, matrices
 *   ~1900–2100  AMC-level problems
 * A player rated R answers a question rated Q correctly with probability
 * 1 / (1 + 10^((Q − R) / 400)), so equal ratings mean a 50% chance.
 */

/** Ratings never leave this range. */
export const MIN_RATING = 0;
export const MAX_RATING = 3000;
/** Difficulty assumed for a question with no `difficulty` (e.g. imported flashcards). */
export const DEFAULT_DIFFICULTY = 1000;

/** Chance a player rated `player` answers a question rated `question` correctly. */
export function successChance(player: number, question: number): number {
  return 1 / (1 + 10 ** ((question - player) / 400));
}

/** The rating offset at which a player succeeds with probability `p` (inverse of successChance). */
export function offsetForChance(p: number): number {
  return -400 * Math.log10(p / (1 - p));
}

export type AnswerResult = 'correct' | 'wrong' | 'skipped' | 'timeout';

/** How far through the time limit an answer came, from 0 (instant) to 1 (at the limit). */
export function slownessOf(elapsed: number, limit: number, cfg: AdaptiveConfig): number {
  return Math.min(1, Math.max(0, elapsed / (limit > 0 ? limit : cfg.referenceTime)));
}

/**
 * Score an answer, weighting speed ("high speed, high stakes", as in Math Garden). The classic
 * Elo result (correct = 1, wrong = 0) is nudged by speed compared with the player's usual pace
 * (`typical`, the same 0–1 scale as slowness): a faster-than-usual correct answer scores above 1
 * and a slower one below; a faster-than-usual wrong answer (a snap guess) scores below 0 and a
 * slower, honest attempt above. Comparing with the player's own pace keeps the nudge zero on
 * average, so speed never inflates or deflates the rating. Skips and timeouts get a fixed score.
 * `elapsed` / `limit` are in seconds.
 */
export function answerScore(
  result: AnswerResult,
  elapsed: number,
  limit: number,
  cfg: AdaptiveConfig,
  typical = 0.5,
): number {
  if (result === 'skipped' || result === 'timeout') return cfg.skipScore;
  const speed = 0.5 * cfg.timeWeight * (typical - slownessOf(elapsed, limit, cfg)); // ±0.5·w at most
  return result === 'correct' ? 1 + speed : 0 - speed + 0; // + 0 turns −0 into 0
}

/** How quickly the "usual pace" averages follow recent answers. */
const PACE_SMOOTHING = 0.15;

/**
 * Bell-curve-weighted question picking (`spread` ≈ 1 standard deviation) lands on average a bit
 * closer to 50% than its target. This factor stretches a tier's offset so the *average* success
 * chance still matches the chance the offset stands for (probit approximation of the logistic).
 */
export function spreadCompensation(spread: number): number {
  const slope = Math.LN10 / 400;
  return Math.sqrt(1 + (Math.PI * slope * slope * spread * spread) / 8);
}

/** Update step size: large while the rating is uncertain (few answers), settling as answers accumulate. */
export function kFactor(answers: number, cfg: AdaptiveConfig): number {
  return cfg.kMin + (cfg.kMax - cfg.kMin) / (1 + answers / Math.max(1, cfg.kDecayAnswers));
}

export interface SkillRating {
  rating: number;
  answers: number;
  /** Wrong answers, skips and timeouts. */
  misses: number;
  /** Answers since the first miss: the rating only starts settling once the player has missed. */
  settledAnswers: number;
  /** The player's usual pace (0–1 of the time limit) on correct and on wrong answers. */
  paceCorrect: number;
  paceWrong: number;
  start: number;
  peak: number;
}

export interface RatingChange {
  skill: string;
  before: number;
  after: number;
  /** Predicted chance of a correct answer before answering. */
  expected: number;
  score: number;
}

/**
 * The player's ratings for one match, one per skill ("math", or each imported deck). They start
 * at the configured starting rating every match and recalibrate from there.
 */
export class SkillRatings {
  private skills = new Map<string, SkillRating>();
  private cfg: AdaptiveConfig;

  constructor(cfg: AdaptiveConfig) {
    this.cfg = cfg;
  }

  get(skill: string): SkillRating {
    let s = this.skills.get(skill);
    if (!s) {
      const start = clampRating(this.cfg.startRating);
      s = { rating: start, answers: 0, misses: 0, settledAnswers: 0, paceCorrect: 0.5, paceWrong: 0.5, start, peak: start };
      this.skills.set(skill, s);
    }
    return s;
  }

  rating(skill: string): number {
    return this.get(skill).rating;
  }

  /**
   * How much of a question tier's offset to apply. Until the player has missed a few questions
   * the rating is still climbing toward their level, so questions are pitched right at it (the
   * most informative level, like a staircase); the Easy/Hard offsets fade in with each miss.
   */
  offsetScale(skill: string): number {
    const calibration = Math.max(0, this.cfg.calibrationMisses);
    return calibration === 0 ? 1 : Math.min(1, this.get(skill).misses / calibration);
  }

  /** Apply one answer to a question rated `difficulty`. */
  record(skill: string, difficulty: number, result: AnswerResult, elapsed: number, limit: number): RatingChange {
    const s = this.get(skill);
    const before = s.rating;
    const expected = successChance(before, difficulty);
    const correct = result === 'correct';
    const score = answerScore(result, elapsed, limit, this.cfg, correct ? s.paceCorrect : s.paceWrong);
    if (result === 'correct' || result === 'wrong') {
      const slowness = slownessOf(elapsed, limit, this.cfg);
      if (correct) s.paceCorrect += PACE_SMOOTHING * (slowness - s.paceCorrect);
      else s.paceWrong += PACE_SMOOTHING * (slowness - s.paceWrong);
    }
    s.rating = clampRating(before + kFactor(s.settledAnswers, this.cfg) * (score - expected));
    s.answers++;
    if (result !== 'correct') s.misses++;
    if (s.misses > 0) s.settledAnswers++;
    s.peak = Math.max(s.peak, s.rating);
    return { skill, before, after: s.rating, expected, score };
  }

  all(): [string, SkillRating][] {
    return [...this.skills.entries()];
  }
}

function clampRating(r: number): number {
  return Math.max(MIN_RATING, Math.min(MAX_RATING, r));
}
