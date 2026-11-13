-- ODDXS V6 Exchange migration for existing Supabase projects
-- Run this once in Supabase SQL Editor. Safe to run more than once.
-- ───────────────────────────── ODDXS Exchange (Points → in-app USDT) ─────────────────────────────
-- Safe to re-run on an existing installation. Conversion is atomic and never trusts a client-supplied rate.
-- Rate: 100 points = 0.05 USDT (2,000 points = 1 USDT). Withdrawal range: 0.10–0.30 USDT.
alter table oddxs_users add column if not exists usdt_balance numeric(24,8) not null default 0 check (usdt_balance >= 0);
insert into oddxs_settings (key, value) values
  ('exchange_enabled', 'false'), ('exchange_min_pts', '100'), ('exchange_max_pts', '100000'), ('exchange_points_per_usdt', '2000'),
  ('points_per_usd', '2000'), ('min_withdrawal_pts', '200'), ('max_withdrawal_pts', '600')
on conflict (key) do nothing;
-- Enforce the requested rate and withdrawal limits on existing installations.
update oddxs_settings set value = '2000'::jsonb, updated_at = now() where key in ('points_per_usd', 'exchange_points_per_usdt');
update oddxs_settings set value = '200'::jsonb, updated_at = now() where key = 'min_withdrawal_pts';
update oddxs_settings set value = '600'::jsonb, updated_at = now() where key = 'max_withdrawal_pts';
create table if not exists oddxs_exchange_transactions (
  id uuid primary key default gen_random_uuid(), telegram_id text not null,
  points bigint not null check (points > 0), usdt numeric(24,8) not null check (usdt > 0),
  rate_points_per_usdt numeric(18,6) not null check (rate_points_per_usdt > 0),
  usdt_balance_after numeric(24,8) not null, created_at timestamptz not null default now()
);
create index if not exists oddxs_exchange_user_idx on oddxs_exchange_transactions (telegram_id, created_at desc);
alter table oddxs_exchange_transactions enable row level security;
revoke all on table oddxs_exchange_transactions from public, anon, authenticated;
grant all on table oddxs_exchange_transactions to service_role;

create or replace function oddxs_exchange_points(p_tid text, p_points numeric) returns jsonb language plpgsql as $$
declare u oddxs_users; v_rate numeric; v_min numeric; v_max numeric; v_usdt numeric(24,8); v_bal jsonb; x oddxs_exchange_transactions;
begin
  if not oddxs_sb('exchange_enabled') then raise exception 'exchange_disabled'; end if;
  if oddxs_sb('maintenance_mode') then raise exception 'maintenance'; end if;
  if p_points is null or p_points <= 0 or p_points <> trunc(p_points) then raise exception 'bad_amount'; end if;
  v_min := oddxs_sn('exchange_min_pts'); v_max := oddxs_sn('exchange_max_pts'); v_rate := oddxs_sn('exchange_points_per_usdt');
  if v_rate <= 0 then raise exception 'exchange_disabled'; end if;
  if p_points < v_min then raise exception 'exchange_min:%', v_min; end if;
  if p_points > v_max then raise exception 'exchange_max:%', v_max; end if;
  select * into u from oddxs_users where telegram_id = p_tid for update;
  if not found then raise exception 'user_not_found'; end if;
  if u.is_banned then raise exception 'banned'; end if;
  v_usdt := round(p_points / v_rate, 8);
  if v_usdt <= 0 then raise exception 'bad_amount'; end if;
  v_bal := oddxs_adjust(p_tid, -(p_points::bigint * 100), 'exchange', null, format('Converted to %s USDT at %s pts/USDT', v_usdt, v_rate));
  update oddxs_users set usdt_balance = usdt_balance + v_usdt where telegram_id = p_tid returning * into u;
  insert into oddxs_exchange_transactions (telegram_id, points, usdt, rate_points_per_usdt, usdt_balance_after)
    values (p_tid, p_points::bigint, v_usdt, v_rate, u.usdt_balance) returning * into x;
  perform oddxs_audit(p_tid, 'exchange_points', jsonb_build_object('points', p_points, 'usdt', v_usdt, 'rate', v_rate, 'exchange_id', x.id));
  return jsonb_build_object('exchange', jsonb_build_object('id', x.id, 'points', x.points, 'usdt', x.usdt,
    'rate_points_per_usdt', x.rate_points_per_usdt, 'created_at', x.created_at),
    'balance_cp', (v_bal ->> 'balance_cp')::bigint, 'usdt_balance', u.usdt_balance);
end $$;

create or replace function oddxs_my_exchanges(p_tid text, p_limit int default 30) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'points', x.points, 'usdt', x.usdt,
    'rate_points_per_usdt', x.rate_points_per_usdt, 'created_at', x.created_at) order by x.created_at desc), '[]')
  from (select * from oddxs_exchange_transactions where telegram_id = p_tid order by created_at desc limit least(greatest(p_limit,1),100)) x
$$;

-- Keep player-identified RPCs private; only the trusted app server may invoke them.
revoke all on function oddxs_exchange_points(text, numeric) from public, anon, authenticated;
revoke all on function oddxs_my_exchanges(text, integer) from public, anon, authenticated;
grant execute on function oddxs_exchange_points(text, numeric) to service_role;
grant execute on function oddxs_my_exchanges(text, integer) to service_role;

-- Include USDT in the authenticated player payload.
create or replace function oddxs_user_json(p_tid text) returns jsonb language sql stable as $$
  select to_jsonb(x) from (
    select telegram_id, username, first_name, balance_cp, streak, ads_total, ads_to_chest, ads_today,
           usdt_balance, withdrawal_ads_watched, rounds_played, tasks_done, total_wagered_cp, total_won_cp, referral_count,
           is_banned, ban_reason, client_seed, nonce,
           (extract(epoch from last_ad_at) * 1000)::bigint as last_ad_at_ms,
           (extract(epoch from created_at) * 1000)::bigint as created_at_ms
      from oddxs_users where telegram_id = p_tid) x
$$;

create or replace function oddxs_public_settings() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'app_name', oddxs_st('app_name'), 'maintenance', oddxs_sb('maintenance_mode'),
    'adsgram_block', oddxs_st('adsgram_reward_block'),
    'ad_reward_pts', oddxs_sn('ad_reward_pts'), 'streak_step', oddxs_sn('streak_step'), 'streak_cap', oddxs_sn('streak_cap_mult'),
    'ad_cooldown_s', oddxs_sn('ad_cooldown_seconds'), 'chest_every', oddxs_sn('chest_every'),
    'chest_table', (select value from oddxs_settings where key = 'chest_table'),
    'min_bet_pts', oddxs_sn('min_bet_pts'), 'max_bet_pts', oddxs_sn('max_bet_pts'),
    'points_per_usd', oddxs_sn('points_per_usd'),
    'exchange_enabled', oddxs_sb('exchange_enabled'), 'exchange_min_pts', oddxs_sn('exchange_min_pts'),
    'exchange_max_pts', oddxs_sn('exchange_max_pts'), 'exchange_points_per_usdt', oddxs_sn('exchange_points_per_usdt'),
    'min_withdrawal_pts', oddxs_sn('min_withdrawal_pts'), 'max_withdrawal_pts', oddxs_sn('max_withdrawal_pts'),
    'withdrawal_ads_required', oddxs_sn('withdrawal_ads_required'), 'withdrawal_cooldown_h', oddxs_sn('withdrawal_cooldown_hours'),
    'gram_enabled', oddxs_sb('gram_enabled'), 'binance_enabled', oddxs_sb('binance_enabled'),
    'gram_label', oddxs_st('gram_label'), 'payment_note', oddxs_st('payment_note'),
    'support_username', oddxs_st('support_username'),
    'force_sub_enabled', oddxs_sb('force_sub_enabled'),
    'referral_reward_pts', oddxs_sn('referral_reward_pts'), 'referral_ads_required', oddxs_sn('referral_ads_required'), 'referral_required_tasks', oddxs_sn('referral_required_tasks'),
    'games', jsonb_build_object('crash', oddxs_sb('game_crash_enabled'), 'mines', oddxs_sb('game_mines_enabled'),
                                'dice', oddxs_sb('game_dice_enabled'), 'blackjack', oddxs_sb('game_blackjack_enabled')))
$$;


-- Expose the admin-configured conversion values to the Mini App.
create or replace function oddxs_public_settings() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'app_name', oddxs_st('app_name'), 'maintenance', oddxs_sb('maintenance_mode'),
    'adsgram_block', oddxs_st('adsgram_reward_block'),
    'ad_reward_pts', oddxs_sn('ad_reward_pts'), 'streak_step', oddxs_sn('streak_step'), 'streak_cap', oddxs_sn('streak_cap_mult'),
    'ad_cooldown_s', oddxs_sn('ad_cooldown_seconds'), 'chest_every', oddxs_sn('chest_every'),
    'chest_table', (select value from oddxs_settings where key = 'chest_table'),
    'min_bet_pts', oddxs_sn('min_bet_pts'), 'max_bet_pts', oddxs_sn('max_bet_pts'),
    'points_per_usd', oddxs_sn('points_per_usd'),
    'exchange_enabled', oddxs_sb('exchange_enabled'), 'exchange_min_pts', oddxs_sn('exchange_min_pts'),
    'exchange_max_pts', oddxs_sn('exchange_max_pts'), 'exchange_points_per_usdt', oddxs_sn('exchange_points_per_usdt'),
    'min_withdrawal_pts', oddxs_sn('min_withdrawal_pts'), 'max_withdrawal_pts', oddxs_sn('max_withdrawal_pts'),
    'withdrawal_ads_required', oddxs_sn('withdrawal_ads_required'), 'withdrawal_cooldown_h', oddxs_sn('withdrawal_cooldown_hours'),
    'gram_enabled', oddxs_sb('gram_enabled'), 'binance_enabled', oddxs_sb('binance_enabled'),
    'gram_label', oddxs_st('gram_label'), 'payment_note', oddxs_st('payment_note'),
    'support_username', oddxs_st('support_username'),
    'force_sub_enabled', oddxs_sb('force_sub_enabled'),
    'referral_reward_pts', oddxs_sn('referral_reward_pts'), 'referral_ads_required', oddxs_sn('referral_ads_required'), 'referral_required_tasks', oddxs_sn('referral_required_tasks'),
    'games', jsonb_build_object('crash', oddxs_sb('game_crash_enabled'), 'mines', oddxs_sb('game_mines_enabled'),
                                'dice', oddxs_sb('game_dice_enabled'), 'blackjack', oddxs_sb('game_blackjack_enabled')))
$$;


-- Include internal USDT balances and exchange volume in admin statistics.
create or replace function oddxs_admin_stats() returns jsonb language plpgsql stable as $$
declare out_ jsonb;
begin
  select jsonb_build_object(
    'users', (select count(*) from oddxs_users),
    'online_5m', (select count(*) from oddxs_users where last_seen_at > now() - interval '5 minutes'),
    'new_today', (select count(*) from oddxs_users where created_at >= date_trunc('day', now())),
    'active_24h', (select count(*) from oddxs_users where last_seen_at > now() - interval '24 hours'),
    'banned', (select count(*) from oddxs_users where is_banned),
    'liabilities_cp', (select coalesce(sum(balance_cp), 0) from oddxs_users),
    'usdt_balance_total', (select coalesce(sum(usdt_balance), 0) from oddxs_users),
    'exchange_count', (select count(*) from oddxs_exchange_transactions),
    'exchange_usdt_total', (select coalesce(sum(usdt), 0) from oddxs_exchange_transactions),
    'ads_total', (select coalesce(sum(ads_total), 0) from oddxs_users),
    'ads_today', (select count(*) from oddxs_ad_pulses where status = 'confirmed' and confirmed_at >= date_trunc('day', now())),
    'ad_rewards_cp', (select coalesce(sum(delta_cp), 0) from oddxs_ledger where kind in ('ad','chest','referral','welcome','task')),
    'wagered_cp', (select coalesce(sum(stake_cp), 0) from oddxs_rounds where status = 'settled'),
    'payouts_cp', (select coalesce(sum(payout_cp), 0) from oddxs_rounds where status = 'settled'),
    'open_rounds', (select count(*) from oddxs_rounds where status = 'open'),
    'wd_pending', (select count(*) from oddxs_withdrawals where status = 'pending'),
    'wd_pending_cp', (select coalesce(sum(amount_cp), 0) from oddxs_withdrawals where status = 'pending'),
    'wd_paid_cp', (select coalesce(sum(amount_cp), 0) from oddxs_withdrawals where status = 'paid'),
    'wd_paid_usd', (select coalesce(sum(usd), 0) from oddxs_withdrawals where status = 'paid'),
    'games', (select coalesce(jsonb_object_agg(game, jsonb_build_object('rounds', n, 'wagered_cp', w, 'payouts_cp', p)), '{}')
                from (select game, count(*) n, sum(stake_cp) w, sum(payout_cp) p from oddxs_rounds where status = 'settled' group by game) g),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'wagered_cp', coalesce(w, 0), 'payouts_cp', coalesce(p, 0),
                'users', coalesce(u, 0), 'ads', coalesce(a, 0)) order by d), '[]')
                from generate_series(date_trunc('day', now()) - interval '6 days', date_trunc('day', now()), interval '1 day') d
                left join (select date_trunc('day', created_at) dd, sum(stake_cp) w, sum(payout_cp) p from oddxs_rounds where status = 'settled' group by 1) r on r.dd = d
                left join (select date_trunc('day', created_at) dd, count(*) u from oddxs_users group by 1) us on us.dd = d
                left join (select date_trunc('day', confirmed_at) dd, count(*) a from oddxs_ad_pulses where status = 'confirmed' group by 1) ad on ad.dd = d)
  ) into out_;
  return out_;
end $$;

