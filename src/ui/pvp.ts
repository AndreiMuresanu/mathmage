import type { GameConfig } from '../config/gameConfig';
import { characterCss, getCharacter } from '../game/characters';
import type { KillCause, PlayerState } from '../sim/types';
import type { World } from '../sim/world';
import { h } from './dom';

/** What the death screen says after the killer's name, by what did it. */
export function killDescription(cause: KillCause, cfg: GameConfig): string {
  if (cause.kind === 'enemy') return cause.enemy === 'caster' ? 'A caster got you.' : 'A chaser got you.';
  const spell = cfg.spells[cause.spell];
  if (spell?.kind === 'laser') return 'vaporized you.';
  if (spell && spell.explosionRadius > 0) return 'turned you into tiny pieces.';
  return 'made you ✨disappear✨.';
}

/** "Hana vaporized you." / "A chaser got you." */
export function deathLine(killerName: string | undefined, cause: KillCause | undefined, cfg: GameConfig): string {
  if (!cause) return 'You were defeated.';
  if (cause.kind === 'enemy' || !killerName) return cause.kind === 'enemy' ? killDescription(cause, cfg) : 'You were defeated.';
  return `${killerName} ${killDescription(cause, cfg)}`;
}

/** Players by kills (then fewest deaths, then name). */
export function standings(players: PlayerState[], nameOf: (id: string) => string): PlayerState[] {
  return [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || nameOf(a.id).localeCompare(nameOf(b.id)));
}

/** Rows of a kills table: colour chip, name, kills (the local player highlighted). */
export function killRows(players: PlayerState[], nameOf: (id: string) => string, localId: string, withDeaths = false): HTMLElement[] {
  return standings(players, nameOf).map((p) =>
    h(
      `div.kill-row${p.id === localId ? '.me' : ''}` as 'div',
      {},
      h('span.character-chip', { style: `background:${characterCss(getCharacter(p.character))}` }),
      h('span.kill-name', {}, nameOf(p.id)),
      withDeaths ? h('span.kill-deaths', { title: 'Deaths' }, `${p.deaths}☠`) : null,
      h('span.kill-count', { title: 'Kills' }, String(p.kills)),
    ),
  );
}

/** The goal line: "First to 5 kills", "Time left 3:12", "Endless". */
export function goalText(world: World): string {
  const ffa = world.cfg.ffa;
  if (ffa.winCondition === 'kills') return `First to ${ffa.killTarget} kills`;
  if (ffa.winCondition === 'time') {
    const left = Math.max(0, ffa.timeLimitMinutes * 60 - world.stats.timeSurvived);
    return `Time left ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  }
  return 'Endless';
}

/** A number with "<" and ">" either side (e.g. max players, kill target). */
export function createStepper(opts: {
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (n: number) => string;
  onChange(value: number): void;
}): HTMLDivElement {
  const step = opts.step ?? 1;
  const format = opts.format ?? String;
  let value = opts.value;
  const label = h('span.stepper-value');
  const less = h('button.stepper-arrow', { type: 'button', title: 'Less' }, '<');
  const more = h('button.stepper-arrow', { type: 'button', title: 'More' }, '>');
  const render = () => {
    label.textContent = format(value);
    less.disabled = value <= opts.min + 1e-9;
    more.disabled = value >= opts.max - 1e-9;
  };
  const change = (delta: number) => {
    value = Math.round(Math.min(opts.max, Math.max(opts.min, value + delta)) * 1000) / 1000;
    render();
    opts.onChange(value);
  };
  less.addEventListener('click', () => change(-step));
  more.addEventListener('click', () => change(step));
  render();
  return h('div.stepper', {}, less, label, more);
}

const COLLAPSED_KEY = 'mathmage.killboardCollapsed';

/** The in-match kills leaderboard (top left, under the bars), with a "−" / "+" toggle. */
export class KillBoard {
  readonly el: HTMLDivElement;
  private rows = h('div.kill-rows');
  private toggle = h('button.killboard-toggle', { type: 'button' });
  private collapsed = false;
  private lastKey = '';

  constructor() {
    try {
      this.collapsed = localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      // storage unavailable
    }
    this.toggle.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      try {
        localStorage.setItem(COLLAPSED_KEY, this.collapsed ? '1' : '0');
      } catch {
        // storage unavailable
      }
      this.applyCollapsed();
    });
    this.el = h('div.hud-killboard', { hidden: true }, h('div.killboard-head', {}, h('span', {}, 'Kills'), this.toggle), this.rows);
    this.applyCollapsed();
  }

  update(world: World, nameOf: (id: string) => string, localId: string): void {
    this.el.hidden = !world.pvp;
    if (!world.pvp) return;
    const key = world.players.map((p) => `${p.id}:${p.kills}:${p.deaths}`).join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.rows.replaceChildren(...killRows(world.players, nameOf, localId));
  }

  private applyCollapsed(): void {
    this.toggle.textContent = this.collapsed ? '+' : '−';
    this.toggle.title = this.collapsed ? 'Show the leaderboard' : 'Hide the leaderboard';
    this.rows.hidden = this.collapsed;
  }
}
