-- ODDXS: Admin-managed AdsGram block IDs. Safe to run more than once.
-- Run this once in Supabase SQL Editor on an existing project.

insert into oddxs_settings (key, value) values
  ('adsgram_task_block_id', '"task-59461"'::jsonb),
  ('adsgram_interstitial_block_id', '"int-59439"'::jsonb),
  ('adsgram_game_open_block_id', '"int-59467"'::jsonb)
on conflict (key) do nothing;

create or replace function oddxs_adsgram_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'adsgram_task_block_id', oddxs_st('adsgram_task_block_id'),
    'adsgram_interstitial_block_id', oddxs_st('adsgram_interstitial_block_id'),
    'adsgram_game_open_block_id', oddxs_st('adsgram_game_open_block_id')
  );
$$;

revoke all on function oddxs_adsgram_settings() from public, anon, authenticated;
grant execute on function oddxs_adsgram_settings() to service_role;
