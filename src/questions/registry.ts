import type { ArithmeticConfig, SlotSource } from '../config/gameConfig';
import { weightedPick, type Rng } from '../util/rng';
import hardMathFile from './data/hard-math.json';
import { importJson } from './import/json';
import { createArithmeticSource } from './sources/arithmetic';
import { createDeckSource } from './sources/deck';
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
  private arithmeticConfig: () => ArithmeticConfig;

  constructor(arithmeticConfig: () => ArithmeticConfig) {
    this.arithmeticConfig = arithmeticConfig;
    this.addSource(createArithmeticSource(() => this.arithmeticConfig()), true);
    this.addDeck(loadBuiltInDeck('hard-math', hardMathFile), true);
    this.imported = loadImportedDecks();
    for (const deck of this.imported) this.addDeck(deck, false);
  }

  /** The arithmetic generator reads its settings through this, so it follows the active match config. */
  setArithmeticConfig(getter: () => ArithmeticConfig): void {
    this.arithmeticConfig = getter;
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
  nextFor(slotSources: SlotSource[], rng: Rng): Question | undefined {
    const available = slotSources.filter((s) => this.sources.has(s.sourceId));
    const chosen = weightedPick(rng, available, (s) => s.weight);
    return chosen && this.sources.get(chosen.sourceId)!.next(rng);
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
