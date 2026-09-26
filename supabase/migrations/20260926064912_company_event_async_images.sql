-- Save the event before generating its optional AI cover. The image state is
-- visible through the same event JSON and invitation boundary as the event.
begin;

alter table public.company_events
  add column image_generation_status text not null default 'none'
    check (image_generation_status in ('none', 'queued', 'generating', 'complete', 'failed')),
  add column image_generation_started_at timestamptz;

create function private.company_event_image_queue()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if tg_op = 'INSERT' then
    if new.image_path is null then
      new.image_generation_status := 'queued';
      new.image_generation_started_at := clock_timestamp();
    end if;
  elsif new.image_path is distinct from old.image_path
    and new.image_generation_status = old.image_generation_status then
    -- An organiser replaced or removed the cover; a running AI job must not
    -- attach its result over that deliberate choice.
    new.image_generation_status := 'none';
    new.image_generation_started_at := null;
  end if;
  return new;
end $$;

revoke all on function private.company_event_image_queue() from public, anon, authenticated;
create trigger company_event_image_queue
before insert or update of image_path on public.company_events
for each row execute function private.company_event_image_queue();

-- Keep the established event projection (and its invitation checks) intact.
do $patch$
declare
  definition text;
  marker text := '''imagePath'',p_event.image_path,''status''';
  replacement text := '''imagePath'',p_event.image_path,''imageGenerationStatus'',p_event.image_generation_status,''imageGenerationStartedAt'',p_event.image_generation_started_at,''status''';
begin
  definition := pg_get_functiondef('private.company_event_json(public.company_events,uuid,boolean)'::regprocedure);
  if (length(definition) - length(replace(definition, marker, ''))) / length(marker) <> 1 then
    raise exception 'Review company_event_json before adding image generation state';
  end if;
  execute replace(definition, marker, replacement);
end;
$patch$;

commit;
