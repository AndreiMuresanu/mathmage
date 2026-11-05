import { CHARACTERS, characterCss, getCharacter } from '../game/characters';
import { h } from './dom';

/**
 * Character selector: a preview of the current character with "<" and ">" to cycle through them.
 * The preview is a coloured mage for now; it becomes the character's sprite later.
 */
export function createCharacterPicker(selected: string, onChange: (id: string) => void): HTMLDivElement {
  let index = Math.max(0, CHARACTERS.findIndex((c) => c.id === getCharacter(selected).id));
  const preview = h('div.character-preview');
  const name = h('div.character-name');
  const dots = CHARACTERS.map(() => h('span.character-dot'));
  const render = () => {
    const c = CHARACTERS[index];
    preview.style.setProperty('--character-color', characterCss(c));
    preview.title = c.name;
    name.textContent = c.name;
    dots.forEach((d, i) => d.classList.toggle('selected', i === index));
  };
  const step = (delta: number) => {
    index = (index + delta + CHARACTERS.length) % CHARACTERS.length;
    render();
    onChange(CHARACTERS[index].id);
  };
  render();
  return h(
    'div.character-picker',
    {},
    h('button.character-arrow', { type: 'button', title: 'Previous character', onclick: () => step(-1) }, '<'),
    h('div.character-stage', {}, preview, name, h('div.character-dots', {}, ...dots)),
    h('button.character-arrow', { type: 'button', title: 'Next character', onclick: () => step(1) }, '>'),
  );
}
