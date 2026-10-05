import { importDelimited } from '../questions/import/csv';
import { importJson } from '../questions/import/json';
import type { QuestionRegistry } from '../questions/registry';
import type { Deck } from '../questions/types';
import { downloadText, h } from './dom';

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deck';
}

/** List built-in and imported decks, and import new ones from CSV/TSV (incl. Anki) or JSON. */
export function createDeckManager(opts: { registry: QuestionRegistry; onBack(): void }): HTMLDivElement {
  const list = h('div.deck-list');
  const result = h('div.import-result');
  const nameInput = h('input', { type: 'text', placeholder: 'Deck name (e.g. Spanish verbs)' });
  const textArea = h('textarea', {
    rows: 8,
    placeholder: 'Paste cards here — one per line: front<TAB>back<TAB>optional solution\n(or comma-separated, or a JSON deck)',
  });
  const file = h('input', { type: 'file', accept: '.csv,.tsv,.txt,.json' });

  function renderList(): void {
    const rows = opts.registry.list().map((info) => {
      const imported = opts.registry.importedDecks().find((d) => `deck:${d.id}` === info.id);
      const actions: HTMLElement[] = [];
      if (imported) {
        const exportBtn = h('button.small', { textContent: 'Export' });
        exportBtn.addEventListener('click', () =>
          downloadText(`${imported.id}.json`, JSON.stringify({ name: imported.name, questions: imported.questions }, null, 2)),
        );
        const del = h('button.small.danger', { textContent: 'Delete' });
        del.addEventListener('click', () => {
          if (!confirm(`Delete deck "${imported.name}"?`)) return;
          opts.registry.deleteImportedDeck(imported.id);
          renderList();
        });
        actions.push(exportBtn, del);
      }
      return h(
        'div.deck-row',
        {},
        h('div', {}, h('strong', {}, info.name), h('div.muted', {}, info.description)),
        h('div.button-row', {}, info.builtIn ? h('span.badge', {}, 'built-in') : null, ...actions),
      );
    });
    list.replaceChildren(...rows);
  }

  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    textArea.value = await f.text();
    if (!nameInput.value.trim()) nameInput.value = f.name.replace(/\.[^.]+$/, '');
  });

  const importBtn = h('button.primary', { textContent: 'Import deck' });
  importBtn.addEventListener('click', () => {
    const text = textArea.value;
    if (!text.trim()) {
      result.replaceChildren(h('div.warning', {}, 'Paste some cards or choose a file first.'));
      return;
    }
    const looksJson = /^\s*[[{]/.test(text);
    const provisionalName = nameInput.value.trim();
    const id = `${slug(provisionalName || 'deck')}-${Date.now().toString(36)}`;
    const parsed = looksJson ? importJson(text, id) : importDelimited(text, id);
    const name = provisionalName || (parsed as { name?: string }).name || 'Imported deck';
    const warnings = parsed.warnings.slice(0, 20).map((w) => h('div.warning', {}, w));
    if (parsed.warnings.length > 20) warnings.push(h('div.warning', {}, `…and ${parsed.warnings.length - 20} more.`));
    if (parsed.questions.length === 0) {
      result.replaceChildren(h('div.error', {}, 'No cards could be imported.'), ...warnings);
      return;
    }
    const deck: Deck = { id, name, questions: parsed.questions };
    opts.registry.saveImportedDeck(deck);
    const numeric = parsed.questions.filter((q) => q.answer.kind === 'numeric').length;
    result.replaceChildren(
      h('div.success', {}, `Imported "${name}": ${parsed.questions.length} cards (${numeric} numeric, ${parsed.questions.length - numeric} text). Add it to a question type in Configure match.`),
      ...warnings,
    );
    textArea.value = '';
    nameInput.value = '';
    file.value = '';
    renderList();
  });

  renderList();
  const back = h('button', { textContent: 'Back' });
  back.addEventListener('click', opts.onBack);

  return h(
    'div.screen',
    {},
    h(
      'div.panel.screen-panel.wide',
      {},
      h('div.screen-header', {}, h('h1', {}, 'Question decks'), back),
      list,
      h('h2', {}, 'Import a deck'),
      h(
        'div.muted.import-help',
        { innerHTML: `
          <p><strong>CSV / TSV:</strong> one card per line: <code>front, back, optional solution</code>.
          Anki: <em>File → Export → Notes in Plain Text</em> works directly.</p>
          <p>Answers that are numbers (<code>42</code>, <code>3/4</code>, <code>2sqrt(3)</code>) are checked numerically;
          anything else is compared as text (case-insensitive). Separate accepted alternatives with <code>|</code> or <code>;</code>.</p>
          <p><strong>JSON:</strong> <code>{"name": "...", "questions": [{"prompt": "...", "answer": "...", "steps": ["..."]}]}</code>.
          Prompts can use LaTeX in <code>$...$</code>.</p>` },
      ),
      h('div.import-form', {}, nameInput, file, textArea, importBtn),
      result,
    ),
  );
}
