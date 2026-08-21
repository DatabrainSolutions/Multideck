begin;

-- Quote logos are private Carbone source assets. Keep them in the existing
-- template-source bucket while allowing only the image formats validated by
-- the administrator upload workflow.
update storage.buckets
set allowed_mime_types = (
  select array_agg(mime_type order by mime_type)
  from (
    select distinct mime_type
    from unnest(
      coalesce(allowed_mime_types, '{}'::text[])
      || array['image/jpeg', 'image/png', 'image/webp']::text[]
    ) as mime_type
  ) allowed_types
)
where id = 'multideck-template-sources';

commit;
