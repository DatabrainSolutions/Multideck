-- The Quote editor saves party emails in the accepted snapshot. Earlier
-- versions kept them in shipmentFacts instead. Copy either source only while
-- the accepted Quote creates its initial Booking parties; later operator
-- edits and explicit blank values must remain under Booking control.
begin;
set local lock_timeout = '5s';

create function booking_api.fill_accepted_quote_party_contact()
returns trigger language plpgsql set search_path = '' as $$
declare
  source_snapshot jsonb;
  party_facts jsonb;
  email_value text;
  contact_value text;
begin
  if new."JobParty_Role" not in ('shipper', 'consignee')
    or jsonb_typeof(new."JobParty_RawSnapshot") is distinct from 'object'
    or new."JobParty_RawSnapshot" ? 'role' then
    return new;
  end if;

  select job."Job_SourceSnapshotJSON" into source_snapshot
  from public."Job_Header" job
  where job."Job_ID" = new."JobParty_JobID"
    and job."Job_SourceQuoteID" is not null;
  if source_snapshot is null then return new; end if;

  party_facts := source_snapshot #> '{acceptedSnapshot,quote,shipmentFacts}';
  email_value := coalesce(
    nullif(btrim(new."JobParty_RawSnapshot"->>'email'), ''),
    nullif(btrim(party_facts->>(new."JobParty_Role" || 'Email')), '')
  );
  contact_value := coalesce(
    nullif(btrim(new."JobParty_RawSnapshot"->>'contact'), ''),
    nullif(btrim(party_facts->>(new."JobParty_Role" || 'Contact')), '')
  );

  if nullif(btrim(new."JobParty_EmailSnapshot"), '') is null then
    new."JobParty_EmailSnapshot" := left(email_value, 254);
  end if;
  if nullif(btrim(new."JobParty_ContactNameSnapshot"), '') is null then
    new."JobParty_ContactNameSnapshot" := left(contact_value, 180);
  end if;
  return new;
end $$;

create trigger fill_accepted_quote_party_contact_before_insert
before insert on public."Job_Parties"
for each row execute function booking_api.fill_accepted_quote_party_contact();

revoke all on function booking_api.fill_accepted_quote_party_contact()
from public, anon, authenticated, service_role;

-- Applying a later accepted Quote version must carry its party emails too.
-- Preserve the existing review, stale-save and permission checks in this
-- private function rather than replacing its workflow wholesale.
do $$
declare
  definition text;
  signature text := 'public.booking_workflow_apply_quote_sync_before_payer_20260904(uuid,uuid,uuid,jsonb)';
  role_name text;
  anchor text;
  replacement text;
begin
  definition := pg_get_functiondef(signature::regprocedure);
  foreach role_name in array array['shipper', 'consignee'] loop
    anchor := '''contactName'',proposed#>>''{' || role_name || ',contact}'',''sequence''';
    replacement := '''contactName'',proposed#>>''{' || role_name || ',contact}'',''email'',proposed#>>''{' || role_name || ',email}'',''sequence''';
    if position(replacement in definition) > 0 then continue; end if;
    if position(anchor in definition) = 0 then
      raise exception 'Review Quote sync % email transfer before applying', role_name;
    end if;
    definition := replace(definition, anchor, replacement);
  end loop;
  execute definition;
end $$;

commit;
