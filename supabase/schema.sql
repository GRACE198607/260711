create table if not exists saju_draws (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  birth_date date not null,
  birth_time text,
  gender text,
  analysis text not null,
  numbers int[] not null,
  bonus_number int not null
);
