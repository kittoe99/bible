-- One completion per canonical chapter, independent of translation.
create table public.chapter_progress (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  book text not null,
  chapter integer not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, book, chapter),
  constraint valid_chapter check (public.valid_passage(book, chapter, array[1]))
);
alter table public.chapter_progress enable row level security;
create policy "Own chapter progress" on public.chapter_progress
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on public.chapter_progress from anon, public;
grant select, insert, update, delete on public.chapter_progress to authenticated;
