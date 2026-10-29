import { describe, expect, it } from 'vitest';
import { renderRich } from './markup';

describe('renderRich', () => {
  it('renders **bold** that contains inline math', () => {
    const html = renderRich("**Don't divide by $x$**: factor instead");
    expect(html).not.toContain('**');
    expect(html.indexOf('<strong>')).toBeLessThan(html.indexOf('katex'));
    expect(html.indexOf('</strong>')).toBeGreaterThan(html.lastIndexOf('katex'));
  });

  it('keeps plain bold and leaves an unpaired ** as text', () => {
    expect(renderRich('**Trick:** then $x = 2$')).toMatch(/^<strong>Trick:<\/strong> then /);
    expect(renderRich('2 ** 3 is $8$')).toContain('**');
  });
});
