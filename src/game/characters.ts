/**
 * Playable characters. Purely cosmetic for now (a colour each); later each gets its own sprite.
 * The id travels with the player (PlayerState.character) so everyone draws everyone correctly.
 */
export interface Character {
  id: string;
  name: string;
  /** Tint for the mage (0xRRGGBB). */
  color: number;
}

export const CHARACTERS: Character[] = [
  { id: 'violet', name: 'Violet', color: 0xb48cff },
  { id: 'azure', name: 'Azure', color: 0x6ec8ff },
  { id: 'gold', name: 'Gold', color: 0xf2c14e },
  { id: 'silver', name: 'Silver', color: 0xdfe6f0 },
];

export const DEFAULT_CHARACTER = CHARACTERS[0].id;

/** The character with this id (the default one if unknown, e.g. from a newer game version). */
export function getCharacter(id: string | undefined): Character {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

/** CSS colour for a character (for menus). */
export function characterCss(c: Character): string {
  return `#${c.color.toString(16).padStart(6, '0')}`;
}

const KEY = 'mathmage.character';

export function savedCharacter(): string {
  try {
    return getCharacter(localStorage.getItem(KEY) ?? undefined).id;
  } catch {
    return DEFAULT_CHARACTER;
  }
}

export function saveCharacter(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // storage unavailable: just don't remember it
  }
}
