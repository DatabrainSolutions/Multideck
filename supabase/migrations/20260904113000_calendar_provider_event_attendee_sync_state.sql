-- Distinguish a successfully synced provider event with no invitees from a
-- legacy or incomplete mirror whose attendee list has never been loaded.
alter table public."CAL_ProviderEvents"
  add column if not exists "CALProviderEvent_AttendeesSyncedAt" timestamptz;

comment on column public."CAL_ProviderEvents"."CALProviderEvent_AttendeesSyncedAt" is
  'When the provider attendee payload was last mirrored; null means attendee availability is not yet known.';
