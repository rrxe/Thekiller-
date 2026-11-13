-- ============================================================================
--  ODDXS — FULL DATABASE (new Supabase project)  ·  run ONCE in SQL Editor
--  Safe to re-run: everything is "if not exists" / "create or replace".
--  All balances are stored as integer centi-points (1 point = 100 cp).
--  The server uses the SERVICE ROLE key; RLS is enabled with no policies so the
--  public (anon) key can never read or write anything.
-- ============================================================================
create extension if not exists pgcrypto;

-- ───────────────────────────── settings ─────────────────────────────
create table if not exists oddxs_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into oddxs_settings (key, value) values
  ('app_name',                 '"ODDXS"'),
  ('maintenance_mode',         'false'),
  ('registration_enabled',     'true'),
  ('welcome_bonus_pts',        '5'),
  -- ads / rewards
  ('adsgram_reward_block',     '""'),
  ('ad_reward_pts',            '1'),
  ('streak_step',              '0.1'),
  ('streak_cap_mult',          '1.5'),
  ('ad_cooldown_seconds',      '20'),
  ('ad_min_watch_seconds',     '5'),
  ('daily_ads_cap',            '150'),
  ('chest_every',              '10'),
  ('chest_table',              '[{"pts":1,"p":0.5},{"pts":2,"p":0.3},{"pts":3,"p":0.15},{"pts":5,"p":0.05}]'),
  ('referral_reward_pts',      '2'),
  ('referral_ads_required',    '5'),
  ('referral_required_tasks',  '0'),
  -- games
  ('game_crash_enabled',       'true'),
  ('game_mines_enabled',       'true'),
  ('game_dice_enabled',        'true'),
  ('game_blackjack_enabled',   'true'),
  ('min_bet_pts',              '5'),
  ('max_bet_pts',              '500'),
  ('max_payout_pts',           '5000'),
  -- money
  ('points_per_usd',           '2000'),
  ('exchange_enabled',         'false'),
  ('exchange_min_pts',         '100'),
  ('exchange_max_pts',         '100000'),
  ('exchange_points_per_usdt', '2000'),
  ('min_withdrawal_pts',       '200'),
  ('max_withdrawal_pts',       '600'),
  ('withdrawal_ads_required',  '3'),
  ('withdrawal_cooldown_hours','24'),
  ('gram_enabled',             'true'),
  ('binance_enabled',          'true'),
  ('gram_label',               '"Gram (TON)"'),
  ('payment_note',             '""'),
  -- misc
  ('support_username',         '""'),
  ('payment_channel',          '""'),
  ('force_sub_enabled',        'true'),
  ('welcome_text_ar',          '"أهلاً بك في ODDXS! 🎰\n\nشاهد إعلانات، اجمع نقاط، والعب Crash وMines وDice وBlackjack مجاناً. اسحب أرباحك إلى Gram أو Binance. 🚀"'),
  ('welcome_text_en',          '"Welcome to ODDXS! 🎰\n\nWatch ads, collect points and play Crash, Mines, Dice and Blackjack for free. Withdraw to Gram or Binance. 🚀"')
on conflict (key) do nothing;

create or replace function oddxs_sn(p_key text) returns numeric language sql stable as
$$ select coalesce((select (value #>> '{}')::numeric from oddxs_settings where key = p_key), 0) $$;
create or replace function oddxs_sb(p_key text) returns boolean language sql stable as
$$ select coalesce((select (value #>> '{}')::boolean from oddxs_settings where key = p_key), false) $$;
create or replace function oddxs_st(p_key text) returns text language sql stable as
$$ select coalesce((select value #>> '{}' from oddxs_settings where key = p_key), '') $$;

-- ───────────────────────────── tables ─────────────────────────────
create table if not exists oddxs_users (
  telegram_id text primary key,
  username text, first_name text, last_name text, language_code text,
  balance_cp bigint not null default 0 check (balance_cp >= 0),
  usdt_balance numeric(24,8) not null default 0 check (usdt_balance >= 0),
  streak int not null default 0,
  last_streak_day date,
  ads_total int not null default 0,
  ads_to_chest int not null default 0,
  ads_today int not null default 0,
  ads_today_date date,
  withdrawal_ads_watched int not null default 0,
  last_ad_at timestamptz,
  last_withdrawal_at timestamptz,
  total_wagered_cp bigint not null default 0,
  total_won_cp bigint not null default 0,
  rounds_played int not null default 0,
  tasks_done int not null default 0,
  client_seed text not null default encode(gen_random_bytes(8), 'hex'),
  nonce bigint not null default 0,
  pending_seed text,
  referred_by text,
  referral_paid boolean not null default false,
  referral_count int not null default 0,
  is_banned boolean not null default false,
  ban_reason text, banned_at timestamptz,
  bot_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table oddxs_users add column if not exists usdt_balance numeric(24,8) not null default 0 check (usdt_balance >= 0);
create index if not exists oddxs_users_seen_idx on oddxs_users (last_seen_at desc);
create index if not exists oddxs_users_created_idx on oddxs_users (created_at desc);
create index if not exists oddxs_users_ref_idx on oddxs_users (referred_by);

-- every balance change, forever (this is what the admin panel audits)
create table if not exists oddxs_ledger (
  id bigserial primary key,
  telegram_id text not null,
  kind text not null,            -- welcome | ad | chest | referral | task | bet | payout | withdraw | withdraw_refund | admin
  delta_cp bigint not null,
  balance_after_cp bigint not null,
  ref text, note text,
  created_at timestamptz not null default now()
);
create index if not exists oddxs_ledger_user_idx on oddxs_ledger (telegram_id, id desc);
create index if not exists oddxs_ledger_kind_idx on oddxs_ledger (kind, id desc);

create table if not exists oddxs_ad_pulses (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null,
  placement text not null default 'reward',
  status text not null default 'pending' check (status in ('pending','confirmed','expired')),
  reward_cp bigint,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists oddxs_pulses_user_idx on oddxs_ad_pulses (telegram_id, created_at desc);

create table if not exists oddxs_rounds (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null,
  game text not null check (game in ('crash','mines','dice','blackjack')),
  stake_cp bigint not null check (stake_cp > 0),
  status text not null default 'open' check (status in ('open','settled')),
  payout_cp bigint not null default 0,
  mult numeric not null default 0,
  state jsonb,
  server_seed text not null, commit text not null, client_seed text not null, nonce bigint not null,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists oddxs_rounds_user_idx on oddxs_rounds (telegram_id, created_at desc);
create index if not exists oddxs_rounds_game_idx on oddxs_rounds (game, created_at desc);
create index if not exists oddxs_rounds_open_idx on oddxs_rounds (telegram_id, game) where status = 'open';

create table if not exists oddxs_withdrawals (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null,
  amount_cp bigint not null check (amount_cp > 0),
  usd numeric(12,4) not null,
  method text not null check (method in ('gram','binance')),
  target text not null,                    -- Gram wallet address  OR  Binance ID
  status text not null default 'pending' check (status in ('pending','paid','rejected')),
  admin_note text, tx_ref text, reviewed_by text, reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists oddxs_wd_status_idx on oddxs_withdrawals (status, created_at);
create index if not exists oddxs_wd_user_idx on oddxs_withdrawals (telegram_id, created_at desc);

create table if not exists oddxs_exchange_transactions (
  id uuid primary key default gen_random_uuid(),
  telegram_id text not null,
  points bigint not null check (points > 0),
  usdt numeric(24,8) not null check (usdt > 0),
  rate_points_per_usdt numeric(18,6) not null check (rate_points_per_usdt > 0),
  usdt_balance_after numeric(24,8) not null,
  created_at timestamptz not null default now()
);
create index if not exists oddxs_exchange_user_idx on oddxs_exchange_transactions (telegram_id, created_at desc);

create table if not exists oddxs_admins (
  telegram_id text primary key,
  username text, first_name text,
  role text not null default 'moderator' check (role in ('owner','moderator')),
  permissions jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists oddxs_audit_logs (
  id bigserial primary key,
  actor text, action text not null, details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists oddxs_audit_idx on oddxs_audit_logs (id desc);

do $$ declare t text; begin
  foreach t in array array['oddxs_settings','oddxs_users','oddxs_ledger','oddxs_ad_pulses','oddxs_rounds','oddxs_withdrawals','oddxs_exchange_transactions','oddxs_admins','oddxs_audit_logs']
  loop execute format('alter table %I enable row level security', t); end loop;
end $$;

-- ───────────────────────────── core money ─────────────────────────────
-- the ONLY place balances change (atomic: row update + ledger line)
create or replace function oddxs_adjust(p_tid text, p_delta bigint, p_kind text, p_ref text default null, p_note text default null)
returns jsonb language plpgsql as $$
declare v bigint;
begin
  if p_delta = 0 then
    select balance_cp into v from oddxs_users where telegram_id = p_tid;
    return jsonb_build_object('balance_cp', v);
  end if;
  update oddxs_users set balance_cp = balance_cp + p_delta
   where telegram_id = p_tid and balance_cp + p_delta >= 0
   returning balance_cp into v;
  if not found then
    if exists (select 1 from oddxs_users where telegram_id = p_tid) then raise exception 'insufficient_balance';
    else raise exception 'user_not_found'; end if;
  end if;
  insert into oddxs_ledger (telegram_id, kind, delta_cp, balance_after_cp, ref, note)
  values (p_tid, p_kind, p_delta, v, p_ref, p_note);
  return jsonb_build_object('balance_cp', v);
end $$;

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

create or replace function oddxs_game_settings() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'minBetCp', round(oddxs_sn('min_bet_pts') * 100), 'maxBetCp', round(oddxs_sn('max_bet_pts') * 100),
    'maxPayoutCp', round(oddxs_sn('max_payout_pts') * 100),
    'enabled', jsonb_build_object('crash', oddxs_sb('game_crash_enabled'), 'mines', oddxs_sb('game_mines_enabled'),
                                  'dice', oddxs_sb('game_dice_enabled'), 'blackjack', oddxs_sb('game_blackjack_enabled')),
    'maintenance', oddxs_sb('maintenance_mode'))
$$;

-- ───────────────────────────── users ─────────────────────────────
create or replace function oddxs_upsert_user(p_tid text, p_username text, p_first text, p_last text, p_lang text, p_ref text default null)
returns jsonb language plpgsql as $$
declare v_new boolean := false; v_ref text := null; v_bonus bigint;
begin
  if not exists (select 1 from oddxs_users where telegram_id = p_tid) then
    if not oddxs_sb('registration_enabled') then raise exception 'registration_closed'; end if;
    if p_ref is not null and p_ref ~ '^\d{5,20}$' and p_ref <> p_tid
       and exists (select 1 from oddxs_users where telegram_id = p_ref) then v_ref := p_ref; end if;
    insert into oddxs_users (telegram_id, username, first_name, last_name, language_code, referred_by)
    values (p_tid, p_username, p_first, p_last, p_lang, v_ref) on conflict do nothing;
    v_new := found;
  end if;
  if v_new then
    v_bonus := round(oddxs_sn('welcome_bonus_pts') * 100);
    if v_bonus > 0 then perform oddxs_adjust(p_tid, v_bonus, 'welcome'); end if;
  else
    update oddxs_users set username = p_username, first_name = p_first, last_name = p_last,
           language_code = coalesce(p_lang, language_code), last_seen_at = now(), bot_blocked = false
     where telegram_id = p_tid;
  end if;
  return oddxs_user_json(p_tid) || jsonb_build_object('is_new', v_new);
end $$;

-- ───────────────────────────── ads / streak / chest ─────────────────────────────
-- referral: reward the inviter ONCE, after the invitee has watched N ads AND completed M tasks (both set in admin)
create or replace function oddxs_try_referral(p_tid text) returns void language plpgsql as $$
declare u oddxs_users;
begin
  select * into u from oddxs_users where telegram_id = p_tid for update;
  if not found or u.referred_by is null or u.referral_paid then return; end if;
  if u.ads_total < oddxs_sn('referral_ads_required') or u.tasks_done < oddxs_sn('referral_required_tasks') then return; end if;
  update oddxs_users set referral_paid = true where telegram_id = p_tid;
  if exists (select 1 from oddxs_users where telegram_id = u.referred_by and not is_banned) then
    perform oddxs_adjust(u.referred_by, round(oddxs_sn('referral_reward_pts') * 100)::bigint, 'referral', p_tid);
    update oddxs_users set referral_count = referral_count + 1 where telegram_id = u.referred_by;
  end if;
end $$;

create or replace function oddxs_ad_prepare(p_tid text, p_placement text default 'reward')
returns jsonb language plpgsql as $$
declare u oddxs_users; v_left numeric; v_id uuid; v_today date := (now() at time zone 'utc')::date;
begin
  select * into u from oddxs_users where telegram_id = p_tid for update;
  if not found then raise exception 'user_not_found'; end if;
  if u.is_banned then raise exception 'banned'; end if;
  if oddxs_sb('maintenance_mode') then raise exception 'maintenance'; end if;
  if u.last_ad_at is not null then
    v_left := oddxs_sn('ad_cooldown_seconds') - extract(epoch from (clock_timestamp() - u.last_ad_at));
    if v_left > 0 then raise exception 'cooldown:%', ceil(v_left * 1000)::int; end if;
  end if;
  if coalesce(u.ads_today_date, v_today) = v_today and u.ads_today >= oddxs_sn('daily_ads_cap') then raise exception 'daily_cap'; end if;
  update oddxs_ad_pulses set status = 'expired' where telegram_id = p_tid and status = 'pending';
  insert into oddxs_ad_pulses (telegram_id, placement) values (p_tid, p_placement) returning id into v_id;
  return jsonb_build_object('pulse_id', v_id);
end $$;

create or replace function oddxs_ad_confirm(p_tid text, p_pulse uuid)
returns jsonb language plpgsql as $$
declare u oddxs_users; p oddxs_ad_pulses; v_today date := (now() at time zone 'utc')::date;
        v_streak int; v_mult numeric; v_reward bigint; v_bal jsonb; v_chest_ready boolean; v_age numeric;
begin
  select * into u from oddxs_users where telegram_id = p_tid for update;
  if not found then raise exception 'user_not_found'; end if;
  if u.is_banned then raise exception 'banned'; end if;
  select * into p from oddxs_ad_pulses where id = p_pulse and telegram_id = p_tid for update;
  if not found or p.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'bad_pulse'); end if;
  v_age := extract(epoch from (clock_timestamp() - p.created_at));
  if v_age < oddxs_sn('ad_min_watch_seconds') then return jsonb_build_object('ok', false, 'error', 'too_fast'); end if;
  if v_age > 900 then update oddxs_ad_pulses set status = 'expired' where id = p.id; return jsonb_build_object('ok', false, 'error', 'expired'); end if;

  if u.last_streak_day = v_today then v_streak := greatest(u.streak, 1);
  elsif u.last_streak_day = v_today - 1 then v_streak := u.streak + 1;
  else v_streak := 1; end if;
  v_mult := least(oddxs_sn('streak_cap_mult'), 1 + oddxs_sn('streak_step') * (v_streak - 1));
  v_reward := round(oddxs_sn('ad_reward_pts') * 100 * v_mult);

  update oddxs_users set
      streak = v_streak, last_streak_day = v_today, ads_total = ads_total + 1,
      ads_to_chest = ads_to_chest + 1, withdrawal_ads_watched = withdrawal_ads_watched + 1,
      ads_today = case when ads_today_date = v_today then ads_today + 1 else 1 end, ads_today_date = v_today,
      last_ad_at = clock_timestamp()
   where telegram_id = p_tid returning * into u;
  update oddxs_ad_pulses set status = 'confirmed', confirmed_at = clock_timestamp(), reward_cp = v_reward where id = p.id;
  v_bal := oddxs_adjust(p_tid, v_reward, 'ad', p.id::text);

  perform oddxs_try_referral(p_tid);

  v_chest_ready := u.ads_to_chest >= oddxs_sn('chest_every');
  return jsonb_build_object('ok', true, 'reward_cp', v_reward, 'streak', v_streak, 'mult', v_mult,
    'ads_to_chest', u.ads_to_chest, 'chest_ready', v_chest_ready, 'withdrawal_ads_watched', u.withdrawal_ads_watched,
    'balance_cp', (v_bal ->> 'balance_cp')::bigint);
end $$;

create or replace function oddxs_open_chest(p_tid text) returns jsonb language plpgsql as $$
declare u oddxs_users; r numeric := random(); row_ jsonb; v_pts numeric := 1; v_bal jsonb;
begin
  select * into u from oddxs_users where telegram_id = p_tid for update;
  if not found then raise exception 'user_not_found'; end if;
  if u.is_banned then raise exception 'banned'; end if;
  if u.ads_to_chest < oddxs_sn('chest_every') then raise exception 'chest_not_ready'; end if;
  for row_ in select * from jsonb_array_elements((select value from oddxs_settings where key = 'chest_table')) loop
    v_pts := (row_ ->> 'pts')::numeric;
    if r < (row_ ->> 'p')::numeric then exit; end if;
    r := r - (row_ ->> 'p')::numeric;
  end loop;
  update oddxs_users set ads_to_chest = ads_to_chest - oddxs_sn('chest_every')::int where telegram_id = p_tid;
  v_bal := oddxs_adjust(p_tid, round(v_pts * 100)::bigint, 'chest');
  return jsonb_build_object('pts', v_pts, 'balance_cp', (v_bal ->> 'balance_cp')::bigint,
                            'ads_to_chest', u.ads_to_chest - oddxs_sn('chest_every')::int);
end $$;

-- ───────────────────────────── withdrawals ─────────────────────────────
create or replace function oddxs_create_withdrawal(p_tid text, p_points numeric, p_method text, p_target text)
returns jsonb language plpgsql as $$
declare u oddxs_users; v_cp bigint; v_target text := btrim(p_target); w oddxs_withdrawals; v_bal jsonb;
begin
  select * into u from oddxs_users where telegram_id = p_tid for update;
  if not found then raise exception 'user_not_found'; end if;
  if u.is_banned then raise exception 'banned'; end if;
  if oddxs_sb('maintenance_mode') then raise exception 'maintenance'; end if;
  if p_method not in ('gram','binance') then raise exception 'bad_method'; end if;
  if p_method = 'gram' and not oddxs_sb('gram_enabled') then raise exception 'method_disabled'; end if;
  if p_method = 'binance' and not oddxs_sb('binance_enabled') then raise exception 'method_disabled'; end if;
  if p_method = 'gram' and not (v_target ~ '^(EQ|UQ|kQ|0Q)[A-Za-z0-9_-]{46}$' or v_target ~ '^-?[0-9]:[0-9a-fA-F]{64}$') then raise exception 'bad_gram_address'; end if;
  if p_method = 'binance' and not (v_target ~ '^[0-9]{6,15}$') then raise exception 'bad_binance_id'; end if;
  if p_points is null or p_points <> trunc(p_points) then raise exception 'bad_amount'; end if;
  if p_points < oddxs_sn('min_withdrawal_pts') then raise exception 'withdraw_min:%', oddxs_sn('min_withdrawal_pts'); end if;
  if p_points > oddxs_sn('max_withdrawal_pts') then raise exception 'withdraw_max:%', oddxs_sn('max_withdrawal_pts'); end if;
  v_cp := (p_points * 100)::bigint;
  if u.balance_cp < v_cp then raise exception 'insufficient_balance'; end if;
  if exists (select 1 from oddxs_withdrawals where telegram_id = p_tid and status = 'pending') then raise exception 'pending_exists'; end if;
  if u.withdrawal_ads_watched < oddxs_sn('withdrawal_ads_required') then
    raise exception 'need_ads:%', (oddxs_sn('withdrawal_ads_required') - u.withdrawal_ads_watched)::int; end if;
  if u.last_withdrawal_at is not null and u.last_withdrawal_at > now() - make_interval(hours => oddxs_sn('withdrawal_cooldown_hours')::int) then
    raise exception 'withdraw_cooldown'; end if;

  insert into oddxs_withdrawals (telegram_id, amount_cp, usd, method, target)
  values (p_tid, v_cp, round(p_points / oddxs_sn('points_per_usd'), 4), p_method, v_target) returning * into w;
  v_bal := oddxs_adjust(p_tid, -v_cp, 'withdraw', w.id::text);
  update oddxs_users set withdrawal_ads_watched = 0, last_withdrawal_at = now() where telegram_id = p_tid;
  return to_jsonb(w) || jsonb_build_object('balance_cp', (v_bal ->> 'balance_cp')::bigint);
end $$;

create or replace function oddxs_my_withdrawals(p_tid text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]') from (
    select id, amount_cp, usd, method, target, status, admin_note, tx_ref, created_at
      from oddxs_withdrawals where telegram_id = p_tid order by created_at desc limit 20) x
$$;

create or replace function oddxs_review_withdrawal(p_id uuid, p_action text, p_admin text, p_note text default null, p_tx text default null)
returns jsonb language plpgsql as $$
declare w oddxs_withdrawals;
begin
  select * into w from oddxs_withdrawals where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if w.status <> 'pending' then raise exception 'already_reviewed'; end if;
  if p_action = 'approve' then
    update oddxs_withdrawals set status = 'paid', admin_note = p_note, tx_ref = p_tx, reviewed_by = p_admin, reviewed_at = now() where id = p_id returning * into w;
  elsif p_action = 'reject' then
    update oddxs_withdrawals set status = 'rejected', admin_note = p_note, reviewed_by = p_admin, reviewed_at = now() where id = p_id returning * into w;
    perform oddxs_adjust(w.telegram_id, w.amount_cp, 'withdraw_refund', w.id::text, p_note);
    update oddxs_users set last_withdrawal_at = null where telegram_id = w.telegram_id;  -- a rejected request does not start the cooldown
  else raise exception 'bad_action'; end if;
  insert into oddxs_audit_logs (actor, action, details) values (p_admin, 'withdrawal_' || p_action, jsonb_build_object('id', p_id, 'user', w.telegram_id, 'cp', w.amount_cp, 'method', w.method, 'tx', p_tx, 'note', p_note));
  return to_jsonb(w) || jsonb_build_object('username', (select username from oddxs_users where telegram_id = w.telegram_id));
end $$;

-- ───────────────────────────── game rounds (used by GameService) ─────────────────────────────
create or replace function oddxs_pending_seed(p_tid text) returns text language plpgsql as $$
declare v text;
begin
  select pending_seed into v from oddxs_users where telegram_id = p_tid for update;
  if v is null then v := encode(gen_random_bytes(32), 'hex'); update oddxs_users set pending_seed = v where telegram_id = p_tid; end if;
  return v;
end $$;

create or replace function oddxs_next_seeds(p_tid text) returns jsonb language plpgsql as $$
declare u oddxs_users; v_cur text; v_next text := encode(gen_random_bytes(32), 'hex');
begin
  select * into u from oddxs_users where telegram_id = p_tid for update;
  if not found then raise exception 'user_not_found'; end if;
  v_cur := coalesce(u.pending_seed, encode(gen_random_bytes(32), 'hex'));
  update oddxs_users set pending_seed = v_next, nonce = nonce + 1 where telegram_id = p_tid;
  return jsonb_build_object('serverSeed', v_cur, 'nextServerSeed', v_next, 'clientSeed', u.client_seed, 'nonce', u.nonce + 1);
end $$;

create or replace function oddxs_round_open(p_tid text, p_game text, p_stake bigint, p_state jsonb, p_server_seed text, p_commit text, p_client_seed text, p_nonce bigint)
returns jsonb language plpgsql as $$
declare u oddxs_users; v_id uuid; v_bal jsonb;
begin
  select * into u from oddxs_users where telegram_id = p_tid for update;
  if not found then raise exception 'user_not_found'; end if;
  if u.is_banned then raise exception 'banned'; end if;
  if oddxs_sb('maintenance_mode') then raise exception 'maintenance'; end if;
  insert into oddxs_rounds (telegram_id, game, stake_cp, state, server_seed, commit, client_seed, nonce)
  values (p_tid, p_game, p_stake, p_state, p_server_seed, p_commit, p_client_seed, p_nonce) returning id into v_id;
  v_bal := oddxs_adjust(p_tid, -p_stake, 'bet', v_id::text, p_game);
  update oddxs_users set total_wagered_cp = total_wagered_cp + p_stake, rounds_played = rounds_played + 1 where telegram_id = p_tid;
  return jsonb_build_object('id', v_id, 'balance_cp', (v_bal ->> 'balance_cp')::bigint);
end $$;

create or replace function oddxs_round_json(r oddxs_rounds) returns jsonb language sql immutable as $$
  select jsonb_build_object('id', r.id, 'game', r.game, 'stakeCp', r.stake_cp, 'status', r.status, 'state', r.state,
    'serverSeed', r.server_seed, 'commit', r.commit, 'clientSeed', r.client_seed, 'nonce', r.nonce,
    'payoutCp', r.payout_cp, 'mult', r.mult)
$$;
create or replace function oddxs_round_get(p_id uuid, p_tid text) returns jsonb language plpgsql stable as $$
declare r oddxs_rounds;
begin
  select * into r from oddxs_rounds where id = p_id and telegram_id = p_tid;
  if not found then return null; end if;
  return oddxs_round_json(r);
end $$;
create or replace function oddxs_round_find_open(p_tid text, p_game text) returns jsonb language plpgsql stable as $$
declare r oddxs_rounds;
begin
  select * into r from oddxs_rounds where telegram_id = p_tid and game = p_game and status = 'open' order by created_at desc limit 1;
  if not found then return null; end if;
  return oddxs_round_json(r);
end $$;
create or replace function oddxs_round_set_state(p_id uuid, p_tid text, p_state jsonb) returns jsonb language plpgsql as $$
begin
  update oddxs_rounds set state = p_state where id = p_id and telegram_id = p_tid and status = 'open';
  return jsonb_build_object('ok', found);
end $$;

create or replace function oddxs_round_settle(p_id uuid, p_tid text, p_payout bigint, p_mult numeric, p_state jsonb)
returns jsonb language plpgsql as $$
declare r oddxs_rounds; v_bal bigint;
begin
  select * into r from oddxs_rounds where id = p_id and telegram_id = p_tid for update;
  if not found then raise exception 'not_found'; end if;
  if r.status = 'settled' then
    select balance_cp into v_bal from oddxs_users where telegram_id = p_tid;
    return jsonb_build_object('settled', false, 'payoutCp', r.payout_cp, 'mult', r.mult, 'balanceCp', v_bal);
  end if;
  update oddxs_rounds set status = 'settled', payout_cp = p_payout, mult = p_mult, state = p_state, settled_at = now() where id = p_id;
  if p_payout > 0 then
    v_bal := (oddxs_adjust(p_tid, p_payout, 'payout', p_id::text, r.game) ->> 'balance_cp')::bigint;
    update oddxs_users set total_won_cp = total_won_cp + p_payout where telegram_id = p_tid;
  else select balance_cp into v_bal from oddxs_users where telegram_id = p_tid; end if;
  return jsonb_build_object('settled', true, 'payoutCp', p_payout, 'mult', p_mult, 'balanceCp', v_bal);
end $$;

create or replace function oddxs_my_history(p_tid text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.ts desc), '[]') from (
    select id, game, stake_cp as "betCp", payout_cp as "payoutCp", mult, (extract(epoch from created_at) * 1000)::bigint as ts
      from oddxs_rounds where telegram_id = p_tid and status = 'settled' order by created_at desc limit 20) x
$$;

-- ───────────────────────────── admin ─────────────────────────────
create or replace function oddxs_audit(p_actor text, p_action text, p_details jsonb default null) returns void language sql as $$
  insert into oddxs_audit_logs (actor, action, details) values (p_actor, p_action, p_details)
$$;

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

create or replace function oddxs_admin_users(p_q text default '', p_limit int default 30, p_offset int default 0, p_sort text default 'new')
returns jsonb language plpgsql stable as $$
declare v_q text := btrim(coalesce(p_q, ''));
begin
  return jsonb_build_object(
    'total', (select count(*) from oddxs_users where v_q = '' or telegram_id = v_q or username ilike '%' || v_q || '%' or first_name ilike '%' || v_q || '%'),
    'rows', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (
      select telegram_id, username, first_name, balance_cp, streak, ads_total, rounds_played, total_wagered_cp, total_won_cp,
             referral_count, referred_by, is_banned, ban_reason, created_at, last_seen_at
        from oddxs_users where v_q = '' or telegram_id = v_q or username ilike '%' || v_q || '%' or first_name ilike '%' || v_q || '%'
       order by case when p_sort = 'balance' then balance_cp end desc nulls last,
                case when p_sort = 'wagered' then total_wagered_cp end desc nulls last,
                case when p_sort = 'seen' then extract(epoch from last_seen_at) end desc nulls last, created_at desc
       limit least(p_limit, 100) offset p_offset) x));
end $$;

create or replace function oddxs_admin_user_detail(p_tid text) returns jsonb language plpgsql stable as $$
begin
  return jsonb_build_object(
    'user', (select to_jsonb(u) - 'pending_seed' - 'client_seed' from oddxs_users u where telegram_id = p_tid),
    'ledger', (select coalesce(jsonb_agg(to_jsonb(l)), '[]') from (select * from oddxs_ledger where telegram_id = p_tid order by id desc limit 40) l),
    'rounds', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from (select id, game, stake_cp, payout_cp, mult, status, created_at from oddxs_rounds where telegram_id = p_tid order by created_at desc limit 30) r),
    'withdrawals', (select coalesce(jsonb_agg(to_jsonb(w)), '[]') from (select * from oddxs_withdrawals where telegram_id = p_tid order by created_at desc limit 20) w),
    'referrals', (select coalesce(jsonb_agg(to_jsonb(f)), '[]') from (select telegram_id, username, first_name, ads_total, referral_paid from oddxs_users where referred_by = p_tid order by created_at desc limit 20) f));
end $$;

create or replace function oddxs_admin_rounds(p_game text default null, p_tid text default null, p_status text default null, p_limit int default 40, p_offset int default 0)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'total', (select count(*) from oddxs_rounds where (p_game is null or game = p_game) and (p_tid is null or telegram_id = p_tid) and (p_status is null or status = p_status)),
    'rows', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (
      select r.id, r.telegram_id, u.username, u.first_name, r.game, r.stake_cp, r.payout_cp, r.mult, r.status, r.commit, r.nonce, r.created_at, r.settled_at,
             case when r.status = 'settled' then r.server_seed end as server_seed, r.client_seed
        from oddxs_rounds r left join oddxs_users u on u.telegram_id = r.telegram_id
       where (p_game is null or r.game = p_game) and (p_tid is null or r.telegram_id = p_tid) and (p_status is null or r.status = p_status)
       order by r.created_at desc limit least(p_limit, 100) offset p_offset) x))
$$;

create or replace function oddxs_admin_ledger(p_tid text default null, p_kind text default null, p_limit int default 50, p_offset int default 0)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'total', (select count(*) from oddxs_ledger where (p_tid is null or telegram_id = p_tid) and (p_kind is null or kind = p_kind)),
    'rows', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (
      select l.*, u.username, u.first_name from oddxs_ledger l left join oddxs_users u on u.telegram_id = l.telegram_id
       where (p_tid is null or l.telegram_id = p_tid) and (p_kind is null or l.kind = p_kind)
       order by l.id desc limit least(p_limit, 100) offset p_offset) x))
$$;

create or replace function oddxs_admin_withdrawals(p_status text default null, p_limit int default 50, p_offset int default 0)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'total', (select count(*) from oddxs_withdrawals where p_status is null or status = p_status),
    'rows', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (
      select w.*, u.username, u.first_name, u.balance_cp, u.total_wagered_cp, u.total_won_cp, u.ads_total, u.rounds_played, u.created_at as user_created_at
        from oddxs_withdrawals w left join oddxs_users u on u.telegram_id = w.telegram_id
       where p_status is null or w.status = p_status
       order by case when w.status = 'pending' then 0 else 1 end, case when w.status = 'pending' then w.created_at end asc, w.created_at desc
       limit least(p_limit, 100) offset p_offset) x))
$$;

create or replace function oddxs_admin_audit(p_limit int default 50, p_offset int default 0) returns jsonb language sql stable as $$
  select jsonb_build_object('total', (select count(*) from oddxs_audit_logs),
    'rows', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select * from oddxs_audit_logs order by id desc limit least(p_limit, 100) offset p_offset) x))
$$;

create or replace function oddxs_admin_settings() returns jsonb language sql stable as $$
  select coalesce(jsonb_object_agg(key, value), '{}') from oddxs_settings
$$;

create or replace function oddxs_admin_save_settings(p_values jsonb, p_actor text) returns jsonb language plpgsql as $$
declare k text; v jsonb;
begin
  for k, v in select * from jsonb_each(p_values) loop
    if exists (select 1 from oddxs_settings where key = k) then
      update oddxs_settings set value = v, updated_at = now() where key = k;
    end if;
  end loop;
  perform oddxs_audit(p_actor, 'save_settings', p_values);
  return oddxs_admin_settings();
end $$;

create or replace function oddxs_admin_ban(p_tid text, p_banned boolean, p_reason text, p_actor text) returns jsonb language plpgsql as $$
begin
  update oddxs_users set is_banned = p_banned, ban_reason = case when p_banned then p_reason end, banned_at = case when p_banned then now() end where telegram_id = p_tid;
  if not found then raise exception 'user_not_found'; end if;
  perform oddxs_audit(p_actor, case when p_banned then 'ban_user' else 'unban_user' end, jsonb_build_object('user', p_tid, 'reason', p_reason));
  return jsonb_build_object('ok', true);
end $$;

create or replace function oddxs_admin_adjust(p_tid text, p_delta_cp bigint, p_note text, p_actor text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  v := oddxs_adjust(p_tid, p_delta_cp, 'admin', p_actor, p_note);
  perform oddxs_audit(p_actor, 'adjust_balance', jsonb_build_object('user', p_tid, 'delta_cp', p_delta_cp, 'note', p_note));
  return v;
end $$;

create or replace function oddxs_admin_list_admins() returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(a) order by created_at), '[]') from oddxs_admins a
$$;
create or replace function oddxs_admin_get(p_tid text) returns jsonb language sql stable as $$
  select to_jsonb(a) from oddxs_admins a where telegram_id = p_tid
$$;
create or replace function oddxs_admin_save_admin(p_tid text, p_perms jsonb, p_actor text) returns jsonb language plpgsql as $$
declare r oddxs_admins;
begin
  insert into oddxs_admins (telegram_id, username, first_name, role, permissions)
  select p_tid, u.username, u.first_name, 'moderator', p_perms from (select 1) d left join oddxs_users u on u.telegram_id = p_tid
  on conflict (telegram_id) do update set permissions = excluded.permissions, updated_at = now() returning * into r;
  perform oddxs_audit(p_actor, 'save_moderator', jsonb_build_object('user', p_tid, 'permissions', p_perms));
  return to_jsonb(r);
end $$;
create or replace function oddxs_admin_delete_admin(p_tid text, p_actor text) returns jsonb language plpgsql as $$
begin
  delete from oddxs_admins where telegram_id = p_tid and role = 'moderator';
  perform oddxs_audit(p_actor, 'delete_moderator', jsonb_build_object('user', p_tid));
  return jsonb_build_object('ok', true);
end $$;

create or replace function oddxs_broadcast_ids(p_after text default '0', p_limit int default 500) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(telegram_id), '[]') from (select telegram_id from oddxs_users where telegram_id > p_after and not bot_blocked order by telegram_id limit p_limit) x
$$;
create or replace function oddxs_mark_blocked(p_tid text) returns void language sql as $$
  update oddxs_users set bot_blocked = true where telegram_id = p_tid
$$;

-- ───────────────────────────── tasks (join channel / open link) ─────────────────────────────
-- type 'channel': the server verifies membership with Telegram getChatMember (bot must be admin of the channel).
-- type 'link'   : cannot be verified by Telegram; the user must wait `wait_seconds` after opening it (honour system).
alter table oddxs_users add column if not exists tasks_done int not null default 0;
create table if not exists oddxs_tasks (
  id uuid primary key default gen_random_uuid(),
  title_en text not null, title_ar text not null default '',
  type text not null default 'link' check (type in ('channel','link')),
  url text not null default '',
  chat_id text,                              -- @channel_username or -100… (type 'channel')
  reward_cp bigint not null default 100 check (reward_cp >= 0),
  wait_seconds int not null default 10,
  max_completions int,                       -- null = unlimited
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists oddxs_task_progress (
  task_id uuid not null references oddxs_tasks(id) on delete cascade,
  telegram_id text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (task_id, telegram_id)
);
create index if not exists oddxs_task_prog_user_idx on oddxs_task_progress (telegram_id);
alter table oddxs_tasks enable row level security;
alter table oddxs_task_progress enable row level security;

create or replace function oddxs_tasks_list(p_tid text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title_en', t.title_en, 'title_ar', t.title_ar, 'type', t.type, 'url', t.url,
           'reward_cp', t.reward_cp, 'wait_seconds', t.wait_seconds,
           'done', coalesce(p.completed_at is not null, false),
           'started_at_ms', (extract(epoch from p.started_at) * 1000)::bigint) order by t.sort, t.created_at), '[]')
    from oddxs_tasks t left join oddxs_task_progress p on p.task_id = t.id and p.telegram_id = p_tid
   where t.is_active
     and (t.max_completions is null or p.completed_at is not null
          or (select count(*) from oddxs_task_progress c where c.task_id = t.id and c.completed_at is not null) < t.max_completions)
$$;

create or replace function oddxs_task_get(p_id uuid) returns jsonb language sql stable as $$
  select to_jsonb(t) from oddxs_tasks t where id = p_id
$$;

create or replace function oddxs_task_start(p_tid text, p_id uuid) returns jsonb language plpgsql as $$
begin
  if not exists (select 1 from oddxs_users where telegram_id = p_tid and not is_banned) then raise exception 'user_not_found'; end if;
  if not exists (select 1 from oddxs_tasks where id = p_id and is_active) then raise exception 'task_not_found'; end if;
  insert into oddxs_task_progress (task_id, telegram_id) values (p_id, p_tid) on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

create or replace function oddxs_task_complete(p_tid text, p_id uuid, p_verified boolean default false)
returns jsonb language plpgsql as $$
declare u oddxs_users; t oddxs_tasks; p oddxs_task_progress; v_bal jsonb;
begin
  select * into u from oddxs_users where telegram_id = p_tid for update;
  if not found then raise exception 'user_not_found'; end if;
  if u.is_banned then raise exception 'banned'; end if;
  select * into t from oddxs_tasks where id = p_id and is_active for update;
  if not found then raise exception 'task_not_found'; end if;
  select * into p from oddxs_task_progress where task_id = p_id and telegram_id = p_tid for update;
  if found and p.completed_at is not null then raise exception 'task_done'; end if;
  if t.max_completions is not null and (select count(*) from oddxs_task_progress where task_id = p_id and completed_at is not null) >= t.max_completions then raise exception 'task_full'; end if;
  if t.type = 'channel' then
    if not p_verified then raise exception 'not_member'; end if;
  else
    if not found then raise exception 'task_wait:%', t.wait_seconds; end if;
    if extract(epoch from (clock_timestamp() - p.started_at)) < t.wait_seconds then
      raise exception 'task_wait:%', ceil(t.wait_seconds - extract(epoch from (clock_timestamp() - p.started_at)))::int; end if;
  end if;
  insert into oddxs_task_progress (task_id, telegram_id, completed_at) values (p_id, p_tid, clock_timestamp())
    on conflict (task_id, telegram_id) do update set completed_at = clock_timestamp();
  update oddxs_users set tasks_done = tasks_done + 1 where telegram_id = p_tid;
  v_bal := oddxs_adjust(p_tid, t.reward_cp, 'task', p_id::text, t.title_en);
  perform oddxs_try_referral(p_tid);
  return jsonb_build_object('ok', true, 'reward_cp', t.reward_cp, 'balance_cp', (v_bal ->> 'balance_cp')::bigint, 'tasks_done', u.tasks_done + 1);
end $$;

create or replace function oddxs_admin_tasks() returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sort, x.created_at), '[]') from (
    select t.*, (select count(*) from oddxs_task_progress p where p.task_id = t.id and p.completed_at is not null) as completions from oddxs_tasks t) x
$$;

create or replace function oddxs_admin_save_task(p_id uuid, p_v jsonb, p_actor text) returns jsonb language plpgsql as $$
declare r oddxs_tasks;
begin
  if p_id is null then
    insert into oddxs_tasks (title_en, title_ar, type, url, chat_id, reward_cp, wait_seconds, max_completions, is_active, sort)
    values (p_v ->> 'title_en', coalesce(p_v ->> 'title_ar', ''), coalesce(p_v ->> 'type', 'link'), coalesce(p_v ->> 'url', ''), nullif(p_v ->> 'chat_id', ''),
            coalesce((p_v ->> 'reward_cp')::bigint, 100), coalesce((p_v ->> 'wait_seconds')::int, 10), nullif(p_v ->> 'max_completions', '')::int,
            coalesce((p_v ->> 'is_active')::boolean, true), coalesce((p_v ->> 'sort')::int, 0)) returning * into r;
  else
    update oddxs_tasks set title_en = coalesce(p_v ->> 'title_en', title_en), title_ar = coalesce(p_v ->> 'title_ar', title_ar), type = coalesce(p_v ->> 'type', type),
           url = coalesce(p_v ->> 'url', url), chat_id = case when p_v ? 'chat_id' then nullif(p_v ->> 'chat_id', '') else chat_id end,
           reward_cp = coalesce((p_v ->> 'reward_cp')::bigint, reward_cp), wait_seconds = coalesce((p_v ->> 'wait_seconds')::int, wait_seconds),
           max_completions = case when p_v ? 'max_completions' then nullif(p_v ->> 'max_completions', '')::int else max_completions end,
           is_active = coalesce((p_v ->> 'is_active')::boolean, is_active), sort = coalesce((p_v ->> 'sort')::int, sort)
     where id = p_id returning * into r;
    if not found then raise exception 'not_found'; end if;
  end if;
  perform oddxs_audit(p_actor, 'save_task', to_jsonb(r));
  return to_jsonb(r);
end $$;

create or replace function oddxs_admin_delete_task(p_id uuid, p_actor text) returns jsonb language plpgsql as $$
begin
  delete from oddxs_tasks where id = p_id;
  perform oddxs_audit(p_actor, 'delete_task', jsonb_build_object('id', p_id));
  return jsonb_build_object('ok', true);
end $$;

-- ───────────────────────────── forced subscription channels ─────────────────────────────
-- Users must be members of every active channel here before they can use the app (bot must be admin of the channel).
create table if not exists oddxs_force_channels (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  chat_id text not null,                    -- @channel_username or -100…
  url text not null,                        -- https://t.me/… invite/public link shown to the user
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table oddxs_force_channels enable row level security;

create or replace function oddxs_force_list(p_only_active boolean default true) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(c) order by c.sort, c.created_at), '[]') from oddxs_force_channels c where (not p_only_active or c.is_active)
$$;
create or replace function oddxs_admin_save_force(p_id uuid, p_v jsonb, p_actor text) returns jsonb language plpgsql as $$
declare r oddxs_force_channels;
begin
  if p_id is null then
    insert into oddxs_force_channels (title, chat_id, url, is_active, sort)
    values (coalesce(p_v ->> 'title', ''), p_v ->> 'chat_id', p_v ->> 'url', coalesce((p_v ->> 'is_active')::boolean, true), coalesce((p_v ->> 'sort')::int, 0)) returning * into r;
  else
    update oddxs_force_channels set title = coalesce(p_v ->> 'title', title), chat_id = coalesce(p_v ->> 'chat_id', chat_id), url = coalesce(p_v ->> 'url', url),
           is_active = coalesce((p_v ->> 'is_active')::boolean, is_active), sort = coalesce((p_v ->> 'sort')::int, sort)
     where id = p_id returning * into r;
    if not found then raise exception 'not_found'; end if;
  end if;
  perform oddxs_audit(p_actor, 'save_force_channel', to_jsonb(r));
  return to_jsonb(r);
end $$;
create or replace function oddxs_admin_delete_force(p_id uuid, p_actor text) returns jsonb language plpgsql as $$
begin
  delete from oddxs_force_channels where id = p_id;
  perform oddxs_audit(p_actor, 'delete_force_channel', jsonb_build_object('id', p_id));
  return jsonb_build_object('ok', true);
end $$;

-- lock the functions away from the public (anon/authenticated) PostgREST roles
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'oddxs\_%' loop
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    end if;
  end loop;
end $$;

-- ───────────────────────────── first admin (optional) ─────────────────────────────
-- The owner normally signs in to /admin with ADMIN_SECRET. To also let a Telegram account in as OWNER:
--   insert into oddxs_admins (telegram_id, username, first_name, role, permissions)
--   values ('YOUR_TELEGRAM_ID', 'you', 'You', 'owner', '[]') on conflict (telegram_id) do nothing;


-- ───────────────────────────── ODDXS Exchange (Points → in-app USDT) ─────────────────────────────
-- Safe to re-run on an existing installation. Conversion is atomic and never trusts a client-supplied rate.
alter table oddxs_users add column if not exists usdt_balance numeric(24,8) not null default 0 check (usdt_balance >= 0);
insert into oddxs_settings (key, value) values
  ('exchange_enabled', 'false'), ('exchange_min_pts', '100'), ('exchange_max_pts', '100000'), ('exchange_points_per_usdt', '2000')
on conflict (key) do nothing;
-- Requested value: 100 points = 0.05 USDT (2,000 points = 1 USDT).
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

-- ───────────────────────────── V16.9 leaderboard (same as sql/leaderboard.sql) ─────────────────────────────
-- ODDXS V16.9: leaderboard (top players by points / by referrals). Safe to re-run.
-- Only a short first name is exposed (never username / telegram id); banned users and zero scores are excluded.
create index if not exists oddxs_users_balance_idx on oddxs_users (balance_cp desc) where not is_banned;
create index if not exists oddxs_users_refcount_idx on oddxs_users (referral_count desc) where not is_banned;

create or replace function oddxs_leaderboard(p_kind text, p_tid text, p_limit integer default 10) returns jsonb language plpgsql stable as $$
declare v_limit int := least(greatest(coalesce(p_limit, 10), 1), 50); v_top jsonb; v_me jsonb;
begin
  if p_kind not in ('points', 'referrals') then raise exception 'bad_kind'; end if;
  with ranked as (
    select telegram_id,
           left(coalesce(nullif(btrim(first_name), ''), 'User'), 16) as name,
           case when p_kind = 'referrals' then referral_count::bigint else balance_cp end as score,
           row_number() over (order by (case when p_kind = 'referrals' then referral_count::bigint else balance_cp end) desc, created_at asc) as rank
      from oddxs_users
     where not is_banned and (case when p_kind = 'referrals' then referral_count::bigint else balance_cp end) > 0
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object('rank', rank, 'name', name, 'score', score, 'me', telegram_id = p_tid) order by rank) from ranked where rank <= v_limit), '[]'::jsonb),
    (select jsonb_build_object('rank', rank, 'name', name, 'score', score) from ranked where telegram_id = p_tid)
  into v_top, v_me;
  return jsonb_build_object('kind', p_kind, 'top', v_top, 'me', v_me);
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function oddxs_leaderboard(text, text, integer) from public, anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function oddxs_leaderboard(text, text, integer) to service_role';
  end if;
end $$;
