-- ODDXS · Gold Rush Mines (لعبة ذهب أو لغم)
-- شغّل هذا الملف مرة واحدة في Supabase → SQL Editor (آمن لو أعدت تشغيله).

-- 1) السماح باسم اللعبة الجديد في جدول الجولات
alter table oddxs_rounds drop constraint if exists oddxs_rounds_game_check;
alter table oddxs_rounds add constraint oddxs_rounds_game_check
  check (game in ('crash','mines','dice','blackjack','goldrush'));

-- 2) مفتاح تفعيل/إيقاف اللعبة من لوحة الأدمن (الإعدادات → الألعاب)
insert into oddxs_settings (key, value) values ('game_goldrush_enabled', 'true')
on conflict (key) do nothing;

-- 3) دالة صغيرة يقرأ منها السيرفر حالة اللعبة
create or replace function oddxs_goldrush_enabled() returns boolean language sql stable as $$
  select oddxs_sb('game_goldrush_enabled')
$$;
