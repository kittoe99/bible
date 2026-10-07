-- Add free editions without changing the original translation on existing notes.
alter table public.study_items drop constraint if exists study_items_translation_check;
alter table public.study_items add constraint study_items_translation_check
  check (translation in ('KJV','WEB','ASV','NIV','ESV'));
alter table public.reading_preferences drop constraint if exists reading_preferences_translation_check;
alter table public.reading_preferences add constraint reading_preferences_translation_check
  check (translation in ('KJV','WEB','ASV','NIV','ESV'));
update public.reading_preferences set translation = 'KJV'
  where translation in ('NIV','ESV');
