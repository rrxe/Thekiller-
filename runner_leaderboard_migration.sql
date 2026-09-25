-- لوحة صدارة لعبة Comet Run (الجري اللانهائي)
-- شغّل هذا مرة وحدة بلوحة Supabase (SQL Editor) على مشروعك.

alter table players
  add column if not exists runner_best_score integer not null default 0,
  add column if not exists runner_best_score_at timestamptz;

-- فهرس اختياري يسرّع ترتيب اللوحة لو عدد اللاعبين كبير
create index if not exists players_runner_best_score_idx
  on players (runner_best_score desc);
