-- Run once in the Supabase SQL editor, or with `supabase db push`.
create or replace function public.valid_passage(b text, c integer, vv integer[])
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(c between 1 and (('{"GEN":50,"EXO":40,"LEV":27,"NUM":36,"DEU":34,"JOS":24,"JDG":21,"RUT":4,"1SA":31,"2SA":24,"1KI":22,"2KI":25,"1CH":29,"2CH":36,"EZR":10,"NEH":13,"EST":10,"JOB":42,"PSA":150,"PRO":31,"ECC":12,"SNG":8,"ISA":66,"JER":52,"LAM":5,"EZK":48,"DAN":12,"HOS":14,"JOL":3,"AMO":9,"OBA":1,"JON":4,"MIC":7,"NAM":3,"HAB":3,"ZEP":3,"HAG":2,"ZEC":14,"MAL":4,"MAT":28,"MRK":16,"LUK":24,"JHN":21,"ACT":28,"ROM":16,"1CO":16,"2CO":13,"GAL":6,"EPH":6,"PHP":4,"COL":4,"1TH":5,"2TH":3,"1TI":6,"2TI":4,"TIT":3,"PHM":1,"HEB":13,"JAS":5,"1PE":5,"2PE":3,"1JN":5,"2JN":1,"3JN":1,"JUD":1,"REV":22}'::jsonb)->>b)::integer
    and cardinality(vv) between 1 and 176 and 1 <= all(vv) and 176 >= all(vv)
    and array_position(vv,null) is null
    and cardinality(vv) = (select count(distinct v) from unnest(vv) v), false);
$$;

create table public.study_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('note','bookmark','highlight')),
  book text not null,
  chapter integer not null,
  verses integer[] not null,
  translation text not null check (translation in ('KJV','NIV','ESV')),
  body text not null default '' check (length(body)<=20000),
  color text check (color in ('sage','gold','rose','blue')),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint passage_valid check (public.valid_passage(book,chapter,verses)),
  constraint annotation_shape check ((kind='note' and color is null) or (kind='bookmark' and color is null and body='' and cardinality(verses)=1) or (kind='highlight' and color is not null and body='' and cardinality(verses)=1))
);
create index study_items_user_updated on public.study_items(user_id,updated_at desc);
create unique index unique_verse_annotation on public.study_items(user_id,kind,book,chapter,verses) where kind <> 'note';
alter table public.study_items enable row level security;
create policy "Own study items" on public.study_items for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.study_items to authenticated;
revoke all on public.study_items from anon;

create table public.reading_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  book text not null default 'GEN', chapter integer not null default 1,
  translation text not null default 'KJV' check (translation in ('KJV','NIV','ESV')),
  font_size integer not null default 21 check (font_size between 16 and 30),
  updated_at timestamptz not null default now(),
  check (public.valid_passage(book,chapter,array[1]))
);
alter table public.reading_preferences enable row level security;
create policy "Own reading preferences" on public.reading_preferences for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update,delete on public.reading_preferences to authenticated;
revoke all on public.reading_preferences from anon;

-- Revision increments also apply to direct updates, preventing stale editor writes.
create or replace function public.bump_study_revision() returns trigger language plpgsql set search_path = '' as $$
begin new.version=old.version+1; new.updated_at=now(); return new; end;
$$;
create trigger study_revision before update on public.study_items for each row execute function public.bump_study_revision();

-- Atomic compare-and-swap. SECURITY INVOKER deliberately retains row-level security.
create or replace function public.save_note(p_id uuid,p_book text,p_chapter integer,p_verses integer[],p_translation text,p_body text,p_version integer)
returns public.study_items language plpgsql security invoker set search_path = '' as $$
declare result public.study_items;
begin
  if auth.uid() is null then raise exception 'Sign in to save notes.' using errcode='42501'; end if;
  if p_version=0 then
    insert into public.study_items(id,user_id,kind,book,chapter,verses,translation,body)
    values(p_id,auth.uid(),'note',p_book,p_chapter,p_verses,p_translation,p_body)
    on conflict(id) do nothing returning * into result;
    if result.id is null then raise exception 'NOTE_CONFLICT' using errcode='40001'; end if;
  else
    update public.study_items set body=p_body where id=p_id and user_id=auth.uid() and kind='note' and version=p_version returning * into result;
    if result.id is null then raise exception 'NOTE_CONFLICT' using errcode='40001'; end if;
  end if;
  return result;
end;
$$;
revoke all on function public.save_note(uuid,text,integer,integer[],text,text,integer) from public,anon;
grant execute on function public.save_note(uuid,text,integer,integer[],text,text,integer) to authenticated;

-- Toggle or recolor all selected verse annotations in a single transaction.
create or replace function public.set_annotations(p_kind text,p_book text,p_chapter integer,p_verses integer[],p_translation text,p_color text,p_remove boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare v integer;
begin
  if auth.uid() is null then raise exception 'Sign in to save.' using errcode='42501'; end if;
  if p_kind not in ('bookmark','highlight') or not public.valid_passage(p_book,p_chapter,p_verses) then raise exception 'Invalid annotation'; end if;
  foreach v in array p_verses loop
    delete from public.study_items where user_id=auth.uid() and kind=p_kind and book=p_book and chapter=p_chapter and verses=array[v];
    if not p_remove then
      insert into public.study_items(user_id,kind,book,chapter,verses,translation,color)
      values(auth.uid(),p_kind,p_book,p_chapter,array[v],p_translation,case when p_kind='highlight' then p_color else null end);
    end if;
  end loop;
end;
$$;
revoke all on function public.set_annotations(text,text,integer,integer[],text,text,boolean) from public,anon;
grant execute on function public.set_annotations(text,text,integer,integer[],text,text,boolean) to authenticated;
