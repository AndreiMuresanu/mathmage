import { handle, type Env } from './api';

/** Math Mage online API (leaderboard now; open-games list and TURN credentials in later phases). */
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
};
