import type { GameConfig, QuestionTypeConfig, SlotSource } from '../config/gameConfig';
import { pickNear } from './near';
import { DEFAULT_DIFFICULTY, spreadCompensation, type SkillRatings } from './rating';
import { weightedPick, type Rng } from '../util/rng';
import contestFile from './data/contest.json';
import hardMathFile from './data/hard-math.json';
import { importJson } from './import/json';
import { createArithmeticSource } from './sources/arithmetic';
import { createDeckSource } from './sources/deck';
import { createMediumSource } from './sources/medium';
import { createAlgebraTricksSource } from './sources/algebra_tricks';
import { loadImportedDecks, saveImportedDecks } from './storage';
import type { Deck, Question, QuestionSource } from './types';

/** How many questions to sample from a source without `nextNear` when looking for a target rating. */
const SAMPLES = 10;

export interface DrawnQuestion {
  typeIndex: number;
  question: Question;
  /** The skill whose rating this answer updates. */
  skill: string;
  /** The rating the question was aimed at (player rating + tier offset). */
  target: number;
}

export interface SourceInfo {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
  skill: string;
  /** Number of cards, for decks. */
  size?: number;
}

function loadBuiltInDeck(id: string, file: unknown): Deck {
  const result = importJson(JSON.stringify(file), id);
  if (result.warnings.length) console.warn(`Built-in deck ${id}:`, result.warnings);
  return { id, name: result.name ?? id, questions: result.questions };
}

/** All question sources (generators, built-in decks, imported decks) by id. */
export class QuestionRegistry {
  private sources = new Map<string, QuestionSource>();
  private info = new Map<string, SourceInfo>();
  private imported: Deck[] = [];
  private config: () => GameConfig;

  constructor(config: () => GameConfig) {
    this.config = config;
    this.addSource(createArithmeticSource(), true);
    this.addSource(createMediumSource(() => this.config().medium), true);
    this.addSource(createAlgebraTricksSource(() => this.config().algebraTricks), true);
    this.addDeck(loadBuiltInDeck('hard-math', hardMathFile), true);
    this.addDeck(loadBuiltInDeck('contest', contestFile), true);
    this.imported = loadImportedDecks();
    for (const deck of this.imported) this.addDeck(deck, false);
  }

  /** Generators read their settings through this, so they follow the active match config. */
  setConfig(getter: () => GameConfig): void {
    this.config = getter;
  }

  list(): SourceInfo[] {
    return [...this.info.values()];
  }

  has(id: string): boolean {
    return this.sources.has(id);
  }

  importedDecks(): readonly Deck[] {
    return this.imported;
  }

  saveImportedDeck(deck: Deck): void {
    this.imported = [...this.imported.filter((d) => d.id !== deck.id), deck];
    saveImportedDecks(this.imported);
    this.addDeck(deck, false);
  }

  deleteImportedDeck(deckId: string): void {
    this.imported = this.imported.filter((d) => d.id !== deckId);
    saveImportedDecks(this.imported);
    this.sources.delete(`deck:${deckId}`);
    this.info.delete(`deck:${deckId}`);
  }

  /** Human-readable name of a skill ("Math", or the deck's name). */
  skillName(skill: string): string {
    if (skill === 'math') return 'Math';
    return this.info.get(skill)?.name ?? skill;
  }

  /** The configured sources that exist and have a weight above 0. */
  usableSources(sources: SlotSource[]): SlotSource[] {
    return sources.filter((s) => s.weight > 0 && this.sources.has(s.sourceId));
  }

  /**
   * Draw a new question:
   * 1. pick a question type (difficulty tier) by its weight;
   * 2. pick a skill among the active sources (weighted by their combined source weight);
   * 3. aim at that skill's rating + the tier's offset (scaled down while still calibrating);
   * 4. take the question nearest that target across the skill's sources.
   */
  drawQuestion(
    types: QuestionTypeConfig[],
    sources: SlotSource[],
    ratings: SkillRatings,
    rng: Rng,
    spread = 100,
  ): DrawnQuestion | undefined {
    const usable = this.usableSources(sources);
    const tiers = types.map((type, typeIndex) => ({ type, typeIndex }));
    const tier = weightedPick(rng, tiers, ({ type }) => type.weight);
    if (!tier || usable.length === 0) return undefined;

    const skillWeights = new Map<string, number>();
    for (const s of usable) {
      const skill = this.sources.get(s.sourceId)!.skill;
      skillWeights.set(skill, (skillWeights.get(skill) ?? 0) + s.weight);
    }
    const skill = weightedPick(rng, [...skillWeights.keys()], (k) => skillWeights.get(k)!)!;
    const offset = tier.type.ratingOffset * spreadCompensation(spread) * ratings.offsetScale(skill);
    const target = ratings.rating(skill) + offset;

    // One candidate per source in this skill, then the best fit (weighted by source weight).
    const candidates = usable
      .filter((s) => this.sources.get(s.sourceId)!.skill === skill)
      .map((s) => ({ question: this.questionNear(this.sources.get(s.sourceId)!, rng, target, spread), weight: s.weight }));
    const chosen = pickNear(rng, candidates, (c) => c.question.difficulty ?? DEFAULT_DIFFICULTY, target, spread, (c) => c.weight)!;
    return { typeIndex: tier.typeIndex, question: chosen.question, skill, target };
  }

  private questionNear(source: QuestionSource, rng: Rng, target: number, spread: number): Question {
    if (source.nextNear) return source.nextNear(rng, target, spread);
    const samples = Array.from({ length: SAMPLES }, () => source.next(rng));
    return pickNear(rng, samples, (q) => q.difficulty ?? DEFAULT_DIFFICULTY, target, spread)!;
  }

  private addSource(source: QuestionSource, builtIn: boolean, size?: number): void {
    this.sources.set(source.id, source);
    this.info.set(source.id, { id: source.id, name: source.name, description: source.description, builtIn, skill: source.skill, size });
  }

  private addDeck(deck: Deck, builtIn: boolean): void {
    const description = builtIn ? `Built-in deck (${deck.questions.length} cards)` : `Imported deck (${deck.questions.length} cards)`;
    // Built-in decks are math; each imported deck is its own skill with its own rating.
    const skill = builtIn ? 'math' : `deck:${deck.id}`;
    this.addSource(createDeckSource(deck, description, skill), builtIn, deck.questions.length);
  }
}
