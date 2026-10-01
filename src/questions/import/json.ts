import type { AnswerSpec, Question } from '../types';
import { inferAnswer } from './answers';
import type { ImportResult } from './csv';

/**
 * JSON deck format: either an array of cards or `{ "name": ..., "questions": [...] }`.
 * A card has `prompt` (or `front`), `answer` (or `back`) as a string, number, or full AnswerSpec,
 * and optional `solution`, `steps`, `tags`, `difficulty`, `id`.
 */
export interface JsonDeckFile {
  name?: string;
  questions: unknown[];
}

function isAnswerSpec(value: unknown): value is AnswerSpec {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  switch (v.kind) {
    case 'numeric':
      return typeof v.value === 'number';
    case 'text':
      return Array.isArray(v.accepted) && v.accepted.every((a) => typeof a === 'string');
    case 'choice':
      return Array.isArray(v.options) && typeof v.correct === 'number';
    case 'symbolic':
      return typeof v.expr === 'string';
    default:
      return false;
  }
}

function toAnswer(raw: unknown): AnswerSpec | undefined {
  if (typeof raw === 'number') return { kind: 'numeric', value: raw, display: String(raw) };
  if (typeof raw === 'string' && raw.trim()) return inferAnswer(raw);
  if (isAnswerSpec(raw)) {
    return raw.kind === 'numeric' && !raw.display ? { ...raw, display: String(raw.value) } : raw;
  }
  return undefined;
}

export function normalizeQuestion(raw: unknown, fallbackId: string): Question | string {
  if (!raw || typeof raw !== 'object') return 'not an object';
  const r = raw as Record<string, unknown>;
  const prompt = r.prompt ?? r.front;
  if (typeof prompt !== 'string' || !prompt.trim()) return 'missing "prompt"';
  const answer = toAnswer(r.answer ?? r.back);
  if (!answer) return 'missing or invalid "answer"';
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : undefined);
  return {
    id: typeof r.id === 'string' ? r.id : fallbackId,
    prompt,
    answer,
    solution: typeof r.solution === 'string' ? r.solution : undefined,
    steps: strings(r.steps),
    tags: strings(r.tags),
    difficulty: typeof r.difficulty === 'number' ? r.difficulty : undefined,
  };
}

export function importJson(text: string, deckId: string): ImportResult & { name?: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { questions: [], warnings: [`Invalid JSON: ${(e as Error).message}`] };
  }
  const file: JsonDeckFile = Array.isArray(data)
    ? { questions: data }
    : (data as JsonDeckFile);
  if (!file || !Array.isArray(file.questions)) {
    return { questions: [], warnings: ['Expected an array of cards or an object with a "questions" array.'] };
  }
  const questions: Question[] = [];
  const warnings: string[] = [];
  file.questions.forEach((raw, index) => {
    const result = normalizeQuestion(raw, `${deckId}:${index}`);
    if (typeof result === 'string') warnings.push(`Card ${index + 1}: ${result} — skipped.`);
    else questions.push(result);
  });
  return { questions, warnings, name: typeof file.name === 'string' ? file.name : undefined };
}
