-- ODDXS: rewarded Interstitial (int-59439) from the Home "Watch Ad & Earn" button.
-- Run once in Supabase SQL Editor AFTER the AdsGram Task migration.
-- The server measures the watch time itself: confirm is refused before the minimum seconds have passed.

insert into oddxs_settings (key, value) values
  ('adsgram_int_reward_pts', '0.5'),
  ('adsgram_int_min_seconds', '5'),
  ('adsgram_int_cooldown_seconds', '20'),
  ('adsgram_int_daily_cap', '50')
on conflict (key) do nothing;

create table if not exists oddxs_adsgram_int_views (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null references oddxs_users(telegram_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','claimed','expired')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  reward_cp bigint
);

create index if not exists oddxs_int_views_user_idx on oddxs_adsgram_int_views (telegram_id, created_at desc);

create unique index if not exists oddxs_int_one_pending_idx
on oddxs_adsgram_int_views (telegram_id) where status = 'pending';

alter table oddxs_adsgram_int_views enable row level security;
revoke all on table oddxs_adsgram_int_views from public, anon, authenticated;
grant all on table oddxs_adsgram_int_views to service_role;

create or replace function oddxs_int_settings()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'adsgram_int_reward_pts', oddxs_sn('adsgram_int_reward_pts'),
    'adsgram_int_min_seconds', oddxs_sn('adsgram_int_min_seconds')
  )
$$;

create or replace function oddxs_int_prepare(p_tid text)
returns jsonb language plpgsql as $$
declare
  u oddxs_users;
  v_last timestamptz;
  v_left numeric;
  v_id uuid;
begin
  select * into u from oddxs_users where telegram_id = p_tid for update;
  if not found then raise exception 'user_not_found'; end if;
  if u.is_banned then raise exception 'banned'; end if;

  update oddxs_adsgram_int_views set status = 'expired'
  where telegram_id = p_tid and status = 'pending';

  select max(claimed_at) into v_last from oddxs_adsgram_int_views
  where telegram_id = p_tid and status = 'claimed';

  if v_last is not null then
    v_left := oddxs_sn('adsgram_int_cooldown_seconds') - extract(epoch from (clock_timestamp() - v_last));
    if v_left > 0 then raise exception 'cooldown:%', ceil(v_left)::int; end if;
  end if;

  if (select count(*) from oddxs_adsgram_int_views
      where telegram_id = p_tid and status = 'claimed'
      and claimed_at >= date_trunc('day', now())) >= oddxs_sn('adsgram_int_daily_cap') then
    raise exception 'daily_cap';
  end if;

  insert into oddxs_adsgram_int_views (telegram_id) values (p_tid) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'min_seconds', oddxs_sn('adsgram_int_min_seconds'));
end $$;

create or replace function oddxs_int_confirm(p_tid text, p_id uuid)
returns jsonb language plpgsql as $$
declare
  u oddxs_users;
  e oddxs_adsgram_int_views;
  v_age numeric;
  v_reward bigint;
  v_bal jsonb;
begin
  select * into u from oddxs_users where telegram_id = p_tid for update;
  if not found then raise exception 'user_not_found'; end if;
  if u.is_banned then raise exception 'banned'; end if;

  select * into e from oddxs_adsgram_int_views
  where id = p_id and telegram_id = p_tid for update;
  if not found or e.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'bad_pulse');
  end if;

  v_age := extract(epoch from (clock_timestamp() - e.created_at));
  if v_age > 900 then
    update oddxs_adsgram_int_views set status = 'expired' where id = e.id;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if v_age < oddxs_sn('adsgram_int_min_seconds') then
    return jsonb_build_object('ok', false, 'error', 'too_fast');
  end if;

  v_reward := round(oddxs_sn('adsgram_int_reward_pts') * 100)::bigint;

  update oddxs_adsgram_int_views
  set status = 'claimed', claimed_at = now(), reward_cp = v_reward where id = e.id;

  update oddxs_users
  set ads_total = ads_total + 1, withdrawal_ads_watched = withdrawal_ads_watched + 1
  where telegram_id = p_tid returning * into u;

  v_bal := oddxs_adjust(p_tid, v_reward, 'ad', e.id::text, 'AdsGram interstitial reward');
  perform oddxs_try_referral(p_tid);

  return jsonb_build_object(
    'ok', true, 'pending', false, 'reward_cp', v_reward,
    'balance_cp', (v_bal ->> 'balance_cp')::bigint,
    'ads_total', u.ads_total, 'withdrawal_ads_watched', u.withdrawal_ads_watched
  );
end $$;

revoke all on function oddxs_int_settings() from public, anon, authenticated;
revoke all on function oddxs_int_prepare(text) from public, anon, authenticated;
revoke all on function oddxs_int_confirm(text, uuid) from public, anon, authenticated;
grant execute on function oddxs_int_settings() to service_role;
grant execute on function oddxs_int_prepare(text) to service_role;
grant execute on function oddxs_int_confirm(text, uuid) to service_role;

-- ODDXS int v2: reward 1 point, daily counter 0/N, per-user status. Run once after adsgram_int_reward.sql.
update oddxs_settings set value = '1' where key = 'adsgram_int_reward_pts';
update oddxs_settings set value = '10' where key = 'adsgram_int_daily_cap';

create or replace function oddxs_int_status(p_tid text)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'adsgram_int_reward_pts', oddxs_sn('adsgram_int_reward_pts'),
    'adsgram_int_min_seconds', oddxs_sn('adsgram_int_min_seconds'),
    'adsgram_int_cap', oddxs_sn('adsgram_int_daily_cap'),
    'adsgram_int_today', (select count(*) from oddxs_adsgram_int_views
      where telegram_id = p_tid and status = 'claimed' and claimed_at >= date_trunc('day', now()))
  )
$$;

create or replace function oddxs_int_confirm(p_tid text, p_id uuid)
returns jsonb language plpgsql as $$
declare
  u oddxs_users;
  e oddxs_adsgram_int_views;
  v_age numeric;
  v_reward bigint;
  v_bal jsonb;
  v_today bigint;
begin
  select * into u from oddxs_users where telegram_id = p_tid for update;
  if not found then raise exception 'user_not_found'; end if;
  if u.is_banned then raise exception 'banned'; end if;

  select * into e from oddxs_adsgram_int_views
  where id = p_id and telegram_id = p_tid for update;
  if not found or e.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'bad_pulse');
  end if;

  v_age := extract(epoch from (clock_timestamp() - e.created_at));
  if v_age > 900 then
    update oddxs_adsgram_int_views set status = 'expired' where id = e.id;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if v_age < oddxs_sn('adsgram_int_min_seconds') then
    return jsonb_build_object('ok', false, 'error', 'too_fast');
  end if;

  v_reward := round(oddxs_sn('adsgram_int_reward_pts') * 100)::bigint;

  update oddxs_adsgram_int_views
  set status = 'claimed', claimed_at = now(), reward_cp = v_reward where id = e.id;

  update oddxs_users
  set ads_total = ads_total + 1, withdrawal_ads_watched = withdrawal_ads_watched + 1
  where telegram_id = p_tid returning * into u;

  v_bal := oddxs_adjust(p_tid, v_reward, 'ad', e.id::text, 'AdsGram interstitial reward');
  perform oddxs_try_referral(p_tid);

  select count(*) into v_today from oddxs_adsgram_int_views
  where telegram_id = p_tid and status = 'claimed' and claimed_at >= date_trunc('day', now());

  return jsonb_build_object(
    'ok', true, 'pending', false, 'reward_cp', v_reward,
    'balance_cp', (v_bal ->> 'balance_cp')::bigint,
    'ads_total', u.ads_total, 'withdrawal_ads_watched', u.withdrawal_ads_watched,
    'int_today', v_today
  );
end $$;

revoke all on function oddxs_int_status(text) from public, anon, authenticated;
revoke all on function oddxs_int_confirm(text, uuid) from public, anon, authenticated;
grant execute on function oddxs_int_status(text) to service_role;
grant execute on function oddxs_int_confirm(text, uuid) to service_role;
