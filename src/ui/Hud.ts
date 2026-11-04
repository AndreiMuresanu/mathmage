import type { GameConfig } from '../config/gameConfig';
import type { World } from '../sim/world';
import type { PlayerState } from '../sim/types';
import { h } from './dom';

function bar(kind: string) {
  const fill = h('div.bar-fill');
  const text = h('div.bar-text');
  return { el: h(`div.bar.bar-${kind}` as 'div', {}, fill, text), fill, text };
}

/** HP/mana bars, round status, spell bar and question odds. Only touches the DOM when values change. */
export class Hud {
  readonly el: HTMLDivElement;
  private hp = bar('hp');
  private mana = bar('mana');
  private round = h('div.hud-round');
  private spells: HTMLDivElement[];
  private questionHint: HTMLDivElement;
  /** The player's current skill rating and its last change. */
  private ratingLine = h('div.slot-rating');
  /** Time left on an unanswered question while its window is closed. */
  private questionTimer = h('span.question-timer');
  /** Co-op: "You're down" while downed, "Hold F to revive" next to a downed teammate, with progress. */
  private coopText = h('span');
  private coopFill = h('div.hud-coop-fill');
  private coop = h('div.hud-coop', { hidden: true }, this.coopText, h('div.hud-coop-bar', {}, this.coopFill));
  /** Multiplayer client: shown while no updates arrive from the host. */
  private waiting = h(
    'div.hud-waiting',
    { hidden: true },
    h('strong', {}, 'Waiting for the host…'),
    h('span', {}, 'Their connection dropped out, or their game is in a background tab.'),
  );
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
    const totalWeight = cfg.questionTypes.reduce((sum, t) => sum + Math.max(0, t.weight), 0) || 1;
    this.questionHint = h(
      'div.hud-slots',
      {},
      h('div.slot-hint', {}, h('span.key', {}, 'Space'), ' Question', this.questionTimer),
      this.ratingLine,
      ...cfg.questionTypes
        .filter((t) => t.weight > 0)
        .map((t) =>
          h(
            'div.slot-odds',
            {},
            `${t.label} ${Math.round((100 * t.weight) / totalWeight)}% `,
            h('span.reward', {}, `+${t.manaReward}`),
          ),
        ),
    );
    this.el = h(
      'div.hud',
      {},
      h('div.hud-bars', {}, this.hp.el, this.mana.el),
      this.round,
      this.coop,
      this.waiting,
      h('div.hud-spells', {}, ...this.spells),
      this.questionHint,
    );
  }

  private set(key: string, value: string, apply: () => void): void {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    apply();
  }

  update(world: World, playerId: string, questionTimeLeft?: number): void {
    const timerText = questionTimeLeft === undefined ? '' : ` · ${Math.ceil(questionTimeLeft)}s left`;
    this.set('questionTimer', timerText, () => {
      this.questionTimer.textContent = timerText;
      this.questionTimer.classList.toggle('urgent', questionTimeLeft !== undefined && questionTimeLeft <= 10);
    });
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
        : `Round ${w.round} · ${world.enemies.length + w.queue.length} enemies` +
          (Number.isFinite(w.roundTimeLeft) ? ` · next wave in ${Math.ceil(w.roundTimeLeft)}s` : '');
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

    this.updateCoop(world, p);

    const locked = !world.canAnswer(playerId);
    this.set('questionLocked', String(locked), () => this.questionHint.classList.toggle('locked', locked));
  }

  private updateCoop(world: World, p: PlayerState): void {
    const reviveSeconds = Math.max(1e-6, world.cfg.coop.reviveSeconds);
    let text = '';
    let progress = 0;
    if (!p.alive && !world.over) {
      text = p.reviveProgress > 0 ? 'Being revived…' : "You're down! A teammate can revive you.";
      progress = p.reviveProgress / reviveSeconds;
    } else {
      const target = world.reviveTarget(p.id);
      if (target) {
        text = target.reviveProgress > 0 ? 'Reviving…' : 'Hold F to revive';
        progress = target.reviveProgress / reviveSeconds;
      }
    }
    const state = `${text}|${progress.toFixed(2)}`;
    this.set('coop', state, () => {
      this.coop.hidden = !text;
      this.coop.classList.toggle('downed', !p.alive);
      this.coopText.textContent = text;
      this.coopFill.style.width = `${Math.min(1, progress) * 100}%`;
    });
  }

  /** Show a skill rating, e.g. "Math rating 845 ▲33". */
  showRating(skillName: string, rating: number, delta: number): void {
    const change = Math.round(delta);
    this.ratingLine.replaceChildren(
      `${skillName} rating ${Math.round(rating)}`,
      change ? h(`span.${change > 0 ? 'up' : 'down'}` as 'span', {}, ` ${change > 0 ? '▲' : '▼'}${Math.abs(change)}`) : '',
    );
  }

  /** Brief "+N" pop next to the mana bar. */
  showManaGain(amount: number): void {
    const pop = h('div.mana-pop', {}, `+${amount}`);
    this.mana.el.append(pop);
    setTimeout(() => pop.remove(), 900);
  }

  /** Screen (client) coordinates of the end of the mana bar's fill — where mana orbs fly to. */
  manaFillEnd(): { x: number; y: number } {
    const fill = this.mana.fill.getBoundingClientRect();
    const bar = this.mana.el.getBoundingClientRect();
    return { x: Math.max(fill.right, bar.left + 4), y: bar.top + bar.height / 2 };
  }

  /** Brief glow on the mana bar as an orb is absorbed. */
  pulseMana(): void {
    this.mana.el.classList.remove('absorb');
    void this.mana.el.offsetWidth; // restart the animation
    this.mana.el.classList.add('absorb');
  }

  /** A short message in the middle of the screen (e.g. "Only the host can pause"). */
  toast(text: string, ms = 1800): void {
    const el = h('div.hud-toast', { style: `animation-duration: ${ms}ms` }, text);
    this.el.append(el);
    setTimeout(() => el.remove(), ms);
  }

  setWaitingForHost(waiting: boolean): void {
    this.set('waiting', String(waiting), () => (this.waiting.hidden = !waiting));
  }

  showNoMana(): void {
    this.mana.el.classList.remove('shake');
    void this.mana.el.offsetWidth; // restart the animation
    this.mana.el.classList.add('shake');
  }
}
