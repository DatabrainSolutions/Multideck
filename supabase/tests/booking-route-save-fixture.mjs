import {readFileSync} from 'node:fs'

const read = name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
const routing = read('20260902153715_booking_multi_leg_routes_and_cargo_dimensions.sql')
const start = routing.indexOf('create or replace function public.booking_workflow_save(')
if (start < 0) throw new Error('Missing production workspace save')
const workflow = routing.slice(start, routing.indexOf('\n$$;', start) + 4)
export const routeSaveMigration = read('20260905182616_booking_route_single_save_authority.sql')

// Real primary save + real route stage + real orchestration. Unrelated detail,
// cargo-measurement and broad read stages are explicit fixtures in this test.
export const routeSaveFixture = `
  create schema quote_api;
  create table public."Org_Master" ("Org_id" uuid);
  create table public."sys_JobStatuses" ("JS_Code" text, "JS_IsActive" boolean);
  insert into public."sys_JobStatuses" values ('draft',true),('open',true);
  alter table public."Job_Header"
    add column "Job_BookingReference" text, add column "Job_CustomerDeadline" date,
    add column "Job_IncotermsCode" text, add column "Job_IncotermsLocation" text,
    add column "Job_FreightChargeAmount" numeric, add column "Job_FreightChargeCurrencyCode" text,
    add column "Job_CollectionAddress" text, add column "Job_DeliveryAddress" text;
  create table booking_api.events (company_id uuid, job_id uuid, event_type text, summary text, metadata jsonb, actor_user_id uuid);
  create function booking_api.normalise_direction(text) returns text language sql as $$select lower($1)$$;
  create function quote_api.jsonb_has_content(jsonb) returns boolean language sql as $$select $1 <> '{}'::jsonb$$;
  create function booking_api.workspace(uuid,text) returns jsonb language sql as $$select '{}'::jsonb$$;
  create function booking_api.workspace_extended(uuid,text) returns jsonb language sql as $$
    select jsonb_build_object('routes',booking_api.test_read_routes("Job_ID")) from public."Job_Header" where "Job_BookingReference"=$2
  $$;
  create function booking_api.save_booking_cargo_measurements(uuid,uuid,jsonb) returns void language sql as $$select$$;
  create function booking_api.save_booking_detail_fields(uuid,uuid,jsonb) returns void language sql as $$select$$;
  ${read('20260905110317_booking_stable_cargo_equipment_identity.sql')}
  ${workflow}
  alter function public.booking_workflow_save(uuid,uuid,jsonb) rename to booking_workflow_save_before_branch_direction_20260904;
  -- Observe every row update, not only the final value returned after save.
  create table booking_api.test_route_writes(route_id uuid, old_mode text, new_mode text);
  create function booking_api.test_observe_route_write() returns trigger language plpgsql as $$
    begin insert into booking_api.test_route_writes values(new."JobRoute_ID",old."JobRoute_ModeCode",new."JobRoute_ModeCode");return new;end;
  $$;
  create trigger test_route_write after update on public."Job_Routing" for each row execute function booking_api.test_observe_route_write();
`

export const routeSaveAssertions = `
  do $test$
  declare actor uuid:=gen_random_uuid();company uuid:=gen_random_uuid();office uuid:=gen_random_uuid();
    job uuid:=gen_random_uuid();legacy_job uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();
    source jsonb;result jsonb;first_id text;second_id text;before_rows jsonb;before_events integer;
  begin
    insert into public."cmp_Users" values(actor,actor,company,'active');
    insert into public."cmp_Offices" values(office,company);
    insert into public."Org_Master" values(customer);
    insert into public."Job_Header"("Job_ID","Job_Number","Job_Period","Job_CreatedBy","Job_Customer","Job_OfficeID","Job_BookingReference","Job_Status","Job_TransportModeSummary")
      values(job,10,'202609',actor,customer,office,'MIXED','open','multimodal'),
        (legacy_job,11,'202609',actor,customer,office,'LEGACY','open','sea');
    source:='{"mode":"multimodal","route":{"mode":"multimodal","origin":"Wrong first","destination":"Wrong last","masterTransportReference":"WRONG"},"routes":[{"mode":"road","origin":"Depot","destination":"Port","masterTransportReference":"CMR-1"},{"mode":"sea","origin":"Port","destination":"Overseas port","masterTransportReference":"MBL-1"}]}';
    perform public.booking_workflow_save_before_branch_direction_20260904(actor,job,source);
    result:=booking_api.test_read_routes(job);
    if jsonb_array_length(result)<>2 or result#>>'{0,mode}'<>'road' or result#>>'{0,masterTransportReference}'<>'CMR-1'
      or result#>>'{1,mode}'<>'sea' then raise exception 'Legacy summary duplicated or overwrote the real first leg: %',result;end if;
    first_id:=result#>>'{0,id}';second_id:=result#>>'{1,id}';
    source:=jsonb_set(source,'{routes}',result);
    perform public.booking_workflow_save_before_branch_direction_20260904(actor,job,source);
    if booking_api.test_read_routes(job) is distinct from result then raise exception 'Repeated workspace save changed routes';end if;
    if exists(select 1 from booking_api.test_route_writes where old_mode is distinct from new_mode)
      then raise exception 'Job mode temporarily overwrote a leg mode';end if;
    -- Reordering must not copy the new first leg into the old first leg.
    source:=jsonb_set(source,'{routes}',jsonb_build_array(result->1,result->0));
    source:=jsonb_set(source,'{route}',result->1);
    perform public.booking_workflow_save_before_branch_direction_20260904(actor,job,source);
    result:=booking_api.test_read_routes(job);
    if result#>>'{0,id}'<>second_id or result#>>'{0,masterTransportReference}'<>'MBL-1'
      or result#>>'{1,id}'<>first_id or result#>>'{1,masterTransportReference}'<>'CMR-1' then raise exception 'Reordering rewrote another leg';end if;
    -- An explicit empty list never falls back to a stale legacy summary, nor
    -- does omission from this additive stage delete existing operational legs.
    before_rows:=result;
    perform public.booking_workflow_save_before_branch_direction_20260904(actor,job,jsonb_set(source,'{routes}','[]'));
    if booking_api.test_read_routes(job) is distinct from before_rows then raise exception 'Empty routes revived legacy summary';end if;
    select count(*) into before_events from booking_api.events;
    source:=jsonb_set(source,'{routes,1,destination}','""');
    begin perform public.booking_workflow_save_before_branch_direction_20260904(actor,job,source);
      raise exception 'Invalid route accepted';exception when invalid_parameter_value then null;end;
    if booking_api.test_read_routes(job) is distinct from before_rows or before_events<>(select count(*) from booking_api.events)
      then raise exception 'Failed route save partially changed rows or audit';end if;
    perform public.booking_workflow_save_before_branch_direction_20260904(actor,legacy_job,
      '{"mode":"sea","route":{"origin":"Port A","destination":"Port B","masterTransportReference":"LEGACY-MBL"}}');
    result:=booking_api.test_read_routes(legacy_job);
    if jsonb_array_length(result)<>1 or result#>>'{0,masterTransportReference}'<>'LEGACY-MBL' then raise exception 'Legacy-only save regressed';end if;
    if not exists(select 1 from booking_api.events where job_id=job and actor_user_id=actor and metadata->'fields' ? 'routes') then raise exception 'Route save audit missing';end if;
    if has_function_privilege('authenticated','public.booking_workflow_save_before_branch_direction_20260904(uuid,uuid,jsonb)','EXECUTE')
      or has_function_privilege('service_role','public.booking_workflow_save_before_branch_direction_20260904(uuid,uuid,jsonb)','EXECUTE') then raise exception 'Private save stage exposed';end if;
  end;$test$;
`
