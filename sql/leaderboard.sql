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
