// Thin wrapper around Supabase: RPC calls for persistence, a realtime channel for live sync.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    const err = new Error(error.message || 'Request failed');
    err.code = error.code;
    throw err;
  }
  return data;
}

export const register = (handle, pass, state) =>
  rpc('bg_register', { p_handle: handle, p_pass: pass, p_state: state });
export const login = (handle, pass) => rpc('bg_login', { p_handle: handle, p_pass: pass });
export const getRoom = (id) => rpc('bg_get_room', { p_id: id });
export const saveRoom = (id, state, version, result = null) =>
  rpc('bg_save_room', { p_id: id, p_state: state, p_version: version, p_result: result });
export const listGames = (id) => rpc('bg_list_games', { p_id: id });
export const settleGame = (id, game, settled) =>
  rpc('bg_settle_game', { p_id: id, p_game: game, p_settled: settled });
export const changePass = (id, pass) => rpc('bg_change_pass', { p_id: id, p_pass: pass });

// The channel name embeds the private board token, so only signed-in devices can find it.
export function connect(id, seat, handlers) {
  const ch = sb.channel('bg-' + id, {
    config: { broadcast: { self: false }, presence: { key: seat + '-' + Math.random().toString(36).slice(2, 8) } },
  });
  ch.on('broadcast', { event: 'state' }, ({ payload }) => handlers.onState?.(payload));
  ch.on('broadcast', { event: 'react' }, ({ payload }) => handlers.onReact?.(payload));
  ch.on('broadcast', { event: 'games' }, () => handlers.onGames?.());
  ch.on('presence', { event: 'sync' }, () => {
    const seats = new Set();
    for (const list of Object.values(ch.presenceState())) {
      for (const p of list) for (const s of String(p.seat).split(',')) seats.add(s);
    }
    handlers.onPresence?.(seats);
  });
  ch.subscribe((status) => {
    handlers.onStatus?.(status);
    if (status === 'SUBSCRIBED') ch.track({ seat: String(seat) });
  });
  return {
    send(event, payload) {
      return ch.send({ type: 'broadcast', event, payload });
    },
    close() {
      sb.removeChannel(ch);
    },
  };
}
