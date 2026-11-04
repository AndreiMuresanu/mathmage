/**
 * How peers in one game room exchange messages. Game code only talks to this interface:
 * - TrysteroTransport (trysteroTransport.ts): the real thing, WebRTC peer-to-peer.
 * - BroadcastChannelTransport: tabs of one browser (dev: `?net=local`), no internet needed.
 * - MemoryHub: in-process peers for tests, with a simulated clock and latency.
 */
export type MessageHandler = (data: unknown, from: string) => void;

export interface Transport {
  readonly selfId: string;
  /** Peers currently connected. */
  peers(): string[];
  /** Send to one peer, or to everyone when `to` is omitted. */
  send(channel: string, data: unknown, to?: string): void;
  /** Set the handler for a channel (one per channel). */
  on(channel: string, handler: MessageHandler): void;
  onPeerJoin: ((peerId: string) => void) | null;
  onPeerLeave: ((peerId: string) => void) | null;
  /** Round-trip time to a peer, in ms. */
  ping(peerId: string): Promise<number>;
  leave(): void;
}

/** Shared plumbing: channel handlers. */
abstract class BaseTransport implements Transport {
  abstract readonly selfId: string;
  onPeerJoin: ((peerId: string) => void) | null = null;
  onPeerLeave: ((peerId: string) => void) | null = null;
  protected handlers = new Map<string, MessageHandler>();
  abstract peers(): string[];
  abstract send(channel: string, data: unknown, to?: string): void;
  abstract ping(peerId: string): Promise<number>;
  abstract leave(): void;
  on(channel: string, handler: MessageHandler): void {
    this.handlers.set(channel, handler);
  }
  protected deliver(channel: string, data: unknown, from: string): void {
    this.handlers.get(channel)?.(data, from);
  }
}

export function randomId(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
}

// ------------------------------------------------------------------ BroadcastChannel (dev)

type BcMessage =
  | { t: 'here'; from: string; to?: string }
  | { t: 'leave'; from: string }
  | { t: 'msg'; from: string; to?: string; c: string; d: unknown }
  | { t: 'ping' | 'pong'; from: string; to: string; n: number };

/** Peer is considered gone after this long without a heartbeat. */
const BC_TIMEOUT_MS = 4000;

/** Tabs of the same browser on the same origin, via BroadcastChannel. Dev/testing only. */
export class BroadcastChannelTransport extends BaseTransport {
  readonly selfId = randomId();
  private channel: BroadcastChannel;
  private lastSeen = new Map<string, number>();
  private pings = new Map<number, (ms: number) => void>();
  private timer: ReturnType<typeof setInterval>;
  private closed = false;

  constructor(roomCode: string) {
    super();
    this.channel = new BroadcastChannel(`mathmage-room:${roomCode}`);
    this.channel.onmessage = (e: MessageEvent<BcMessage>) => this.receive(e.data);
    this.post({ t: 'here', from: this.selfId });
    this.timer = setInterval(() => {
      this.post({ t: 'here', from: this.selfId });
      const now = Date.now();
      for (const [id, seen] of this.lastSeen) if (now - seen > BC_TIMEOUT_MS) this.drop(id);
    }, 1000);
    addEventListener('pagehide', this.onPageHide);
  }

  private onPageHide = () => this.leave();

  peers(): string[] {
    return [...this.lastSeen.keys()];
  }

  send(channel: string, data: unknown, to?: string): void {
    this.post({ t: 'msg', from: this.selfId, to, c: channel, d: data });
  }

  ping(peerId: string): Promise<number> {
    const n = Math.random();
    const start = performance.now();
    return new Promise((resolve) => {
      this.pings.set(n, () => resolve(performance.now() - start));
      this.post({ t: 'ping', from: this.selfId, to: peerId, n });
      setTimeout(() => this.pings.delete(n), 5000);
    });
  }

  leave(): void {
    if (this.closed) return;
    this.closed = true;
    this.post({ t: 'leave', from: this.selfId });
    clearInterval(this.timer);
    removeEventListener('pagehide', this.onPageHide);
    this.channel.close();
  }

  private post(m: BcMessage): void {
    if (!this.closed || m.t === 'leave') this.channel.postMessage(m);
  }

  private receive(m: BcMessage): void {
    if (m.from === this.selfId || ('to' in m && m.to && m.to !== this.selfId)) return;
    if (m.t === 'leave') return this.drop(m.from);
    const known = this.lastSeen.has(m.from);
    this.lastSeen.set(m.from, Date.now());
    if (!known) {
      this.post({ t: 'here', from: this.selfId, to: m.from }); // let the newcomer know about us
      this.onPeerJoin?.(m.from);
    }
    if (m.t === 'msg') this.deliver(m.c, m.d, m.from);
    else if (m.t === 'ping') this.post({ t: 'pong', from: this.selfId, to: m.from, n: m.n });
    else if (m.t === 'pong') this.pings.get(m.n)?.(0);
  }

  private drop(id: string): void {
    if (!this.lastSeen.delete(id)) return;
    this.onPeerLeave?.(id);
  }
}

// ------------------------------------------------------------------ in-memory (tests)

interface Queued {
  at: number;
  to: MemoryTransport;
  run: () => void;
}

/**
 * Connects MemoryTransports in one process. Time only moves when advance() is called, and every
 * message takes `latencyMs` to arrive (one way), so tests are deterministic.
 */
export class MemoryHub {
  now = 0;
  private members: MemoryTransport[] = [];
  private queue: Queued[] = [];

  readonly latencyMs: number;

  constructor(latencyMs = 0) {
    this.latencyMs = latencyMs;
  }

  join(id: string): MemoryTransport {
    const t = new MemoryTransport(id, this);
    for (const other of this.members) {
      other.connected.add(id);
      t.connected.add(other.selfId);
    }
    const others = [...this.members];
    this.members.push(t);
    // Peers hear about each other after one latency, like a real connection being set up.
    for (const other of others) {
      this.schedule(other, () => other.onPeerJoin?.(id));
      this.schedule(t, () => t.onPeerJoin?.(other.selfId));
    }
    return t;
  }

  /** Move the simulated clock forward and deliver everything due. */
  advance(ms: number): void {
    const target = this.now + ms;
    // Step through messages in time order, so replies sent along the way also arrive in time.
    for (;;) {
      this.queue.sort((a, b) => a.at - b.at);
      const next = this.queue[0];
      if (!next || next.at > target) break;
      this.queue.shift();
      this.now = Math.max(this.now, next.at);
      if (this.members.includes(next.to)) next.run();
    }
    this.now = target;
  }

  /** @internal */
  schedule(to: MemoryTransport, run: () => void): void {
    this.queue.push({ at: this.now + this.latencyMs, to, run });
  }

  /** @internal */
  member(id: string): MemoryTransport | undefined {
    return this.members.find((m) => m.selfId === id);
  }

  /** @internal */
  remove(t: MemoryTransport): void {
    this.members = this.members.filter((m) => m !== t);
    for (const other of this.members) {
      other.connected.delete(t.selfId);
      this.schedule(other, () => other.onPeerLeave?.(t.selfId));
    }
  }
}

export class MemoryTransport extends BaseTransport {
  /** @internal */
  connected = new Set<string>();

  readonly selfId: string;
  private hub: MemoryHub;

  constructor(selfId: string, hub: MemoryHub) {
    super();
    this.selfId = selfId;
    this.hub = hub;
  }

  peers(): string[] {
    return [...this.connected];
  }

  send(channel: string, data: unknown, to?: string): void {
    const copy = JSON.parse(JSON.stringify(data)) as unknown; // like the wire: no shared objects
    for (const id of to ? [to] : this.peers()) {
      const target = this.hub.member(id);
      if (target) this.hub.schedule(target, () => target.receive(channel, copy, this.selfId));
    }
  }

  /** @internal */
  receive(channel: string, data: unknown, from: string): void {
    this.deliver(channel, data, from);
  }

  ping(): Promise<number> {
    return Promise.resolve(this.hub.latencyMs * 2);
  }

  leave(): void {
    this.hub.remove(this);
  }
}
