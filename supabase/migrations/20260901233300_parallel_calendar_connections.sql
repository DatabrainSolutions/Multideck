-- Preserve the existing service-only permissions and one-default-calendar index.
alter table public."CAL_ProviderConnections"
  add column if not exists "CALConnection_ColourCode" varchar(20);

update public."CAL_ProviderConnections"
set "CALConnection_ColourCode" = case "CALConnection_ProviderCode"
  when 'google' then 'blue'
  when 'microsoft' then 'violet'
  else 'neutral'
end
where "CALConnection_ColourCode" is null;

alter table public."CAL_ProviderConnections"
  alter column "CALConnection_ColourCode" set default 'neutral',
  alter column "CALConnection_ColourCode" set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'CK_CAL_ProviderConnections_colour'
      and conrelid = 'public."CAL_ProviderConnections"'::regclass
  ) then
    alter table public."CAL_ProviderConnections"
      add constraint "CK_CAL_ProviderConnections_colour"
      check ("CALConnection_ColourCode" in ('teal','amber','blue','violet','rose','red','cyan','neutral'));
  end if;
end $$;

comment on column public."CAL_ProviderConnections"."CALConnection_ColourCode" is
  'Visual-only Calendar colour for personal events synced through this provider connection.';
