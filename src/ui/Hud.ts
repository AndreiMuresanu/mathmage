import type { GameConfig } from '../config/gameConfig';
import type { World } from '../sim/world';
import { h, keyLabel } from './dom';

function bar(kind: string) {
  const fill = h('div.bar-fill');
  const text = h('div.bar-text');
  return { el: h(`div.bar.bar-${kind}` as 'div', {}, fill, text), fill, text };
}

/** HP/mana bars, round status, spell bar and question-slot hints. Only touches the DOM when values change. */
export class Hud {
  readonly el: HTMLDivElement;
  private hp = bar('hp');
  private mana = bar('mana');
  private round = h('div.hud-round');
  private spells: HTMLDivElement[];
  private slots: HTMLDivElement[];
  private cache = new Map<string, string>();

  constructor(cfg: GameConfig) {
    this.spells = cfg.spells.map((s, i) =>
      h(
        'div.spell',
        {},
        h('span.key', {}, String(i + 1)),
        h('span.spell-name', { style: `color:${s.color}` }, s.name),
        h('span.spell-cost', {}, `${s.manaCost}`),
        h('div.spell-cd'),
      ),
    );
    this.slots = cfg.questionSlots.map((slot) =>
      h('div.slot-hint', {}, h('span.key', {}, keyLabel(slot.key)), ` ${slot.label} `, h('span.reward', {}, `+${slot.manaReward}`)),
    );
    this.el = h(
      'div.hud',
      {},
      h('div.hud-bars', {}, this.hp.el, this.mana.el),
      this.round,
      h('div.hud-spells', {}, ...this.spells),
      h('div.hud-slots', {}, ...this.slots),
    );
  }

  private set(key: string, value: string, apply: () => void): void {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    apply();
  }

  update(world: World, playerId: string): void {
    const p = world.player(playerId);
    if (!p) return;
    const hpPct = (100 * p.hp) / p.maxHp;
    this.set('hp', hpPct.toFixed(1), () => {
      this.hp.fill.style.width = `${hpPct}%`;
      this.hp.text.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    });
    const manaPct = (100 * p.mana) / p.maxMana;
    this.set('mana', manaPct.toFixed(1), () => {
      this.mana.fill.style.width = `${manaPct}%`;
      this.mana.text.textContent = `${Math.floor(p.mana)} / ${p.maxMana} mana`;
    });

    const w = world.wave;
    const roundText =
      w.phase === 'break'
        ? w.round === 0
          ? `First wave in ${Math.ceil(w.timer)}`
          : `Round ${w.round} cleared! Next in ${Math.ceil(w.timer)}`
        : `Round ${w.round} · ${world.enemies.length + w.queue.length} enemies`;
    this.set('round', roundText, () => (this.round.textContent = roundText));

    world.cfg.spells.forEach((spell, i) => {
      const cd = spell.cooldown > 0 ? Math.min(1, p.cooldowns[i] / spell.cooldown) : 0;
      const state = `${i === p.selectedSpell}|${p.mana >= spell.manaCost}|${cd.toFixed(2)}`;
      this.set(`spell${i}`, state, () => {
        const el = this.spells[i];
        el.classList.toggle('selected', i === p.selectedSpell);
        el.classList.toggle('unaffordable', p.mana < spell.manaCost);
        (el.querySelector('.spell-cd') as HTMLElement).style.width = `${cd * 100}%`;
      });
    });

    const locked = !world.canAnswer(playerId);
    this.set('slotsLocked', String(locked), () => this.slots.forEach((s) => s.classList.toggle('locked', locked)));
  }

  /** Brief "+N" pop next to the mana bar. */
  showManaGain(amount: number): void {
    const pop = h('div.mana-pop', {}, `+${amount}`);
    this.mana.el.append(pop);
    setTimeout(() => pop.remove(), 900);
  }

  showNoMana(): void {
    this.mana.el.classList.remove('shake');
    void this.mana.el.offsetWidth; // restart the animation
    this.mana.el.classList.add('shake');
  }
}
