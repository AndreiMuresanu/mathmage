type Child = Node | string | null | undefined | false;

/** Tiny element builder: h('div.panel.translucent', { onclick }, child, ...). */
export function h<K extends keyof HTMLElementTagNameMap>(
  selector: K | `${K}.${string}`,
  props: Partial<Omit<HTMLElementTagNameMap[K], 'style'>> & { style?: string; dataset?: Record<string, string> } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const [tag, ...classes] = selector.split('.') as [K, ...string[]];
  const el = document.createElement(tag);
  if (classes.length) el.classList.add(...classes);
  const { style, dataset, ...rest } = props;
  Object.assign(el, rest);
  if (style) el.setAttribute('style', style);
  if (dataset) Object.assign(el.dataset, dataset);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

/** "KeyZ" → "Z", "Digit1" → "1". */
export function keyLabel(code: string): string {
  return code.replace(/^Key/, '').replace(/^Digit/, '');
}

export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
