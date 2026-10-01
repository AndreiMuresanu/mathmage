import { CONFIG_GROUPS, SLOT_KEYS, getPath, type FieldDef, type GroupDef } from '../config/configSchema';
import { DEFAULT_CONFIG, cloneConfig, type GameConfig } from '../config/gameConfig';
import { deletePreset, listPresets, parseConfigJson, saveCurrentConfig, savePreset } from '../config/presets';
import type { QuestionRegistry } from '../questions/registry';
import { downloadText, h, keyLabel } from './dom';

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
  const openGroups = new Set<string>(['Player', 'Spells', 'Question slots']);

  const changed = () => {
    saveCurrentConfig(draft);
    renderStatus();
  };

  function renderStatus(): void {
    const problems: string[] = [];
    if (draft.spells.length === 0) problems.push('Add at least one spell.');
    draft.questionSlots.forEach((slot) => {
      if (!slot.sources.some((s) => s.weight > 0 && opts.registry.has(s.sourceId))) {
        problems.push(`Slot ${keyLabel(slot.key)} (${slot.label}) has no question sources.`);
      }
    });
    if (draft.player.startMana > draft.player.maxMana) problems.push('Starting mana is above max mana (it will be capped).');
    status.replaceChildren(...problems.map((p) => h('div.warning', {}, p)));
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

  function sourcesEditor(slotIndex: number): HTMLElement {
    const slot = draft.questionSlots[slotIndex];
    const known = opts.registry.list();
    const rows = known.map((info) => {
      const entry = slot.sources.find((s) => s.sourceId === info.id);
      const check = h('input', { type: 'checkbox', checked: !!entry });
      const weight = h('input.weight', { type: 'number', min: '0', step: '0.5', value: String(entry?.weight ?? 1), disabled: !entry });
      const update = () => {
        slot.sources = slot.sources.filter((s) => s.sourceId !== info.id);
        if (check.checked) slot.sources.push({ sourceId: info.id, weight: Math.max(0, Number.parseFloat(weight.value) || 0) });
        weight.disabled = !check.checked;
        changed();
      };
      check.addEventListener('change', update);
      weight.addEventListener('change', update);
      return h(
        'div.source-row',
        {},
        h('label', { title: info.description }, check, ` ${info.name}`, info.size !== undefined ? h('span.muted', {}, ` (${info.size})`) : null),
        h('span.muted', {}, 'weight'),
        weight,
      );
    });
    const missing = slot.sources
      .filter((s) => !opts.registry.has(s.sourceId))
      .map((s) => h('div.warning', {}, `Missing source "${s.sourceId}" (deleted deck?) — it will be skipped.`));
    return h('div.sources', {}, h('div.field-label', {}, 'Question sources'), ...rows, ...missing);
  }

  function renderGroup(group: GroupDef): HTMLElement {
    const details = h('details.config-group', { open: openGroups.has(group.title) }, h('summary', {}, group.title));
    details.addEventListener('toggle', () => {
      if (details.open) openGroups.add(group.title);
      else openGroups.delete(group.title);
    });
    if (group.kind === 'object') {
      const target = getPath(draft, group.path);
      details.append(h('div.field-grid', {}, ...group.fields.map((f) => fieldInput(target, f))));
      return details;
    }

    const list = draft[group.path] as unknown as Record<string, any>[];
    list.forEach((item, index) => {
      const title =
        group.path === 'spells'
          ? `${group.itemTitle} ${index + 1} (key ${index + 1})`
          : `${group.itemTitle} ${index + 1} (key ${keyLabel(SLOT_KEYS[index])})`;
      const remove = h('button.small.danger', { textContent: 'Remove' });
      remove.addEventListener('click', () => {
        list.splice(index, 1);
        reassignSlotKeys();
        changed();
        render();
      });
      details.append(
        h(
          'div.list-item',
          {},
          h('div.list-item-header', {}, h('strong', {}, title), remove),
          h('div.field-grid', {}, ...group.fields.map((f) => fieldInput(item, f))),
          group.path === 'questionSlots' ? sourcesEditor(index) : null,
        ),
      );
    });
    if (list.length < group.maxItems) {
      const add = h('button.small', { textContent: `+ Add ${group.itemTitle.toLowerCase()}` });
      add.addEventListener('click', () => {
        const template = list.at(-1) ?? (DEFAULT_CONFIG[group.path][0] as unknown as Record<string, any>);
        list.push(structuredClone(template));
        reassignSlotKeys();
        changed();
        render();
      });
      details.append(add);
    }
    return details;
  }

  function reassignSlotKeys(): void {
    draft.questionSlots.forEach((slot, i) => (slot.key = SLOT_KEYS[i]));
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
        reassignSlotKeys();
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
