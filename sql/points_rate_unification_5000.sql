-- ODDXS V32 — one conversion rate for points → USDT and withdrawals.
-- Run once in the Supabase SQL Editor after deploying this app version.
-- Canonical setting: points_per_usd. The legacy exchange_points_per_usdt key is kept
-- synchronized for compatibility with existing app versions and saved history.
-- Existing exchange transactions and withdrawal requests are NOT repriced.

begin;

insert into oddxs_settings (key, value) values
  ('points_per_usd', '5000'::jsonb),
  ('exchange_points_per_usdt', '5000'::jsonb)
on conflict (key) do nothing;

-- Set the requested rate now, then keep both setting keys synchronized on future saves.
update oddxs_settings
   set value = '5000'::jsonb, updated_at = now()
 where key in ('points_per_usd', 'exchange_points_per_usdt');

create or replace function oddxs_admin_save_settings(p_values jsonb, p_actor text)
returns jsonb language plpgsql as $$
declare
  k text;
  v jsonb;
  v_rate numeric;
begin
  p_values := coalesce(p_values, '{}'::jsonb);

  -- points_per_usd is the single source of truth. Support old clients that only send
  -- exchange_points_per_usdt, while preferring points_per_usd when both are supplied.
  if p_values ? 'points_per_usd' then
    v_rate := (p_values ->> 'points_per_usd')::numeric;
  elsif p_values ? 'exchange_points_per_usdt' then
    v_rate := (p_values ->> 'exchange_points_per_usdt')::numeric;
  end if;

  if v_rate is not null then
    if v_rate < 1 then raise exception 'invalid_points_rate'; end if;
    p_values := p_values || jsonb_build_object(
      'points_per_usd', v_rate,
      'exchange_points_per_usdt', v_rate
    );
  end if;

  for k, v in select * from jsonb_each(p_values) loop
    if exists (select 1 from oddxs_settings where key = k) then
      update oddxs_settings
         set value = v, updated_at = now()
       where key = k;
    end if;
  end loop;

  perform oddxs_audit(p_actor, 'save_settings', p_values);
  return oddxs_admin_settings();
end $$;

-- Dashboard totals must use each request's stored USD/USDT amount. amount_cp is an
-- informational points equivalent captured when the request was created; converting
-- that value using today's rate made old pending requests display two different totals.
create or replace function oddxs_admin_stats()
returns jsonb language plpgsql stable as $$
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
    'wd_pending_usd', (select coalesce(sum(usd), 0) from oddxs_withdrawals where status = 'pending'),
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

commit;

-- Optional verification:
-- select key, value from oddxs_settings
-- where key in ('points_per_usd', 'exchange_points_per_usdt') order by key;
-- select oddxs_admin_stats() ->> 'wd_pending_usd' as pending_withdrawals_usdt;
