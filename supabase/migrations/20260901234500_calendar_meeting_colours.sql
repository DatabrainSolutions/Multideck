-- A bounded visual colour for native Calendar meetings. This is operator-only
-- presentation metadata: it is deliberately excluded from provider payloads,
-- attendee notifications, Dexter actions and Watching for you events.

alter table public."CAL_Meetings"
  add column if not exists "CALMeeting_ColourCode" varchar(20) not null default 'teal';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'CK_CAL_Meetings_colour'
      and conrelid = 'public."CAL_Meetings"'::regclass
  ) then
    alter table public."CAL_Meetings"
      add constraint "CK_CAL_Meetings_colour"
      check ("CALMeeting_ColourCode" in ('teal','amber','blue','violet','rose','red','cyan','neutral'));
  end if;
end;
$$;

comment on column public."CAL_Meetings"."CALMeeting_ColourCode" is
  'Visual-only event colour chosen in Multideck Calendar; never sent to attendees or external providers.';
