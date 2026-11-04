import type { MatchSetup } from '../game/matchSetup';
import { GAME_VERSION } from '../online/leaderboard';
import { CH, PROTOCOL_VERSION, type HelloMsg, type RefuseMsg, type RosterMsg, type RoomPlayer, type StartMsg } from './protocol';
import type { Transport } from './transport';

/** How long a joining player waits for the host before giving up. */
export const JOIN_TIMEOUT_MS = 15_000;

export interface HostOptions {
  code: string;
  name: string;
  setup: MatchSetup;
  maxPlayers: number;
  /** Listed on the Worker's open-games list (the host's UI handles the heartbeat). */
  isPublic: boolean;
}

/**
 * A game room before and between matches: who's in it, who hosts, and what will be played.
 * The host owns the roster and decides who may join; clients mirror it. The connection (and
 * this session) outlives individual matches, so a team can play again without re-joining.
 */
export class RoomSession {
  readonly transport: Transport;
  readonly code: string;
  readonly isHost: boolean;
  hostId: string;
  players: RoomPlayer[] = [];
  setup: MatchSetup;
  maxPlayers: number;
  isPublic: boolean;
  started = false;
  /** Roster or settings changed. */
  onChange: (() => void) | null = null;
  /** The host started a match. */
  onStart: ((msg: StartMsg) => void) | null = null;
  /** The room is gone for us (host left, refused, ...). */
  onClosed: ((reason: string) => void) | null = null;
  private leaveListeners = new Set<(peerId: string) => void>();
  private closed = false;

  private constructor(transport: Transport, code: string, isHost: boolean, setup: MatchSetup, maxPlayers: number, isPublic: boolean) {
    this.transport = transport;
    this.code = code;
    this.isHost = isHost;
    this.hostId = isHost ? transport.selfId : '';
    this.setup = setup;
    this.maxPlayers = maxPlayers;
    this.isPublic = isPublic;
    transport.onPeerLeave = (id) => this.peerLeft(id);
    transport.on(CH.start, (data, from) => {
      if (from !== this.hostId || this.isHost) return;
      this.started = true;
      this.onStart?.(data as StartMsg);
    });
  }

  /** Open a room as its host. */
  static host(transport: Transport, opts: HostOptions): RoomSession {
    const room = new RoomSession(transport, opts.code, true, opts.setup, opts.maxPlayers, opts.isPublic);
    room.players = [{ id: transport.selfId, name: opts.name }];
    transport.on(CH.hello, (data, from) => room.hostHandleHello(data as HelloMsg, from));
    // Re-send the roster when anyone connects, so late connections still learn it.
    transport.onPeerJoin = () => room.broadcastRoster();
    return room;
  }

  /** Join someone's room; resolves once the host has accepted us. */
  static join(transport: Transport, code: string, name: string, timeoutMs = JOIN_TIMEOUT_MS): Promise<RoomSession> {
    const placeholder: MatchSetup = { mode: 'coop', ranked: false, map: 'empty' };
    const room = new RoomSession(transport, code, false, placeholder, 4, false);
    const hello: HelloMsg = { v: PROTOCOL_VERSION, game: GAME_VERSION, name };
    return new Promise((resolve, reject) => {
      let accepted = false;
      const timer = setTimeout(() => {
        if (accepted) return;
        transport.leave();
        reject(new Error("Couldn't find that room. Check the Room ID, or ask the host to keep it open."));
      }, timeoutMs);
      transport.on(CH.roster, (data, from) => {
        const roster = data as RosterMsg;
        if (roster.code !== code) return;
        room.hostId = from;
        room.applyRoster(roster);
        if (!accepted && roster.players.some((p) => p.id === transport.selfId)) {
          accepted = true;
          clearTimeout(timer);
          resolve(room);
        }
      });
      transport.on(CH.refuse, (data) => {
        clearTimeout(timer);
        transport.leave();
        reject(new Error((data as RefuseMsg).reason));
      });
      // Say hello to everyone already here and to anyone who connects later (the host replies).
      transport.onPeerJoin = (id) => transport.send(CH.hello, hello, id);
      transport.send(CH.hello, hello);
    });
  }

  get selfId(): string {
    return this.transport.selfId;
  }

  nameOf(id: string): string {
    return this.players.find((p) => p.id === id)?.name ?? 'Mage';
  }

  /** Host: change what will be played (e.g. after a match). */
  updateSetup(setup: MatchSetup): void {
    if (!this.isHost) return;
    this.setup = setup;
    this.broadcastRoster();
  }

  /** Host: begin a match for everyone in the room. */
  start(msg: StartMsg): void {
    if (!this.isHost) return;
    this.started = true;
    this.transport.send(CH.start, msg);
    this.broadcastRoster();
    this.onStart?.(msg);
  }

  /** Host: the match ended; the room accepts players again. */
  backToLobby(): void {
    if (!this.isHost) return;
    this.started = false;
    this.broadcastRoster();
  }

  /** Register a callback for peers leaving (drivers use this to drop disconnected mages). */
  addPeerLeaveListener(fn: (peerId: string) => void): () => void {
    this.leaveListeners.add(fn);
    return () => this.leaveListeners.delete(fn);
  }

  leave(): void {
    if (this.closed) return;
    this.closed = true;
    this.transport.leave();
  }

  // ---- internals

  private hostHandleHello(hello: HelloMsg, from: string): void {
    const refuse = (reason: string) => this.transport.send(CH.refuse, { reason } satisfies RefuseMsg, from);
    if (this.players.some((p) => p.id === from)) return this.broadcastRoster();
    if (hello.v !== PROTOCOL_VERSION || hello.game !== GAME_VERSION) {
      return refuse('This room is running a different version of the game. Refresh the page and try again.');
    }
    if (this.started) return refuse('That game has already started.');
    if (this.players.length >= this.maxPlayers) return refuse('That room is full.');
    const name = String(hello.name ?? '').trim().slice(0, 20) || `Mage ${this.players.length + 1}`;
    this.players.push({ id: from, name });
    this.broadcastRoster();
  }

  private broadcastRoster(): void {
    if (!this.isHost || this.closed) return;
    const roster: RosterMsg = {
      code: this.code,
      hostId: this.selfId,
      players: this.players,
      setup: this.setup,
      maxPlayers: this.maxPlayers,
      started: this.started,
    };
    this.transport.send(CH.roster, roster);
    this.onChange?.();
  }

  private applyRoster(roster: RosterMsg): void {
    this.players = roster.players;
    this.setup = roster.setup;
    this.maxPlayers = roster.maxPlayers;
    this.started = roster.started;
    this.onChange?.();
  }

  private peerLeft(id: string): void {
    for (const fn of this.leaveListeners) fn(id);
    if (!this.isHost && id === this.hostId) {
      this.leave();
      this.onClosed?.('The host left the game.');
      return;
    }
    if (this.isHost && this.players.some((p) => p.id === id)) {
      this.players = this.players.filter((p) => p.id !== id);
      this.broadcastRoster();
    }
  }
}
