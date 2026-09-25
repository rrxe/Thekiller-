-- شغّل هذا مرة وحدة بـ Supabase (SQL Editor) قبل الـ deploy.
alter table players
  add column if not exists game_run_open boolean not null default false,
  add column if not exists game_run_started_at timestamptz;
