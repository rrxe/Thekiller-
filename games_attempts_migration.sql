-- نظام محاولات الألعاب اليومي (Games Hub)
-- شغّل هذا مرة وحدة بلوحة Supabase (SQL Editor) على مشروعك.

alter table players
  add column if not exists game_attempts_used integer not null default 0,
  add column if not exists game_bonus_attempts integer not null default 0,
  add column if not exists game_attempts_date text,
  add column if not exists game_ad_intent boolean not null default false,
  add column if not exists game_ad_started_at timestamptz;
