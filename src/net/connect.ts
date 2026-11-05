import { fetchTurnServers } from '../online/turn';
import { BroadcastChannelTransport, type Transport } from './transport';

/**
 * Open the transport for a game room. Dev builds can add `?net=local` to the URL to connect
 * tabs of the same browser over BroadcastChannel (no internet / relays needed).
 */
export async function connectToRoom(roomCode: string): Promise<Transport> {
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('net') === 'local') {
    return new BroadcastChannelTransport(roomCode);
  }
  // Loaded on demand so solo players never download the WebRTC stack. Relay (TURN) servers are
  // optional: without them most players still connect directly.
  const [{ TrysteroTransport }, turn] = await Promise.all([import('./trysteroTransport'), fetchTurnServers()]);
  // `?relay=only` (testing): force every connection through the relay.
  const relayOnly = new URLSearchParams(location.search).get('relay') === 'only';
  if (relayOnly && !turn?.length) throw new Error('Relay-only test mode, but no relay (TURN) servers are available.');
  return new TrysteroTransport(roomCode, turn, relayOnly);
}

/** Room codes: 6 characters without look-alikes (no O/0, I/1/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** Normalise what a player typed as a room code (case, spaces, punctuation). */
export function cleanRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
