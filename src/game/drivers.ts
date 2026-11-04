import { applySnapshot, CH, encodeSnapshot, interpolateSnapshots, type AnswerMsg, type IntentMsg, type PauseMsg, type PeakMsg, type RoomPlayer, type SnapMsg, type Snapshot, type SubmittedMsg } from '../net/protocol';
import type { RoomSession } from '../net/room';
import type { PlayerIntent, SimEvent } from '../sim/types';
import type { World } from '../sim/world';

/** The local player's id in solo matches. Multiplayer uses each peer's network id. */
export const SOLO_PLAYER = 'local';
/** How often the host sends a snapshot (ms of match time). */
export const SNAPSHOT_INTERVAL_MS = 50;
/** Clients draw other entities this far in the past, so there are snapshots on both sides to blend. */
export const INTERPOLATION_DELAY_MS = 100;
/** Corrections to the client's own predicted position fade out over about this long (s). */
const CORRECTION_FADE_S = 0.1;
/** The host ignores client intent durations longer than this (s), and caps the total per frame. */
const MAX_INTENT_DT = 0.1;
const MAX_CATCHUP_DT = 0.25;

/** Ranked co-op: gathering each player's peak ELO and sharing the team's submission result. */
export interface TeamScoring {
  readonly isHost: boolean;
  readonly players: RoomPlayer[];
  /** Peak ELO per player id, as received so far (host only). */
  readonly peaks: Map<string, number>;
  /** Report this player's peak ELO (clients send it to the host; the host records its own). */
  sendPeak(elo: number): void;
  onPeaksChanged: (() => void) | null;
  /** Host: tell everyone how the submission went. */
  broadcastSubmitted(msg: SubmittedMsg): void;
  onSubmitted: ((msg: SubmittedMsg) => void) | null;
}

/**
 * How a Match runs its World: on this machine (solo), as the multiplayer host (authoritative,
 * sending snapshots), or as a client (mirroring the host's snapshots, predicting its own mage).
 */
export interface MatchDriver {
  readonly world: World;
  /** Id of the player this machine controls. */
  readonly localId: string;
  readonly multiplayer: boolean;
  /** Solo players and hosts can pause (a host's pause stops everyone). */
  readonly canPause: boolean;
  /** Advance by `dt` seconds with the local player's intent; returns events for the scene. */
  step(dt: number, intent: PlayerIntent): SimEvent[];
  /** The local player answered a question. */
  answer(typeIndex: number, correct: boolean, stunMultiplier: number): void;
  /** Host: (un)pause everyone. */
  setPaused(paused: boolean): void;
  /** Client: the host (un)paused the match. */
  onRemotePause: ((paused: boolean) => void) | null;
  readonly team?: TeamScoring;
  /** Client: ms since the last update from the host (to tell the player when it stalls). */
  hostSilentMs?(): number;
  dispose(): void;
}

// ------------------------------------------------------------------ solo

export class LocalDriver implements MatchDriver {
  readonly world: World;
  readonly localId = SOLO_PLAYER;
  readonly multiplayer = false;
  readonly canPause = true;
  onRemotePause: ((paused: boolean) => void) | null = null;

  constructor(world: World) {
    this.world = world;
  }

  step(dt: number, intent: PlayerIntent): SimEvent[] {
    this.world.step(dt, { [this.localId]: intent });
    return this.world.drainEvents();
  }

  answer(typeIndex: number, correct: boolean, stunMultiplier: number): void {
    this.world.answerQuestion(this.localId, typeIndex, correct, stunMultiplier);
  }

  setPaused(): void {}
  dispose(): void {}
}

// ------------------------------------------------------------------ shared multiplayer bits

function teamScoring(room: RoomSession, onPeak?: (from: string, elo: number) => void): TeamScoring {
  const peaks = new Map<string, number>();
  const team: TeamScoring = {
    isHost: room.isHost,
    players: [...room.players],
    peaks,
    sendPeak(elo) {
      if (room.isHost) {
        peaks.set(room.selfId, elo);
        team.onPeaksChanged?.();
      } else {
        room.transport.send(CH.peak, { elo } satisfies PeakMsg, room.hostId);
      }
    },
    onPeaksChanged: null,
    broadcastSubmitted(msg) {
      if (room.isHost) room.transport.send(CH.submitted, msg);
    },
    onSubmitted: null,
  };
  if (room.isHost) {
    room.transport.on(CH.peak, (data, from) => {
      if (!team.players.some((p) => p.id === from)) return;
      peaks.set(from, Number((data as PeakMsg).elo) || 0);
      onPeak?.(from, peaks.get(from)!);
      team.onPeaksChanged?.();
    });
  } else {
    room.transport.on(CH.submitted, (data, from) => {
      if (from === room.hostId) team.onSubmitted?.(data as SubmittedMsg);
    });
  }
  return team;
}

// ------------------------------------------------------------------ host

/**
 * Runs the real World. Remote players' movement is applied from their queued intents (using the
 * durations the clients predicted with, so their prediction matches); everything else uses their
 * latest intent. Sends a snapshot + events every SNAPSHOT_INTERVAL_MS.
 */
export class HostDriver implements MatchDriver {
  readonly world: World;
  readonly localId: string;
  readonly multiplayer = true;
  readonly canPause = true;
  readonly team: TeamScoring;
  onRemotePause: ((paused: boolean) => void) | null = null;
  private room: RoomSession;
  private queued = new Map<string, IntentMsg[]>();
  private latest = new Map<string, IntentMsg>();
  private acks: Record<string, number> = {};
  private outbox: SimEvent[] = [];
  private clock = 0;
  private lastSnap = -Infinity;
  private sentOver = false;
  private unlisten: () => void;

  constructor(world: World, room: RoomSession) {
    this.world = world;
    this.room = room;
    this.localId = room.selfId;
    world.sharedTime = true;
    const t = room.transport;
    t.on(CH.intent, (data, from) => {
      if (!this.world.player(from)) return;
      const list = this.queued.get(from) ?? [];
      list.push(data as IntentMsg);
      this.queued.set(from, list);
    });
    t.on(CH.answer, (data, from) => {
      const a = data as AnswerMsg;
      this.world.answerQuestion(from, a.typeIndex, a.correct, a.stunMultiplier);
    });
    this.unlisten = room.addPeerLeaveListener((id) => {
      this.world.removePlayer(id);
      this.queued.delete(id);
      this.latest.delete(id);
    });
    this.team = teamScoring(room);
  }

  step(dt: number, intent: PlayerIntent): SimEvent[] {
    const intents: Record<string, PlayerIntent> = { [this.localId]: intent };
    for (const p of this.world.players) {
      if (p.id === this.localId) continue;
      const list = this.queued.get(p.id);
      if (list?.length) {
        let budget = MAX_CATCHUP_DT;
        for (const msg of list) {
          const d = Math.min(Math.max(0, msg.dt), MAX_INTENT_DT, budget);
          budget -= d;
          this.world.predictMove(p.id, msg, d);
        }
        const last = list[list.length - 1];
        this.latest.set(p.id, last);
        this.acks[p.id] = last.seq;
        this.queued.set(p.id, []);
      }
      const last = this.latest.get(p.id);
      // Movement was applied above; the tick handles aiming, casting, spells and reviving.
      if (last) intents[p.id] = { ...last, move: { x: 0, y: 0 } };
    }
    this.world.step(dt, intents);
    this.clock += dt * 1000;
    const events = this.world.drainEvents();
    this.outbox.push(...events);
    if (this.clock - this.lastSnap >= SNAPSHOT_INTERVAL_MS || (this.world.over && !this.sentOver)) this.sendSnapshot();
    return events;
  }

  private sendSnapshot(): void {
    this.lastSnap = this.clock;
    this.sentOver = this.world.over;
    const msg: SnapMsg = { s: encodeSnapshot(this.world, this.clock, this.acks), events: this.outbox };
    this.outbox = [];
    this.room.transport.send(CH.snap, msg);
  }

  answer(typeIndex: number, correct: boolean, stunMultiplier: number): void {
    this.world.answerQuestion(this.localId, typeIndex, correct, stunMultiplier);
  }

  setPaused(paused: boolean): void {
    this.room.transport.send(CH.pause, { paused } satisfies PauseMsg);
  }

  dispose(): void {
    const t = this.room.transport;
    for (const ch of [CH.intent, CH.answer, CH.peak]) t.on(ch, () => {});
    this.unlisten();
  }
}

// ------------------------------------------------------------------ client

interface BufferedEvents {
  t: number;
  events: SimEvent[];
}

/**
 * Mirrors the host. Remote entities are drawn INTERPOLATION_DELAY_MS in the past, blended between
 * snapshots; the local mage is predicted (moves instantly) and reconciled with each snapshot.
 */
export class ClientDriver implements MatchDriver {
  readonly world: World;
  readonly localId: string;
  readonly multiplayer = true;
  readonly canPause = false;
  readonly team: TeamScoring;
  onRemotePause: ((paused: boolean) => void) | null = null;
  private room: RoomSession;
  private snaps: Snapshot[] = [];
  private eventQueue: BufferedEvents[] = [];
  private pending: IntentMsg[] = [];
  private seq = 0;
  /** Local clock (ms), advanced by step(). */
  private localTime = 0;
  /** Estimated host clock minus local clock. */
  private clockOffset: number | undefined;
  /** Predicted own position last frame, and the visual correction still being faded out. */
  private lastPredicted: { x: number; y: number } | undefined;
  private correction = { x: 0, y: 0 };
  /** Local clock time until which a wrong answer's stun is assumed (before the host confirms it). */
  private localStunUntil = 0;
  private lastSpell = 0;
  /** Wall-clock time of the last snapshot (or of the match starting). */
  private lastHeard = performance.now();

  constructor(world: World, room: RoomSession) {
    this.world = world;
    this.room = room;
    this.localId = room.selfId;
    world.sharedTime = true;
    const t = room.transport;
    t.on(CH.snap, (data, from) => {
      if (from !== room.hostId) return;
      const msg = data as SnapMsg;
      this.lastHeard = performance.now();
      this.receive(msg.s);
      if (msg.events.length) this.eventQueue.push({ t: msg.s.t, events: msg.events });
    });
    t.on(CH.pause, (data, from) => {
      if (from === room.hostId) this.onRemotePause?.((data as PauseMsg).paused);
    });
    this.team = teamScoring(room);
  }

  private receive(s: Snapshot): void {
    const offset = s.t - this.localTime;
    // Track the host clock: jump on big changes (start, hiccups), otherwise smooth out jitter.
    if (this.clockOffset === undefined || Math.abs(offset - this.clockOffset) > 250) this.clockOffset = offset;
    else this.clockOffset += (offset - this.clockOffset) * 0.1;
    this.snaps.push(s);
    if (this.snaps.length > 40) this.snaps.shift();
  }

  step(dt: number, intent: PlayerIntent): SimEvent[] {
    this.localTime += dt * 1000;
    const msg: IntentMsg = { ...intent, seq: ++this.seq, dt };
    if (intent.spell !== undefined) this.lastSpell = intent.spell;
    this.room.transport.send(CH.intent, msg, this.room.hostId);
    this.pending.push(msg);
    if (this.snaps.length === 0 || this.clockOffset === undefined) {
      // Nothing from the host yet: just move our own mage locally.
      this.world.predictMove(this.localId, intent, dt);
      return [];
    }
    const renderTime = this.localTime + this.clockOffset - INTERPOLATION_DELAY_MS;
    applySnapshot(this.world, this.snapshotAt(renderTime));
    this.predictSelf(dt, intent);
    return this.releaseEvents(renderTime);
  }

  /** The (interpolated) snapshot to draw at `t`. */
  private snapshotAt(t: number): Snapshot {
    const snaps = this.snaps;
    if (t <= snaps[0].t) return snaps[0];
    for (let i = snaps.length - 1; i > 0; i--) {
      if (snaps[i - 1].t <= t) {
        const a = snaps[i - 1];
        const b = snaps[i];
        return t >= b.t ? b : interpolateSnapshots(a, b, (t - a.t) / Math.max(1, b.t - a.t));
      }
    }
    return snaps[snaps.length - 1];
  }

  /** Own mage: newest host state, plus every input the host hasn't applied yet. */
  private predictSelf(dt: number, intent: PlayerIntent): void {
    const latest = this.snaps[this.snaps.length - 1];
    const authoritative = latest.players.find((p) => p.id === this.localId);
    const index = this.world.players.findIndex((p) => p.id === this.localId);
    if (!authoritative || index < 0) return;
    const me = { ...authoritative, cooldowns: [...authoritative.cooldowns], questionStats: authoritative.questionStats.map((q) => ({ ...q })) };
    this.world.players[index] = me;
    const ack = latest.acks[this.localId] ?? 0;
    this.pending = this.pending.filter((m) => m.seq > ack);
    for (const m of this.pending) this.world.predictMove(this.localId, m, m.dt);

    // Smooth over corrections: where we expected to be vs where reconciliation put us.
    if (this.lastPredicted) {
      const len = Math.hypot(intent.move.x, intent.move.y);
      const step = len > 0 ? (this.world.cfg.player.speed * dt) / len : 0;
      const ex = this.lastPredicted.x + intent.move.x * step - me.x;
      const ey = this.lastPredicted.y + intent.move.y * step - me.y;
      if (Math.hypot(ex, ey) > 4) {
        this.correction.x += ex;
        this.correction.y += ey;
      }
    }
    this.lastPredicted = { x: me.x, y: me.y };
    const fade = Math.exp(-dt / CORRECTION_FADE_S);
    this.correction.x *= fade;
    this.correction.y *= fade;
    me.x += this.correction.x;
    me.y += this.correction.y;

    // Things the host will confirm a moment later.
    me.selectedSpell = this.lastSpell;
    if (this.localStunUntil > this.localTime) me.stunRemaining = Math.max(me.stunRemaining, (this.localStunUntil - this.localTime) / 1000);
  }

  /** Events whose snapshot is now being drawn (so effects line up with what's on screen). */
  private releaseEvents(renderTime: number): SimEvent[] {
    const out: SimEvent[] = [];
    while (this.eventQueue.length && this.eventQueue[0].t <= renderTime) out.push(...this.eventQueue.shift()!.events);
    return out;
  }

  answer(typeIndex: number, correct: boolean, stunMultiplier: number): void {
    this.room.transport.send(CH.answer, { typeIndex, correct, stunMultiplier } satisfies AnswerMsg, this.room.hostId);
    if (!correct) {
      const seconds = (this.world.cfg.questionTypes[typeIndex]?.stunSeconds ?? 0) * stunMultiplier;
      this.localStunUntil = this.localTime + seconds * 1000;
    }
  }

  setPaused(): void {}

  hostSilentMs(): number {
    return performance.now() - this.lastHeard;
  }

  dispose(): void {
    const t = this.room.transport;
    for (const ch of [CH.snap, CH.pause, CH.submitted]) t.on(ch, () => {});
  }
}
