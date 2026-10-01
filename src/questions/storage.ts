import type { Deck } from './types';

const DECKS_KEY = 'mathmage.decks';

/** Imported decks live in localStorage. Switch to IndexedDB if decks grow past a few MB. */
export function loadImportedDecks(): Deck[] {
  try {
    const raw = localStorage.getItem(DECKS_KEY);
    const decks = raw ? JSON.parse(raw) : [];
    return Array.isArray(decks) ? decks : [];
  } catch {
    return [];
  }
}

export function saveImportedDecks(decks: Deck[]): void {
  localStorage.setItem(DECKS_KEY, JSON.stringify(decks));
}
