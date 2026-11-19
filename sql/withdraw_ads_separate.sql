-- ODDXS V27 — withdrawal ads count ONLY when watched from the Wallet "watch ad" button (purpose 'withdrawal').
-- Home / task / old chest ads no longer touch the withdrawal counter. Run ONCE after withdraw_usdt_only.sql.

-- 1) Guard: the counter can only go UP inside a transaction that sets oddxs.wd_ok (our withdrawal-ad confirm). Decreases/reset are always allowed.
create or replace function oddxs_guard_wd_ads() returns trigger language plpgsql as $$
begin
  if new.withdrawal_ads_watched > old.withdrawal_ads_watched and coalesce(current_setting('oddxs.wd_ok', true), '') <> '1' then
    new.withdrawal_ads_watched := old.withdrawal_ads_watched;
  end if;
  return new;
end $$;
drop trigger if exists oddxs_guard_wd_ads_trg on oddxs_users;
create trigger oddxs_guard_wd_ads_trg before update of withdrawal_ads_watched on oddxs_users
  for each row execute function oddxs_guard_wd_ads();

-- 2) Reset the counters that were inflated by home-screen ads (e.g. 14/7)
update oddxs_users set withdrawal_ads_watched = 0;

-- 3) prepare: purposes 'reward' (home), 'exchange', 'withdrawal'
create or replace function oddxs_int_prepare(p_tid text, p_purpose text default 'reward')
returns jsonb language plpgsql as $$
declare
  u oddxs_users; v_last timestamptz; v_left numeric; v_id uuid;
  v_purpose text := case when p_purpose in ('exchange', 'withdrawal') then p_purpose else 'reward' end;
begin
  select * into u from oddxs_users where telegram_id = p_tid for update;
  if not found then raise exception 'user_not_found'; end if;
  if u.is_banned then raise exception 'banned'; end if;
  if v_purpose = 'withdrawal' and u.withdrawal_ads_watched >= oddxs_sn('withdrawal_ads_required') then raise exception 'ads_complete'; end if;

  update oddxs_adsgram_int_views set status = 'expired' where telegram_id = p_tid and status = 'pending';

  select max(claimed_at) into v_last from oddxs_adsgram_int_views
   where telegram_id = p_tid and status = 'claimed' and purpose = v_purpose;
  if v_last is not null and v_purpose <> 'exchange' then
    v_left := oddxs_sn('adsgram_int_cooldown_seconds') - extract(epoch from (clock_timestamp() - v_last));
    if v_left > 0 then raise exception 'cooldown:%', ceil(v_left)::int; end if;
  end if;

  if v_purpose = 'reward' and (select count(*) from oddxs_adsgram_int_views
       where telegram_id = p_tid and status = 'claimed' and purpose = 'reward'
         and claimed_at >= date_trunc('day', now())) >= oddxs_sn('adsgram_int_daily_cap') then
    raise exception 'daily_cap';
  end if;

  insert into oddxs_adsgram_int_views (telegram_id, purpose) values (p_tid, v_purpose) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'min_seconds', oddxs_sn('adsgram_int_min_seconds'), 'purpose', v_purpose);
end $$;

-- 4) confirm
create or replace function oddxs_int_confirm(p_tid text, p_id uuid)
returns jsonb language plpgsql as $$
declare
  u oddxs_users; e oddxs_adsgram_int_views; v_age numeric; v_reward bigint; v_bal jsonb; v_today bigint; v_wd boolean;
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
    update oddxs_adsgram_int_views set status = 'claimed', claimed_at = now(), reward_cp = 0 where id = e.id;
    update oddxs_users set exchange_ad_until = now() + interval '10 minutes' where telegram_id = p_tid;
    return jsonb_build_object('ok', true, 'pending', false, 'purpose', 'exchange', 'exchange_ready', true, 'reward_cp', 0, 'balance_cp', u.balance_cp);
  end if;

  v_wd := (e.purpose = 'withdrawal');
  if v_wd and u.withdrawal_ads_watched >= oddxs_sn('withdrawal_ads_required') then
    update oddxs_adsgram_int_views set status = 'expired' where id = e.id;
    return jsonb_build_object('ok', false, 'error', 'ads_complete');
  end if;

  v_reward := round(oddxs_sn('adsgram_int_reward_pts') * 100)::bigint;
  update oddxs_adsgram_int_views set status = 'claimed', claimed_at = now(), reward_cp = v_reward where id = e.id;
  if v_wd then perform set_config('oddxs.wd_ok', '1', true); end if;
  update oddxs_users set ads_total = ads_total + 1, withdrawal_ads_watched = withdrawal_ads_watched + (case when v_wd then 1 else 0 end)
   where telegram_id = p_tid returning * into u;
  perform set_config('oddxs.wd_ok', '', true);
  v_bal := oddxs_adjust(p_tid, v_reward, 'ad', e.id::text, 'AdsGram interstitial reward');
  perform oddxs_try_referral(p_tid);

  select count(*) into v_today from oddxs_adsgram_int_views
   where telegram_id = p_tid and status = 'claimed' and purpose = 'reward' and claimed_at >= date_trunc('day', now());
  return jsonb_build_object('ok', true, 'pending', false, 'reward_cp', v_reward,
    'balance_cp', (v_bal ->> 'balance_cp')::bigint, 'ads_total', u.ads_total,
    'withdrawal_ads_watched', u.withdrawal_ads_watched, 'int_today', v_today);
end $$;

revoke all on function oddxs_int_prepare(text, text) from public, anon, authenticated;
revoke all on function oddxs_int_confirm(text, uuid) from public, anon, authenticated;
grant execute on function oddxs_int_prepare(text, text) to service_role;
grant execute on function oddxs_int_confirm(text, uuid) to service_role;
