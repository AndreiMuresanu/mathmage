import type { Question } from '../types';
import { inferAnswer } from './answers';

export interface ImportResult {
  questions: Question[];
  /** Human-readable problems with individual rows (the rest still import). */
  warnings: string[];
}

/** Parse delimited text with RFC 4180 quoting ("" escapes, newlines inside quotes). */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const SEPARATOR_NAMES: Record<string, string> = {
  tab: '\t',
  comma: ',',
  semicolon: ';',
  pipe: '|',
  space: ' ',
  colon: ':',
};

function detectDelimiter(sampleLine: string): string {
  const counts = ['\t', ',', ';'].map((d) => [d, sampleLine.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : '\t';
}

export function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

/**
 * Import CSV/TSV flashcards: columns are front, back, and an optional solution/extra.
 * Understands Anki's "Notes in Plain Text" header lines (#separator, #html, #tags column, ...).
 */
export function importDelimited(text: string, deckId: string): ImportResult {
  const lines = text.split(/\r?\n/);
  let delimiter: string | undefined;
  let html = false;
  const skipColumns = new Set<number>();
  let bodyStart = 0;
  for (; bodyStart < lines.length; bodyStart++) {
    const line = lines[bodyStart];
    if (!line.startsWith('#')) break;
    const match = /^#([a-z ]+):(.*)$/i.exec(line);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (key === 'separator') delimiter = SEPARATOR_NAMES[value.toLowerCase()] ?? value;
    else if (key === 'html') html = value.toLowerCase() === 'true';
    else if (key.endsWith(' column')) skipColumns.add(Number.parseInt(value, 10) - 1);
  }
  const body = lines.slice(bodyStart).join('\n');
  delimiter ??= detectDelimiter(lines[bodyStart] ?? '');

  const questions: Question[] = [];
  const warnings: string[] = [];
  const clean = (s: string) => (html || /<[a-z][^>]*>/i.test(s) ? stripHtml(s) : s.trim());
  parseDelimited(body, delimiter).forEach((rawRow, index) => {
    const row = rawRow.filter((_, col) => !skipColumns.has(col)).map(clean);
    if (row.every((f) => f === '')) return;
    const [front, back, extra] = row;
    if (!front || !back) {
      warnings.push(`Row ${index + 1}: needs a front and a back — skipped.`);
      return;
    }
    questions.push({
      id: `${deckId}:${index}`,
      prompt: front,
      answer: inferAnswer(back),
      solution: extra || undefined,
    });
  });
  return { questions, warnings };
}
