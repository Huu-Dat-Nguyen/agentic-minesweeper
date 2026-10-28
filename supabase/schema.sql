-- Minefield accounts: run once in the Supabase SQL Editor (it is safe to run again).
-- Players own their rows; row-level security (RLS) is what protects the data,
-- because the publishable key in config.mjs is public by design.
--
-- Data map: the browser (data/cloud.mjs) writes `games` and the player's own
-- `profiles` row; stats, best times and history are derived from `games`;
-- other players only ever see usernames and the columns `top_times` returns.

-- One profile per account, created by the trigger below from the sign-up username.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_-]{3,20}$'),
  stats_reset_at timestamptz,
  created_at timestamptz not null default now()
);

-- One row per finished game (first finish only), assisted games included for history.
create table if not exists public.games (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('beginner', 'intermediate', 'expert', 'custom', 'daily')),
  date_key date,
  rows int not null check (rows between 1 and 24),
  columns int not null check (columns between 1 and 40),
  mines int not null check (mines >= 1 and mines < rows * columns),
  seed text not null check (seed ~ '^[a-z0-9-]{1,40}$'),
  start int not null check (start >= 0 and start < rows * columns),
  no_guess boolean not null default false,
  won boolean not null,
  seconds int not null check (seconds between 0 and 100000),
  three_bv int not null check (three_bv >= 0),
  assisted boolean not null,
  moves jsonb not null check (jsonb_typeof(moves) = 'array' and jsonb_array_length(moves) <= 5000),
  created_at timestamptz not null default now(),
  check ((mode = 'daily') = (date_key is not null))
);

create index if not exists games_user_created on public.games (user_id, created_at);
create index if not exists games_leaderboard on public.games (mode, date_key, seconds) where won and not assisted;

alter table public.profiles enable row level security;
alter table public.games enable row level security;

-- Usernames are public; each player may only change their own profile.
drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select to anon, authenticated using (true);
drop policy if exists "players update their profile" on public.profiles;
create policy "players update their profile" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Games are private to their player and can't be edited or deleted after saving.
drop policy if exists "players read their games" on public.games;
create policy "players read their games" on public.games for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "players save their games" on public.games;
create policy "players save their games" on public.games for insert to authenticated
  with check ((select auth.uid()) = user_id);

revoke all on public.profiles, public.games from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (stats_reset_at) on public.profiles to authenticated;
grant select, insert on public.games to authenticated;

-- Creates the profile from the username passed at sign-up. A missing or taken
-- username makes the sign-up fail, so no account exists without a profile.
create or replace function public.create_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, lower(new.raw_user_meta_data ->> 'username'));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile();

-- Public leaderboard: the fastest players for a preset mode, or for one daily date,
-- one row per player (their best unassisted win). It runs with its owner's rights
-- so it can rank everyone, and returns only these columns. Custom boards are excluded.
create or replace function public.top_times(p_mode text, p_date date default null, p_limit int default 20)
returns table (username text, seconds int, three_bv int, played_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select best.username, best.seconds, best.three_bv, best.created_at
  from (
    select distinct on (g.user_id) p.username, g.seconds, g.three_bv, g.created_at
    from public.games g
    join public.profiles p on p.id = g.user_id
    where g.won and not g.assisted
      and g.mode = p_mode
      and p_mode <> 'custom'
      and (p_mode <> 'daily' or g.date_key = p_date)
    order by g.user_id, g.seconds, g.created_at
  ) best
  order by best.seconds, best.created_at
  limit least(greatest(p_limit, 1), 100)
$$;

revoke all on function public.create_profile() from public, anon, authenticated;
revoke all on function public.top_times(text, date, int) from public;
grant execute on function public.top_times(text, date, int) to anon, authenticated;
