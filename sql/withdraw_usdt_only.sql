-- ODDXS V26 — withdrawals are paid from the USDT balance ONLY (points must be exchanged to USDT first).
-- Run ONCE in the Supabase SQL editor (after withdraw7_exchange_ad.sql).
-- Limits stay in the existing settings: min/max_withdrawal_pts ÷ points_per_usd  (e.g. 200..600 pts @ 5000 = 0.0400..0.1200 USDT).

alter table oddxs_withdrawals add column if not exists is_usdt boolean not null default false;

-- old signature took points; the new one takes USDT (same types, different param name → must drop first)
drop function if exists oddxs_create_withdrawal(text, numeric, text, text);
create or replace function oddxs_create_withdrawal(p_tid text, p_usdt numeric, p_method text, p_target text)
returns jsonb language plpgsql as $$
declare u oddxs_users; v_target text := btrim(p_target); w oddxs_withdrawals; v_usdt numeric(24,8);
        v_ppu numeric := greatest(oddxs_sn('points_per_usd'), 1); v_min numeric; v_max numeric; v_cp bigint;
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
  if p_usdt is null or p_usdt <= 0 then raise exception 'bad_amount'; end if;
  v_usdt := round(p_usdt, 4);
  v_min := round(oddxs_sn('min_withdrawal_pts') / v_ppu, 4); v_max := round(oddxs_sn('max_withdrawal_pts') / v_ppu, 4);
  if v_usdt < v_min then raise exception 'withdraw_min:%', v_min; end if;
  if v_usdt > v_max then raise exception 'withdraw_max:%', v_max; end if;
  if u.usdt_balance < v_usdt then raise exception 'insufficient_usdt'; end if;
  if exists (select 1 from oddxs_withdrawals where telegram_id = p_tid and status = 'pending') then raise exception 'pending_exists'; end if;
  if u.withdrawal_ads_watched < oddxs_sn('withdrawal_ads_required') then
    raise exception 'need_ads:%', (oddxs_sn('withdrawal_ads_required') - u.withdrawal_ads_watched)::int; end if;
  if u.last_withdrawal_at is not null and u.last_withdrawal_at > now() - make_interval(hours => oddxs_sn('withdrawal_cooldown_hours')::int) then
    raise exception 'withdraw_cooldown'; end if;

  v_cp := greatest(1, round(v_usdt * v_ppu * 100))::bigint;   -- points-equivalent, informational only (admin panel)
  insert into oddxs_withdrawals (telegram_id, amount_cp, usd, method, target, is_usdt)
  values (p_tid, v_cp, v_usdt, p_method, v_target, true) returning * into w;
  update oddxs_users set usdt_balance = usdt_balance - v_usdt, withdrawal_ads_watched = 0, last_withdrawal_at = now()
   where telegram_id = p_tid returning * into u;
  perform oddxs_audit(p_tid, 'withdraw_usdt', jsonb_build_object('usdt', v_usdt, 'withdrawal_id', w.id));
  return to_jsonb(w) || jsonb_build_object('usdt_balance', u.usdt_balance);
end $$;

-- rejected withdrawal: give the USDT back (old points-based rows are still refunded in points)
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
    if w.is_usdt then
      update oddxs_users set usdt_balance = usdt_balance + w.usd where telegram_id = w.telegram_id;
      perform oddxs_audit(p_admin, 'withdraw_refund_usdt', jsonb_build_object('user', w.telegram_id, 'usdt', w.usd, 'withdrawal_id', w.id));
    else
      perform oddxs_adjust(w.telegram_id, w.amount_cp, 'withdraw_refund', w.id::text, p_note);
    end if;
    update oddxs_users set last_withdrawal_at = null where telegram_id = w.telegram_id;
  else raise exception 'bad_action'; end if;
  insert into oddxs_audit_logs (actor, action, details) values (p_admin, 'withdrawal_' || p_action, jsonb_build_object('id', p_id, 'user', w.telegram_id, 'cp', w.amount_cp, 'usd', w.usd, 'method', w.method, 'tx', p_tx, 'note', p_note));
  return to_jsonb(w) || jsonb_build_object('username', (select username from oddxs_users where telegram_id = w.telegram_id));
end $$;

create or replace function oddxs_my_withdrawals(p_tid text) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]') from (
    select id, amount_cp, usd, is_usdt, method, target, status, admin_note, tx_ref, created_at
      from oddxs_withdrawals where telegram_id = p_tid order by created_at desc limit 20) x
$$;

revoke all on function oddxs_create_withdrawal(text, numeric, text, text) from public, anon, authenticated;
revoke all on function oddxs_review_withdrawal(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function oddxs_my_withdrawals(text) from public, anon, authenticated;
grant execute on function oddxs_create_withdrawal(text, numeric, text, text) to service_role;
grant execute on function oddxs_review_withdrawal(uuid, text, text, text, text) to service_role;
grant execute on function oddxs_my_withdrawals(text) to service_role;
