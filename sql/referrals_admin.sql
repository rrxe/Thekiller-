-- ODDXS · الإحالات بلوحة الإدارة (آمن لإعادة التشغيل)
-- نسخة مصححة: ما تعتمد على عمود streak (كان يسبب: column u.streak does not exist)

-- أعمدة ضرورية (ما يصير شي لو موجودة)
alter table oddxs_users add column if not exists referred_by text;
alter table oddxs_users add column if not exists referral_paid boolean not null default false;
alter table oddxs_users add column if not exists tasks_done int not null default 0;
alter table oddxs_users add column if not exists rounds_played int not null default 0;

create index if not exists oddxs_users_ref_idx on oddxs_users (referred_by);

-- 1) قائمة اللاعبين + أرقام الإحالات (تقرأ كل أعمدة اللاعب تلقائياً بدون ذكرها بالاسم)
create or replace function oddxs_admin_users(
  p_q text default '',
  p_limit int default 30,
  p_offset int default 0,
  p_sort text default 'new'
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_q text := btrim(coalesce(p_q, ''));
begin
  return jsonb_build_object(
    'total',
    (
      select count(*)
      from oddxs_users
      where v_q = ''
         or telegram_id = v_q
         or username ilike '%' || v_q || '%'
         or first_name ilike '%' || v_q || '%'
    ),
    'rows',
    (
      select coalesce(jsonb_agg(
        (to_jsonb(y.u_row) - 'pending_seed' - 'client_seed')
        || jsonb_build_object(
             'ref_total', coalesce(rf.ref_total, 0),
             'ref_paid', coalesce(rf.ref_paid, 0),
             'ref_played', coalesce(rf.ref_played, 0)
           )
        order by y.rn
      ), '[]'::jsonb)
      from (
        select pg.u_row, pg.tid, row_number() over () as rn
        from (
          select u as u_row, u.telegram_id as tid
          from oddxs_users u
          where v_q = ''
             or u.telegram_id = v_q
             or u.username ilike '%' || v_q || '%'
             or u.first_name ilike '%' || v_q || '%'
          order by
            case when p_sort = 'balance' then u.balance_cp end desc nulls last,
            case when p_sort = 'wagered' then u.total_wagered_cp end desc nulls last,
            case when p_sort = 'seen' then extract(epoch from u.last_seen_at) end desc nulls last,
            case when p_sort = 'refs' then (
              select count(*)
              from oddxs_users r
              where r.referred_by = u.telegram_id
            ) end desc nulls last,
            u.created_at desc
          limit least(p_limit, 100)
          offset p_offset
        ) pg
      ) y
      left join lateral (
        select
          count(*) as ref_total,
          count(*) filter (where r.referral_paid) as ref_paid,
          count(*) filter (where r.rounds_played > 0) as ref_played
        from oddxs_users r
        where r.referred_by = y.tid
      ) rf on true
    )
  );
end;
$$;

-- 2) لوحة الإحالات (ملخص + ترتيب الدعاة)
create or replace function oddxs_admin_referrals(
  p_q text default '',
  p_limit int default 20,
  p_offset int default 0,
  p_sort text default 'total'
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_q text := btrim(coalesce(p_q, ''));
begin
  return jsonb_build_object(
    'summary', (
      select jsonb_build_object(
        'total_invited', count(*),
        'paid', count(*) filter (where referral_paid),
        'played', count(*) filter (where rounds_played > 0),
        'today', count(*) filter (where created_at >= date_trunc('day', now())),
        'banned', count(*) filter (where is_banned),
        'rounds', coalesce(sum(rounds_played), 0),
        'inviters', count(distinct referred_by),
        'rewards_cp', (
          select coalesce(sum(delta_cp), 0)
          from oddxs_ledger
          where kind = 'referral'
            and delta_cp > 0
        )
      )
      from oddxs_users
      where referred_by is not null
    ),
    'total', (
      select count(*)
      from (
        select referred_by as tid
        from oddxs_users
        where referred_by is not null
        group by referred_by
      ) a
      join oddxs_users u on u.telegram_id = a.tid
      where v_q = ''
         or u.telegram_id = v_q
         or u.username ilike '%' || v_q || '%'
         or u.first_name ilike '%' || v_q || '%'
    ),
    'rows', (
      select coalesce(
        jsonb_agg(to_jsonb(z) - 'rn' order by z.rn),
        '[]'::jsonb
      )
      from (
        select
          y.*,
          coalesce(l.earned, 0) as earned_cp
        from (
          select
            pg.*,
            row_number() over () as rn
          from (
            select
              u.telegram_id,
              u.username,
              u.first_name,
              u.is_banned,
              a.ref_total,
              a.ref_paid,
              a.ref_played,
              a.ref_rounds,
              a.ref_wagered_cp,
              a.last_invite_at
            from (
              select
                referred_by as tid,
                count(*) as ref_total,
                count(*) filter (where referral_paid) as ref_paid,
                count(*) filter (where rounds_played > 0) as ref_played,
                coalesce(sum(rounds_played), 0) as ref_rounds,
                coalesce(sum(total_wagered_cp), 0) as ref_wagered_cp,
                max(created_at) as last_invite_at
              from oddxs_users
              where referred_by is not null
              group by referred_by
            ) a
            join oddxs_users u on u.telegram_id = a.tid
            where v_q = ''
               or u.telegram_id = v_q
               or u.username ilike '%' || v_q || '%'
               or u.first_name ilike '%' || v_q || '%'
            order by
              case when p_sort = 'paid' then a.ref_paid end desc nulls last,
              case when p_sort = 'played' then a.ref_played end desc nulls last,
              case when p_sort = 'new' then extract(epoch from a.last_invite_at) end desc nulls last,
              a.ref_total desc,
              a.last_invite_at desc
            limit least(p_limit, 100)
            offset p_offset
          ) pg
        ) y
        left join lateral (
          select sum(g.delta_cp) as earned
          from oddxs_ledger g
          where g.telegram_id = y.telegram_id
            and g.kind = 'referral'
        ) l on true
      ) z
    )
  );
end;
$$;

-- 3) تفاصيل اللاعب + كل مدعو وحالته
create or replace function oddxs_admin_user_detail(p_tid text)
returns jsonb
language plpgsql
stable
as $$
begin
  return jsonb_build_object(
    'user', (
      select to_jsonb(u) - 'pending_seed' - 'client_seed'
      from oddxs_users u
      where telegram_id = p_tid
    ),
    'ledger', (
      select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
      from (
        select *
        from oddxs_ledger
        where telegram_id = p_tid
        order by id desc
        limit 40
      ) l
    ),
    'rounds', (
      select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
      from (
        select id, game, stake_cp, payout_cp, mult, status, created_at
        from oddxs_rounds
        where telegram_id = p_tid
        order by created_at desc
        limit 30
      ) r
    ),
    'withdrawals', (
      select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb)
      from (
        select *
        from oddxs_withdrawals
        where telegram_id = p_tid
        order by created_at desc
        limit 20
      ) w
    ),
    'referrals', (
      select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb)
      from (
        select
          telegram_id, username, first_name, created_at,
          last_seen_at, ads_total, tasks_done, rounds_played,
          total_wagered_cp, total_won_cp, referral_paid, is_banned
        from oddxs_users
        where referred_by = p_tid
        order by created_at desc
        limit 100
      ) f
    ),
    'referral_stats', (
      select jsonb_build_object(
        'total', count(*),
        'paid', count(*) filter (where referral_paid),
        'played', count(*) filter (where rounds_played > 0),
        'rounds', coalesce(sum(rounds_played), 0),
        'wagered_cp', coalesce(sum(total_wagered_cp), 0),
        'earned_cp', (
          select coalesce(sum(delta_cp), 0)
          from oddxs_ledger
          where telegram_id = p_tid
            and kind = 'referral'
        )
      )
      from oddxs_users
      where referred_by = p_tid
    ),
    'referrer', (
      select to_jsonb(rr)
      from (
        select telegram_id, username, first_name
        from oddxs_users
        where telegram_id = (
          select referred_by
          from oddxs_users
          where telegram_id = p_tid
        )
      ) rr
    )
  );
end;
$$;

-- 4) الصلاحيات
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function oddxs_admin_users(text, integer, integer, text) from public, anon, authenticated';
    execute 'revoke all on function oddxs_admin_referrals(text, integer, integer, text) from public, anon, authenticated';
    execute 'revoke all on function oddxs_admin_user_detail(text) from public, anon, authenticated';
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function oddxs_admin_users(text, integer, integer, text) to service_role';
    execute 'grant execute on function oddxs_admin_referrals(text, integer, integer, text) to service_role';
    execute 'grant execute on function oddxs_admin_user_detail(text) to service_role';
  end if;
end;
$$;
