import katex from 'katex';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const MATH = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;

/**
 * KaTeX's fonts use `font-display: block` and are only fetched the first time an equation needs
 * them, which leaves math invisible for a moment. Start fetching them all up front instead.
 */
export function preloadMathFonts(): void {
  document.fonts.forEach((face) => {
    if (face.family.replace(/["']/g, '').startsWith('KaTeX_')) face.load().catch(() => {});
  });
}

/** Render question text: $inline$ and $$display$$ LaTeX via KaTeX, **bold**, and line breaks. */
export function renderRich(text: string): string {
  const parts = text.split(MATH);
  const isMath = (part: string) => part.length > 2 && part.startsWith('$') && part.endsWith('$');
  // **bold** may contain inline math, so markers are paired across the whole text (only if balanced).
  const markers = parts.filter((p) => !isMath(p)).reduce((n, p) => n + p.split('**').length - 1, 0);
  let bold = false;
  return parts
    .map((part) => {
      const display = part.startsWith('$$') && part.endsWith('$$') && part.length > 4;
      if (!isMath(part)) {
        const html = escapeHtml(part).replace(/\n/g, '<br>');
        if (markers % 2 !== 0) return html;
        return html.split('**').map((chunk, i) => (i === 0 ? '' : (bold = !bold) ? '<strong>' : '</strong>') + chunk).join('');
      }
      const tex = display ? part.slice(2, -2) : part.slice(1, -1);
      return katex.renderToString(tex, { displayMode: display, throwOnError: false });
    })
    .join('');
}
