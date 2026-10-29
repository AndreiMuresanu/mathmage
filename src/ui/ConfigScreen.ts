import { CONFIG_GROUPS, getPath, type FieldDef, type GroupDef } from '../config/configSchema';
import { DEFAULT_CONFIG, cloneConfig, type GameConfig } from '../config/gameConfig';
import { deletePreset, listPresets, parseConfigJson, saveCurrentConfig, savePreset } from '../config/presets';
import { successChance } from '../questions/rating';
import type { QuestionRegistry } from '../questions/registry';
import { downloadText, h } from './dom';

export interface ConfigScreenOptions {
  config: GameConfig;
  registry: QuestionRegistry;
  onStart(config: GameConfig): void;
  onBack(config: GameConfig): void;
}

/** Match setup: every tunable from configSchema, plus presets and JSON import/export. */
export function createConfigScreen(opts: ConfigScreenOptions): HTMLDivElement {
  let draft = cloneConfig(opts.config);
  const body = h('div.config-body');
  const presetBar = h('div.preset-bar');
  const status = h('div.config-status');
  const openGroups = new Set<string>(['Player', 'Spells', 'Question types', 'Adaptive difficulty']);

  const changed = () => {
    saveCurrentConfig(draft);
    renderStatus();
  };

  /** Overall chance of a correct answer once the rating has settled (from the tier weights and offsets). */
  function expectedSuccess(): number | undefined {
    const tiers = draft.questionTypes.filter((t) => t.weight > 0);
    const total = tiers.reduce((sum, t) => sum + t.weight, 0);
    if (!total) return undefined;
    return tiers.reduce((sum, t) => sum + (t.weight / total) * successChance(0, t.ratingOffset), 0);
  }

  function renderStatus(): void {
    const problems: string[] = [];
    if (draft.spells.length === 0) problems.push('Add at least one spell.');
    if (!draft.questionTypes.some((t) => t.weight > 0)) problems.push('Give at least one question type a weight above 0.');
    if (opts.registry.usableSources(draft.questionSources).length === 0) {
      problems.push('No question sources are enabled: pick some under Question sources.');
    }
    if (draft.player.startMana > draft.player.maxMana) problems.push('Starting mana is above max mana (it will be capped).');
    const success = expectedSuccess();
    status.replaceChildren(
      ...problems.map((p) => h('div.warning', {}, p)),
      success === undefined ? '' : h('div.muted', {}, `Expected success rate once your rating settles: ~${Math.round(success * 100)}% of questions answered correctly.`),
    );
  }

  function fieldInput(target: Record<string, any>, field: FieldDef, onChange = changed): HTMLElement {
    const value = target[field.key];
    let input: HTMLInputElement;
    if (field.type === 'boolean') {
      input = h('input', { type: 'checkbox', checked: Boolean(value) });
      input.addEventListener('change', () => {
        target[field.key] = input.checked;
        onChange();
      });
    } else if (field.type === 'select') {
      const select = h('select', {}, ...(field.options ?? []).map(([v, label]) => h('option', { value: v, textContent: label })));
      select.value = String(value);
      select.addEventListener('change', () => {
        target[field.key] = select.value;
        onChange();
      });
      return h(
        'label.field',
        { title: field.help ?? '' },
        h('span.field-label', {}, field.label, field.help ? h('span.help', {}, ' ⓘ') : null),
        select,
      );
    } else if (field.type === 'number') {
      input = h('input', { type: 'number', value: String(value) });
      if (field.min !== undefined) input.min = String(field.min);
      if (field.max !== undefined) input.max = String(field.max);
      if (field.step !== undefined) input.step = String(field.step);
      input.addEventListener('change', () => {
        let n = Number.parseFloat(input.value);
        if (!Number.isFinite(n)) {
          input.value = String(target[field.key]);
          return;
        }
        if (field.min !== undefined) n = Math.max(field.min, n);
        if (field.max !== undefined) n = Math.min(field.max, n);
        target[field.key] = n;
        input.value = String(n);
        onChange();
      });
    } else {
      input = h('input', { type: field.type === 'color' ? 'color' : 'text', value: String(value) });
      input.addEventListener('change', () => {
        target[field.key] = input.value;
        onChange();
      });
    }
    return h(
      'label.field',
      { title: field.help ?? '' },
      h('span.field-label', {}, field.label, field.help ? h('span.help', {}, ' ⓘ') : null),
      input,
    );
  }

  /** The global question sources: which content is in play, and its weight among similar-difficulty questions. */
  function sourcesEditor(): HTMLElement {
    const known = opts.registry.list();
    const rows = known.map((info) => {
      const entry = draft.questionSources.find((s) => s.sourceId === info.id);
      const check = h('input', { type: 'checkbox', checked: !!entry });
      const weight = h('input.weight', { type: 'number', min: '0', step: '0.5', value: String(entry?.weight ?? 1), disabled: !entry });
      const update = () => {
        draft.questionSources = draft.questionSources.filter((s) => s.sourceId !== info.id);
        if (check.checked) draft.questionSources.push({ sourceId: info.id, weight: Math.max(0, Number.parseFloat(weight.value) || 0) });
        weight.disabled = !check.checked;
        changed();
      };
      check.addEventListener('change', update);
      weight.addEventListener('change', update);
      const skill = info.skill === 'math' ? '' : ' · own rating';
      return h(
        'div.source-row',
        {},
        h(
          'label',
          { title: info.description },
          check,
          ` ${info.name}`,
          h('span.muted', {}, `${info.size !== undefined ? ` (${info.size})` : ''}${skill}`),
        ),
        h('span.muted', {}, 'weight'),
        weight,
      );
    });
    const missing = draft.questionSources
      .filter((s) => !opts.registry.has(s.sourceId))
      .map((s) => h('div.warning', {}, `Missing source "${s.sourceId}" (deleted deck?) — it will be skipped.`));
    return h(
      'div.sources',
      {},
      h(
        'div.muted',
        {},
        'Each question is picked from these sources by difficulty (your rating + the question type’s offset). ' +
          'Built-in math content shares one Math rating; each imported deck has its own rating.',
      ),
      ...rows,
      ...missing,
    );
  }

  function renderGroup(group: GroupDef): HTMLElement {
    const details = h('details.config-group', { open: openGroups.has(group.title) }, h('summary', {}, group.title));
    details.addEventListener('toggle', () => {
      if (details.open) openGroups.add(group.title);
      else openGroups.delete(group.title);
    });
    if (group.kind === 'sources') {
      details.append(sourcesEditor());
      return details;
    }
    if (group.kind === 'object') {
      const target = getPath(draft, group.path);
      details.append(h('div.field-grid', {}, ...group.fields.map((f) => fieldInput(target, f))));
      return details;
    }

    const list = draft[group.path] as unknown as Record<string, any>[];
    const totalWeight = draft.questionTypes.reduce((sum, t) => sum + Math.max(0, t.weight), 0) || 1;
    list.forEach((item, index) => {
      const title =
        group.path === 'spells'
          ? `${group.itemTitle} ${index + 1} (key ${index + 1})`
          : `${item.label} · ${Math.round((100 * Math.max(0, item.weight)) / totalWeight)}% of questions · ~${Math.round(100 * successChance(0, item.ratingOffset))}% success`;
      // Weight changes update every type's percentage, so re-render the list.
      const onFieldChange = group.path === 'questionTypes' ? () => { changed(); render(); } : changed;
      const remove = h('button.small.danger', { textContent: 'Remove' });
      remove.addEventListener('click', () => {
        list.splice(index, 1);
        changed();
        render();
      });
      details.append(
        h(
          'div.list-item',
          {},
          h('div.list-item-header', {}, h('strong', {}, title), remove),
          h('div.field-grid', {}, ...group.fields.map((f) => fieldInput(item, f, onFieldChange))),
        ),
      );
    });
    if (list.length < group.maxItems) {
      const add = h('button.small', { textContent: `+ Add ${group.itemTitle.toLowerCase()}` });
      add.addEventListener('click', () => {
        const template = list.at(-1) ?? (DEFAULT_CONFIG[group.path][0] as unknown as Record<string, any>);
        list.push(structuredClone(template));
        changed();
        render();
      });
      details.append(add);
    }
    return details;
  }

  function renderPresetBar(): void {
    const presets = listPresets();
    const select = h('select', {}, h('option', { value: '', textContent: '— presets —' }));
    for (const name of Object.keys(presets)) select.append(h('option', { value: name, textContent: name }));
    const load = h('button.small', { textContent: 'Load' });
    load.addEventListener('click', () => {
      if (!select.value) return;
      draft = cloneConfig(presets[select.value]);
      changed();
      render();
    });
    const del = h('button.small.danger', { textContent: 'Delete' });
    del.addEventListener('click', () => {
      if (!select.value || !confirm(`Delete preset "${select.value}"?`)) return;
      deletePreset(select.value);
      renderPresetBar();
    });
    const nameInput = h('input', { type: 'text', placeholder: 'Preset name' });
    const save = h('button.small', { textContent: 'Save preset' });
    save.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      savePreset(name, draft);
      renderPresetBar();
    });
    const reset = h('button.small', { textContent: 'Reset to defaults' });
    reset.addEventListener('click', () => {
      if (!confirm('Reset every setting to its default?')) return;
      draft = cloneConfig(DEFAULT_CONFIG);
      changed();
      render();
    });
    const exportBtn = h('button.small', { textContent: 'Export JSON' });
    exportBtn.addEventListener('click', () => downloadText('mathmage-config.json', JSON.stringify(draft, null, 2)));
    const file = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        draft = parseConfigJson(await f.text());
        changed();
        render();
      } catch (e) {
        alert(`Couldn't read that config: ${(e as Error).message}`);
      }
      file.value = '';
    });
    const importBtn = h('button.small', { textContent: 'Import JSON' });
    importBtn.addEventListener('click', () => file.click());
    presetBar.replaceChildren(select, load, del, h('span.spacer'), nameInput, save, h('span.spacer'), reset, exportBtn, importBtn, file);
  }

  function render(): void {
    body.replaceChildren(...CONFIG_GROUPS.map(renderGroup));
    renderStatus();
  }

  renderPresetBar();
  render();

  const back = h('button', { textContent: 'Back' });
  back.addEventListener('click', () => opts.onBack(draft));
  const start = h('button.primary', { textContent: 'Start match' });
  start.addEventListener('click', () => {
    if (draft.spells.length === 0) {
      renderStatus();
      return;
    }
    opts.onStart(draft);
  });

  return h(
    'div.screen',
    {},
    h(
      'div.panel.screen-panel.wide',
      {},
      h('div.screen-header', {}, h('h1', {}, 'Configure match'), h('div.button-row', {}, back, start)),
      presetBar,
      status,
      body,
    ),
  );
}
