-- Retain only the bounded attendee presentation needed by the existing
-- tenant-safe Calendar workspace. Private provider events always store an
-- empty array, and the worker refreshes this field from provider webhooks.
alter table public."CAL_ProviderEvents"
  add column if not exists "CALProviderEvent_AttendeesJSON" jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'CK_CAL_ProviderEvents_attendees'
      and conrelid = 'public."CAL_ProviderEvents"'::regclass
  ) then
    alter table public."CAL_ProviderEvents"
      add constraint "CK_CAL_ProviderEvents_attendees"
      check (jsonb_typeof("CALProviderEvent_AttendeesJSON") = 'array');
  end if;
end;
$$;

comment on column public."CAL_ProviderEvents"."CALProviderEvent_AttendeesJSON" is
  'Bounded attendee names, emails, roles and provider response states for Calendar presentation; empty for private events.';
