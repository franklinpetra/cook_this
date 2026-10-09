-- Saved recipes for people who choose to sync them (see saved.js).
-- Run once in the Supabase project's SQL Editor.

create table if not exists public.saved_recipes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  meal_id text not null,
  name text not null,
  thumb text,
  meta text,
  saved_at timestamptz not null default now(),
  primary key (user_id, meal_id)
);

-- Each signed-in person can see and change only their own saves; nobody else can read them.
alter table public.saved_recipes enable row level security;

create policy "Read own saves" on public.saved_recipes
  for select to authenticated using (auth.uid() = user_id);
create policy "Add own saves" on public.saved_recipes
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Update own saves" on public.saved_recipes
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Remove own saves" on public.saved_recipes
  for delete to authenticated using (auth.uid() = user_id);
