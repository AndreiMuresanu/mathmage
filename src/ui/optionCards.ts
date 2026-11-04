import { h } from './dom';

export interface OptionCard<T> {
  value: T;
  title: string;
  /** Small text under the title (may include links; their clicks don't select the card). */
  detail?: (string | Node)[];
  disabled?: boolean;
}

/**
 * A row of selectable cards with the chosen one highlighted (game type, mode, public/private...).
 * Used by the solo and host setup screens.
 */
export function optionCards<T>(options: OptionCard<T>[], selected: T, onSelect: (value: T) => void): HTMLDivElement {
  const cards = options.map((o) => {
    const card = h('button.option-card', { type: 'button', disabled: !!o.disabled }, h('strong', {}, o.title), o.detail ? h('span.muted', {}, ...o.detail) : null);
    card.classList.toggle('selected', o.value === selected && !o.disabled);
    card.addEventListener('click', () => {
      if (o.disabled) return;
      for (const c of cards) c.classList.toggle('selected', c === card);
      onSelect(o.value);
    });
    return card;
  });
  return h('div.setup-choices', {}, ...cards);
}

/** An inline link inside a card that runs `action` without selecting the card. */
export function cardLink(text: string, action: () => void): HTMLAnchorElement {
  return h(
    'a',
    {
      href: '#',
      onclick: (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        action();
      },
    },
    text,
  );
}
