import katex from 'katex';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function renderPlain(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

const MATH = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;

/** Render question text: $inline$ and $$display$$ LaTeX via KaTeX, **bold**, and line breaks. */
export function renderRich(text: string): string {
  return text
    .split(MATH)
    .map((part) => {
      const display = part.startsWith('$$') && part.endsWith('$$') && part.length > 4;
      const inline = !display && part.length > 2 && part.startsWith('$') && part.endsWith('$');
      if (!display && !inline) return renderPlain(part);
      const tex = display ? part.slice(2, -2) : part.slice(1, -1);
      return katex.renderToString(tex, { displayMode: display, throwOnError: false });
    })
    .join('');
}
