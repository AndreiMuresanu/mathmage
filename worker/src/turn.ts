import { HttpError } from './api';

/** One ICE server entry, as WebRTC (and Trystero's turnConfig) expects it. */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** How long minted TURN credentials stay valid (s). */
const CREDENTIAL_TTL_S = 24 * 60 * 60;
const CLOUDFLARE_TURN = 'https://rtc.live.cloudflare.com/v1/turn/keys';

/**
 * GET /turn: short-lived credentials for Cloudflare's TURN relay, used by players whose networks
 * can't connect to each other directly. The TURN key's API token stays here on the server; only
 * the temporary credentials go to the game. 404 when no TURN key is configured (the game then
 * connects without a relay, as before).
 */
export async function turnCredentials(
  env: { TURN_KEY_ID?: string; TURN_KEY_API_TOKEN?: string },
  fetchFn: typeof fetch = fetch,
): Promise<{ iceServers: IceServer[] }> {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) throw new HttpError(404, 'No TURN relay configured.');
  const request = (path: string) =>
    fetchFn(`${CLOUDFLARE_TURN}/${env.TURN_KEY_ID}/credentials/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: CREDENTIAL_TTL_S }),
    });
  // Current endpoint returns a ready-made list; fall back to the older one if it isn't available.
  let res = await request('generate-ice-servers');
  if (res.status === 404) res = await request('generate');
  if (!res.ok) throw new HttpError(502, `TURN credentials request failed (${res.status}).`);
  const body = (await res.json()) as { iceServers?: IceServer | IceServer[] };
  const list = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
  // Keep only relay (TURN) servers; peers already have STUN servers for direct connections.
  const iceServers = list
    .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => /^turns?:/.test(u)) }))
    .filter((s) => s.urls.length > 0 && s.username && s.credential);
  if (!iceServers.length) throw new HttpError(502, 'TURN service returned no relay servers.');
  return { iceServers };
}
