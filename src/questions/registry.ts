import type { GameConfig, QuestionTypeConfig, SlotSource } from '../config/gameConfig';
import { weightedPick, type Rng } from '../util/rng';
import hardMathFile from './data/hard-math.json';
import { importJson } from './import/json';
import { createArithmeticSource } from './sources/arithmetic';
import { createDeckSource } from './sources/deck';
import { createMediumSource } from './sources/medium';
import { loadImportedDecks, saveImportedDecks } from './storage';
import type { Deck, Question, QuestionSource } from './types';

export interface SourceInfo {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
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
    this.addSource(createArithmeticSource(() => this.config().arithmetic), true);
    this.addSource(createMediumSource(() => this.config().medium), true);
    this.addDeck(loadBuiltInDeck('hard-math', hardMathFile), true);
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

  /** Draw a question for a slot from its weighted sources (missing sources are ignored). */
  nextFor(sources: SlotSource[], rng: Rng): Question | undefined {
    const available = sources.filter((s) => this.sources.has(s.sourceId));
    const chosen = weightedPick(rng, available, (s) => s.weight);
    return chosen && this.sources.get(chosen.sourceId)!.next(rng);
  }

  /** True if the type can produce a question (some source with weight > 0 exists). */
  isUsable(type: QuestionTypeConfig): boolean {
    return type.sources.some((s) => s.weight > 0 && this.sources.has(s.sourceId));
  }

  /**
   * Draw a new question: pick a question type by its weight (skipping unusable types),
   * then draw from that type's sources.
   */
  drawQuestion(types: QuestionTypeConfig[], rng: Rng): { typeIndex: number; question: Question } | undefined {
    const candidates = types.map((type, typeIndex) => ({ type, typeIndex })).filter(({ type }) => this.isUsable(type));
    const chosen = weightedPick(rng, candidates, ({ type }) => type.weight);
    if (!chosen) return undefined;
    const question = this.nextFor(chosen.type.sources, rng);
    return question && { typeIndex: chosen.typeIndex, question };
  }

  private addSource(source: QuestionSource, builtIn: boolean, size?: number): void {
    this.sources.set(source.id, source);
    this.info.set(source.id, { id: source.id, name: source.name, description: source.description, builtIn, size });
  }

  private addDeck(deck: Deck, builtIn: boolean): void {
    const description = builtIn ? `Built-in deck (${deck.questions.length} cards)` : `Imported deck (${deck.questions.length} cards)`;
    this.addSource(createDeckSource(deck, description), builtIn, deck.questions.length);
  }
}
