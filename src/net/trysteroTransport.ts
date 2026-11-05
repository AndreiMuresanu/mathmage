import { joinRoom, selfId } from 'trystero';
import type { MessageHandler, Transport } from './transport';

/** Trystero app id: peers only meet others with the same id (bump on incompatible changes). */
const APP_ID = 'mathmage-v1';

type Room = ReturnType<typeof joinRoom>;
/** What actually goes over the wire: every game channel shares one Trystero action. */
type Envelope = { c: string; d: never };
interface EnvelopeAction {
  send(data: Envelope, options?: { target?: string }): Promise<void>;
  onMessage: ((data: Envelope, context: { peerId: string }) => void) | null;
}

/**
 * The real transport: WebRTC data channels between peers, with signalling over public Nostr
 * relays (Trystero's default strategy).
 */
export class TrysteroTransport implements Transport {
  readonly selfId = selfId;
  onPeerJoin: ((peerId: string) => void) | null = null;
  onPeerLeave: ((peerId: string) => void) | null = null;
  private room: Room;
  private action: EnvelopeAction;
  private handlers = new Map<string, MessageHandler>();

  /**
   * `turnConfig`: relay servers for peers that can't connect directly (see online/turn.ts).
   * `relayOnly`: testing aid — never connect directly, so a working match proves the relay works.
   */
  constructor(roomCode: string, turnConfig?: { urls: string | string[]; username?: string; credential?: string }[], relayOnly = false) {
    const relay = relayOnly && turnConfig?.length ? { rtcConfig: { iceTransportPolicy: 'relay' as const, iceServers: turnConfig } } : {};
    this.room = joinRoom({ appId: APP_ID, ...(turnConfig?.length ? { turnConfig } : {}), ...relay }, roomCode);
    this.action = this.room.makeAction('mm') as unknown as EnvelopeAction;
    this.action.onMessage = (data, ctx) => this.handlers.get(data.c)?.(data.d, ctx.peerId);
    this.room.onPeerJoin = (id) => this.onPeerJoin?.(id);
    this.room.onPeerLeave = (id) => this.onPeerLeave?.(id);
  }

  peers(): string[] {
    return Object.keys(this.room.getPeers());
  }

  send(channel: string, data: unknown, to?: string): void {
    void this.action.send({ c: channel, d: data as never }, to ? { target: to } : undefined).catch(() => {});
  }

  on(channel: string, handler: MessageHandler): void {
    this.handlers.set(channel, handler);
  }

  ping(peerId: string): Promise<number> {
    return this.room.ping(peerId);
  }

  leave(): void {
    void this.room.leave();
  }
}
