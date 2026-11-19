-- ODDXS V25 — SLY-style ad gates. Run ONCE in the Supabase SQL editor, AFTER adsgram_int_reward.sql, adsgram_int_v2_upgrade.sql and exchange_migration.sql.
--  1) Withdrawal needs 7 watched ads (setting withdrawal_ads_required; editable later in the admin panel).
--  2) Every points → USDT exchange needs one freshly watched ad (setting exchange_ads_required: 1 = on, 0 = off).
--     The exchange ad is a separate "purpose": it does NOT give points, does NOT count toward the 7 withdrawal ads and the daily cap.

insert into oddxs_settings (key, value) values ('exchange_ads_required', '1') on conflict (key) do nothing;
update oddxs_settings set value = '7' where key = 'withdrawal_ads_required';

alter table oddxs_adsgram_int_views add column if not exists purpose text not null default 'reward';
alter table oddxs_users add column if not exists exchange_ad_until timestamptz;

-- prepare: now takes the purpose ('reward' | 'exchange'). Cooldown and daily cap only look at reward ads.
drop function if exists oddxs_int_prepare(text);
create or replace function oddxs_int_prepare(p_tid text, p_purpose text default 'reward')
returns jsonb language plpgsql as $$
declare
  u oddxs_users; v_last timestamptz; v_left numeric; v_id uuid;
  v_purpose text := case when p_purpose = 'exchange' then 'exchange' else 'reward' end;
begin
  select * into u from oddxs_users where telegram_id = p_tid for update;
  if not found then raise exception 'user_not_found'; end if;
  if u.is_banned then raise exception 'banned'; end if;

  update oddxs_adsgram_int_views set status = 'expired' where telegram_id = p_tid and status = 'pending';

  select max(claimed_at) into v_last from oddxs_adsgram_int_views
   where telegram_id = p_tid and status = 'claimed' and purpose = v_purpose;
  if v_last is not null then
    v_left := oddxs_sn('adsgram_int_cooldown_seconds') - extract(epoch from (clock_timestamp() - v_last));
    if v_left > 0 and v_purpose = 'reward' then raise exception 'cooldown:%', ceil(v_left)::int; end if;
  end if;

  if v_purpose = 'reward' and (select count(*) from oddxs_adsgram_int_views
       where telegram_id = p_tid and status = 'claimed' and purpose = 'reward'
         and claimed_at >= date_trunc('day', now())) >= oddxs_sn('adsgram_int_daily_cap') then
    raise exception 'daily_cap';
  end if;

  insert into oddxs_adsgram_int_views (telegram_id, purpose) values (p_tid, v_purpose) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'min_seconds', oddxs_sn('adsgram_int_min_seconds'), 'purpose', v_purpose);
end $$;

create or replace function oddxs_int_status(p_tid text)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'adsgram_int_reward_pts', oddxs_sn('adsgram_int_reward_pts'),
    'adsgram_int_min_seconds', oddxs_sn('adsgram_int_min_seconds'),
    'adsgram_int_cap', oddxs_sn('adsgram_int_daily_cap'),
    'exchange_ads_required', oddxs_sn('exchange_ads_required'),
    'adsgram_int_today', (select count(*) from oddxs_adsgram_int_views
      where telegram_id = p_tid and status = 'claimed' and purpose = 'reward' and claimed_at >= date_trunc('day', now()))
  )
$$;

create or replace function oddxs_int_confirm(p_tid text, p_id uuid)
returns jsonb language plpgsql as $$
declare
  u oddxs_users; e oddxs_adsgram_int_views; v_age numeric; v_reward bigint; v_bal jsonb; v_today bigint;
begin
  select * into u from oddxs_users where telegram_id = p_tid for update;
  if not found then raise exception 'user_not_found'; end if;
  if u.is_banned then raise exception 'banned'; end if;

  select * into e from oddxs_adsgram_int_views where id = p_id and telegram_id = p_tid for update;
  if not found or e.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'bad_pulse'); end if;

  v_age := extract(epoch from (clock_timestamp() - e.created_at));
  if v_age > 900 then
    update oddxs_adsgram_int_views set status = 'expired' where id = e.id;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if v_age < oddxs_sn('adsgram_int_min_seconds') then return jsonb_build_object('ok', false, 'error', 'too_fast'); end if;

  if e.purpose = 'exchange' then
    -- exchange ticket: valid 10 minutes, consumed by oddxs_exchange_points
    update oddxs_adsgram_int_views set status = 'claimed', claimed_at = now(), reward_cp = 0 where id = e.id;
    update oddxs_users set exchange_ad_until = now() + interval '10 minutes' where telegram_id = p_tid;
    return jsonb_build_object('ok', true, 'pending', false, 'purpose', 'exchange', 'exchange_ready', true, 'reward_cp', 0, 'balance_cp', u.balance_cp);
  end if;

  v_reward := round(oddxs_sn('adsgram_int_reward_pts') * 100)::bigint;
  update oddxs_adsgram_int_views set status = 'claimed', claimed_at = now(), reward_cp = v_reward where id = e.id;
  update oddxs_users set ads_total = ads_total + 1, withdrawal_ads_watched = withdrawal_ads_watched + 1
   where telegram_id = p_tid returning * into u;
  v_bal := oddxs_adjust(p_tid, v_reward, 'ad', e.id::text, 'AdsGram interstitial reward');
  perform oddxs_try_referral(p_tid);

  select count(*) into v_today from oddxs_adsgram_int_views
   where telegram_id = p_tid and status = 'claimed' and purpose = 'reward' and claimed_at >= date_trunc('day', now());
  return jsonb_build_object('ok', true, 'pending', false, 'reward_cp', v_reward,
    'balance_cp', (v_bal ->> 'balance_cp')::bigint, 'ads_total', u.ads_total,
    'withdrawal_ads_watched', u.withdrawal_ads_watched, 'int_today', v_today);
end $$;

-- exchange: needs a fresh exchange ad (when exchange_ads_required > 0); the ticket is consumed by a successful exchange.
create or replace function oddxs_exchange_points(p_tid text, p_points numeric) returns jsonb language plpgsql as $$
declare u oddxs_users; v_rate numeric; v_min numeric; v_max numeric; v_usdt numeric(24,8); v_bal jsonb; x oddxs_exchange_transactions;
begin
  if not oddxs_sb('exchange_enabled') then raise exception 'exchange_disabled'; end if;
  if oddxs_sb('maintenance_mode') then raise exception 'maintenance'; end if;
  if p_points is null or p_points <= 0 or p_points <> trunc(p_points) then raise exception 'bad_amount'; end if;
  v_min := oddxs_sn('exchange_min_pts'); v_max := oddxs_sn('exchange_max_pts'); v_rate := oddxs_sn('points_per_usd');
  if v_rate <= 0 then raise exception 'exchange_disabled'; end if;
  if p_points < v_min then raise exception 'exchange_min:%', v_min; end if;
  if p_points > v_max then raise exception 'exchange_max:%', v_max; end if;
  select * into u from oddxs_users where telegram_id = p_tid for update;
  if not found then raise exception 'user_not_found'; end if;
  if u.is_banned then raise exception 'banned'; end if;
  if oddxs_sn('exchange_ads_required') > 0 and (u.exchange_ad_until is null or u.exchange_ad_until < now()) then
    raise exception 'need_exchange_ad'; end if;
  v_usdt := round(p_points / v_rate, 8);
  if v_usdt <= 0 then raise exception 'bad_amount'; end if;
  v_bal := oddxs_adjust(p_tid, -(p_points::bigint * 100), 'exchange', null, format('Converted to %s USDT at %s pts/USDT', v_usdt, v_rate));
  update oddxs_users set usdt_balance = usdt_balance + v_usdt, exchange_ad_until = null where telegram_id = p_tid returning * into u;
  insert into oddxs_exchange_transactions (telegram_id, points, usdt, rate_points_per_usdt, usdt_balance_after)
    values (p_tid, p_points::bigint, v_usdt, v_rate, u.usdt_balance) returning * into x;
  perform oddxs_audit(p_tid, 'exchange_points', jsonb_build_object('points', p_points, 'usdt', v_usdt, 'rate', v_rate, 'exchange_id', x.id));
  return jsonb_build_object('exchange', jsonb_build_object('id', x.id, 'points', x.points, 'usdt', x.usdt,
    'rate_points_per_usdt', x.rate_points_per_usdt, 'created_at', x.created_at),
    'balance_cp', (v_bal ->> 'balance_cp')::bigint, 'usdt_balance', u.usdt_balance);
end $$;

revoke all on function oddxs_int_prepare(text, text) from public, anon, authenticated;
revoke all on function oddxs_int_status(text) from public, anon, authenticated;
revoke all on function oddxs_int_confirm(text, uuid) from public, anon, authenticated;
revoke all on function oddxs_exchange_points(text, numeric) from public, anon, authenticated;
grant execute on function oddxs_int_prepare(text, text) to service_role;
grant execute on function oddxs_int_status(text) to service_role;
grant execute on function oddxs_int_confirm(text, uuid) to service_role;
grant execute on function oddxs_exchange_points(text, numeric) to service_role;
