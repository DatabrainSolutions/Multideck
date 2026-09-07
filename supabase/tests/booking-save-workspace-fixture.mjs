import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')
const visibility = migration('20260904131000_quote_booking_version_visibility')
const start = visibility.indexOf('create or replace function booking_api.workspace_with_document_groups(')
const end = visibility.indexOf('create or replace function public.booking_workflow_quote_sync_review(', start)
assert.ok(start >= 0 && end > start)
const responseFix = migration('20260906174532_booking_save_complete_workspace_response')

// Runs after the existing real cargo/route/allocation/approval/watch fixtures.
// Their broad workspace and Auth fixtures remain explicit. These additions
// supply source-Quote identity and a deterministic document group; the actual
// version projection and production save functions are exercised unchanged.
export const saveWorkspaceResponseAssertions = `
alter table public."Job_Header"
  add column if not exists "Job_SourceQuoteVersionID" uuid,
  add column if not exists "Job_PendingQuoteVersionID" uuid,
  add column if not exists "Job_QuoteSyncStatus" text;
alter function booking_api.workspace_extended(uuid,text) rename to workspace_before_response_fixture;
create function booking_api.workspace_extended(actor uuid,reference text)
returns jsonb language plpgsql stable as $$
declare result jsonb; quote_id uuid;
begin
  result:=booking_api.workspace_before_response_fixture(actor,reference);
  select v."CusQuoteHeader_ID" into quote_id from public."Job_Header" j
    join public."CusQuote_Versions" v on v."CusQuoteVersion_ID"=j."Job_SourceQuoteVersionID"
    where j."Job_BookingReference"=reference and not j."Job_IsDeleted";
  return result||jsonb_build_object('booking',result->'booking'||jsonb_build_object('sourceQuoteId',quote_id),
    'sourceQuote',jsonb_build_object('reference','JQ-RESPONSE-TEST','retainedKey','keep'),
    'documents',jsonb_build_array(jsonb_build_object('legacy','ungrouped')));
end $$;
create function booking_api.workspace_documents(actor uuid,job uuid)
returns jsonb language sql stable as $$
  select jsonb_build_array(jsonb_build_object('category','quote','fileName','JQ-RESPONSE-TEST.pdf','source','synthetic fixture'))
$$;
${visibility.slice(start,end)}
create function public.booking_workflow_workspace(actor uuid,reference text)
returns jsonb language sql stable as $$select booking_api.workspace_with_document_groups(actor,reference)$$;

-- Reproduce the original save response mismatch before installing the fix.
do $$declare actor uuid:='10000000-0000-4000-8000-000000000001';job uuid; result jsonb;begin
  perform set_config('test.actor',actor::text,false);
  update public."cmp_Users" set "User_AccessStatus"='active' where "User_ID"=actor;
  select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
  result:=public.booking_workflow_save(actor,job,'{}');
  if result->'documents'=public.booking_workflow_workspace(actor,'TEST1')->'documents' then
    raise exception 'Expected old save to omit grouped documents'; end if;
end $$;

${responseFix}
do $test$
declare
  actor uuid:='10000000-0000-4000-8000-000000000001'; company uuid;job uuid;office uuid;
  quote_id uuid:=gen_random_uuid();v1 uuid:=gen_random_uuid();v2 uuid:=gen_random_uuid();v3 uuid:=gen_random_uuid();
  saved jsonb;opened jsonb;before_quotes jsonb;after_quotes jsonb;baseline jsonb;stamp timestamptz;
  other_actor uuid;other_job uuid;applied uuid;payload jsonb;mode integer;
begin
  select "Company_ID" into company from public."cmp_Users" where "User_ID"=actor;
  select "Office_ID" into office from public."cmp_Offices" where "Company_ID"=company limit 1;
  select "Job_ID" into job from public."Job_Header" where "Job_BookingReference"='TEST1';
  select "Job_ID" into other_job from public."Job_Header" where "Job_BookingReference"='TEST2';
  select "User_ID" into other_actor from public."cmp_Users" where "Company_ID"<>company limit 1;
  insert into public."CusQuote_Header"("CusQuoteHeader_ID","CusQuoteHeader_OrgOfficeID") values(quote_id,office);
  insert into public."CusQuote_Versions"("CusQuoteVersion_ID","Company_ID","CusQuoteHeader_ID","CusQuoteVersion_Number","CusQuoteVersion_IsCurrent","CusQuoteVersion_IsSubmitted","CusQuoteVersion_SnapshotJSON")
    values(v1,company,quote_id,1,false,true,'{"reference":"JQ-RESPONSE-TEST","original":"retained"}'),
      (v2,company,quote_id,2,false,true,'{"reference":"JQ-RESPONSE-TEST - V2","pending":"retained"}'),
      (v3,company,quote_id,3,true,true,'{"reference":"JQ-RESPONSE-TEST - V3","later":"retained"}');
  select jsonb_agg(to_jsonb(v) order by "CusQuoteVersion_ID") into before_quotes from public."CusQuote_Versions" v;
  foreach applied in array array[v1,v3,null::uuid] loop
    update public."Job_Header" set "Job_SourceQuoteVersionID"=applied,"Job_PendingQuoteVersionID"=case when applied=v1 then v2 else null end,
      "Job_QuoteSyncStatus"=case when applied=v1 then 'pending' else 'synced' end where "Job_ID"=job;
    for mode in 0..2 loop
      select "Job_UpdatedAt" into stamp from public."Job_Header" where "Job_ID"=job;
      payload:=case when mode=0 then '{}'::jsonb else
        jsonb_build_object('expectedUpdatedAt',stamp,'cargoAllocations','[]'::jsonb) end;
      if mode=2 then payload:=payload||'{"jobReference":"Response test"}';end if;
      saved:=public.booking_workflow_save(actor,job,payload);
      opened:=public.booking_workflow_workspace(actor,'TEST1');
      if saved is distinct from opened then raise exception 'Saved/opened workspace differs for mode %: % / %',mode,saved,opened;end if;
      if saved#>>'{sourceQuote,retainedKey}'<>'keep' or saved#>>'{documents,0,category}'<>'quote'
        or saved->'cargoAllocationState' is null then raise exception 'Complete workspace metadata lost';end if;
      if applied=v1 and (saved#>>'{sourceQuote,appliedVersionNumber}' is distinct from '1'
        or saved#>>'{sourceQuote,pendingVersionNumber}' is distinct from '2'
        or saved#>>'{sourceQuote,syncStatus}' is distinct from 'pending') then raise exception 'Original/pending state lost';end if;
      if applied=v3 and (saved#>>'{sourceQuote,appliedVersionNumber}' is distinct from '3'
        or saved#>>'{sourceQuote,pendingVersionNumber}' is not null) then raise exception 'Later version stale or lost';end if;
      if applied is null and saved->'sourceQuote' ? 'appliedVersionNumber' then raise exception 'Invented version on standalone Booking';end if;
    end loop;
  end loop;
  select jsonb_agg(to_jsonb(v) order by "CusQuoteVersion_ID") into after_quotes from public."CusQuote_Versions" v;
  if before_quotes is distinct from after_quotes then raise exception 'Save changed submitted Quote history';end if;
  select jsonb_agg(to_jsonb(j) order by "Job_ID") into baseline from public."Job_Header" j;
  begin perform public.booking_workflow_save(actor,job,'{"expectedUpdatedAt":"2000-01-01T00:00Z","cargoAllocations":[]}');
    raise exception 'Stale allocation save accepted';exception when serialization_failure then null;end;
  begin perform public.booking_workflow_save(other_actor,job,'{}');raise exception 'Wrong actor save accepted';exception when insufficient_privilege then null;end;
  begin perform public.booking_workflow_save(actor,other_job,'{}');raise exception 'Foreign Booking save accepted';exception when insufficient_privilege then null;end;
  if baseline is distinct from (select jsonb_agg(to_jsonb(j) order by "Job_ID") from public."Job_Header" j) then raise exception 'Denied save changed Booking';end if;
  if has_function_privilege('anon','public.booking_workflow_save(uuid,uuid,jsonb)','execute')
    or has_function_privilege('authenticated','public.booking_workflow_save(uuid,uuid,jsonb)','execute')
    or not has_function_privilege('service_role','public.booking_workflow_save(uuid,uuid,jsonb)','execute') then raise exception 'Save grants changed';end if;
end $test$;
`
