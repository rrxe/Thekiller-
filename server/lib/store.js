// Supabase-backed Store for GameService (one instance per authenticated player).
import { rpc } from './supabase.js'
import { GameError } from '../game-service.gen.js'

let cfg = null, cfgAt = 0
async function settings() {
  if (cfg && Date.now() - cfgAt < 4000) return cfg
  cfg = await rpc('oddxs_game_settings'); cfgAt = Date.now()
  return cfg
}
export const invalidateSettings = () => { cfg = null }

const wrap = async (p) => {
  try { return await p } catch (e) {
    if (e.isDb) throw new GameError(e.message === 'insufficient_balance' ? 'insufficient' : e.message)
    throw e
  }
}

export function makeStore(tid) {
  return {
    now: () => Date.now(),
    settings: async () => { const s = await settings(); if (s.maintenance) throw new GameError('maintenance'); return s },
    pendingSeed: () => wrap(rpc('oddxs_pending_seed', { p_tid: tid })),
    beginSeeds: () => wrap(rpc('oddxs_next_seeds', { p_tid: tid })),
    openRound: async (game, stakeCp, state, seeds) => {
      const d = await wrap(rpc('oddxs_round_open', {
        p_tid: tid, p_game: game, p_stake: stakeCp, p_state: state,
        p_server_seed: seeds.serverSeed, p_commit: seeds.commit, p_client_seed: seeds.clientSeed, p_nonce: seeds.nonce,
      }))
      return { id: d.id, balanceCp: d.balance_cp }
    },
    getRound: (id) => wrap(rpc('oddxs_round_get', { p_id: id, p_tid: tid })),
    findOpen: (game) => wrap(rpc('oddxs_round_find_open', { p_tid: tid, p_game: game })),
    setState: async (id, state) => { await wrap(rpc('oddxs_round_set_state', { p_id: id, p_tid: tid, p_state: state })) },
    settle: (id, payoutCp, mult, state) => wrap(rpc('oddxs_round_settle', { p_id: id, p_tid: tid, p_payout: payoutCp, p_mult: mult, p_state: state })),
  }
}
