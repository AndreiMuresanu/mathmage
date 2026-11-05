import { NAME_MAX_LENGTH } from '../online/leaderboardTypes';
import { createCharacterPicker } from './CharacterPicker';
import { h } from './dom';

/** Play multiplayer: your name, then join an open game or host one. */
export function createMultiplayerScreen(opts: {
  name: string;
  onNameChange(name: string): void;
  character: string;
  onSelectCharacter(id: string): void;
  onJoin(): void;
  onHost(): void;
  onBack(): void;
  /** Shown at the top, e.g. "The host left the game." */
  message?: string;
}): HTMLDivElement {
  const nameInput = h('input.name-input', { type: 'text', maxLength: NAME_MAX_LENGTH, placeholder: 'Your name', value: opts.name });
  nameInput.addEventListener('input', () => opts.onNameChange(nameInput.value.trim()));
  nameInput.addEventListener('keydown', (e) => e.stopPropagation());
  const needName = (go: () => void) => () => {
    if (!nameInput.value.trim()) {
      nameInput.focus();
      nameInput.classList.add('invalid');
      return;
    }
    go();
  };
  return h(
    'div.screen',
    {},
    h(
      'div.panel.screen-panel.menu',
      {},
      h('div.screen-header', {}, h('h1', {}, 'Multiplayer'), h('button', { onclick: opts.onBack }, 'Back')),
      opts.message ? h('p.notice', {}, opts.message) : null,
      h('label.field-label', {}, 'Your name', nameInput),
      h('div.field-label', {}, 'Your character', createCharacterPicker(opts.character, opts.onSelectCharacter)),
      h(
        'div.menu-buttons',
        {},
        h('button.primary.big', { onclick: needName(opts.onJoin) }, 'Join game'),
        h('button.big', { onclick: needName(opts.onHost) }, 'Host game'),
      ),
    ),
  );
}
