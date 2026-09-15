begin;

-- Preserve source exchanges before building assessment-specific adapters. A
-- provider acknowledgement is not necessarily a CDS tax assessment.
create table public."Customs_ProviderResponseHistory" (
  id uuid primary key default gen_random_uuid(),
  declaration_id uuid not null references public."Customs_Declarations"("CUST_id"),
  submission_id uuid not null references public."ICUS_Submissions"("ICUSS_id"),
  recorded_at timestamptz not null default clock_timestamp(),
  source_updated_at timestamptz,
  capture_kind text not null check (capture_kind in ('observed', 'existing-snapshot')),
  response_status integer,
  submission_status text not null,
  response_payload jsonb not null,
  request_payload jsonb not null,
  declaration_snapshot jsonb
);
create index customs_provider_response_history_declaration
  on public."Customs_ProviderResponseHistory"(declaration_id, recorded_at desc, id);
alter table public."Customs_ProviderResponseHistory" enable row level security;
revoke all on public."Customs_ProviderResponseHistory" from public, anon, authenticated, service_role;
grant select on public."Customs_ProviderResponseHistory" to authenticated, service_role;
create policy provider_response_read on public."Customs_ProviderResponseHistory"
  for select to authenticated using (public.customs_declaration_current_user_authorised(declaration_id, false));
create trigger provider_response_no_rewrite before update or delete
  on public."Customs_ProviderResponseHistory" for each row
  execute function public.customs_calculation_immutable();

create function public.customs_capture_provider_response() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new."ICUSS_CustomsID" is distinct from old."ICUSS_CustomsID" then
    raise exception 'A submission response cannot be reassigned to another declaration.' using errcode = '22023';
  end if;
  if new."ICUSS_CustomsID" is null or
    (new."ICUSS_ResponseStatusCode" is null and coalesce(new."ICUSS_ResponsePayloadJSON", '{}'::jsonb) = '{}'::jsonb)
    then return new; end if;
  if tg_op = 'UPDATE' then
    if row(new."ICUSS_ResponseStatusCode",new."ICUSS_ResponsePayloadJSON",new."ICUSS_Status",
      new."ICUSS_RequestPayloadJSON",new."ICUSS_DeclarationSnapshotJSON") is not distinct from
      row(old."ICUSS_ResponseStatusCode",old."ICUSS_ResponsePayloadJSON",old."ICUSS_Status",
      old."ICUSS_RequestPayloadJSON",old."ICUSS_DeclarationSnapshotJSON") then return new; end if;
  end if;
  insert into public."Customs_ProviderResponseHistory"(
    declaration_id,submission_id,source_updated_at,capture_kind,response_status,
    submission_status,response_payload,request_payload,declaration_snapshot)
  values(new."ICUSS_CustomsID",new."ICUSS_id",new."ICUSS_UpdatedAt",'observed',
    new."ICUSS_ResponseStatusCode",new."ICUSS_Status",coalesce(new."ICUSS_ResponsePayloadJSON",'{}'::jsonb),
    new."ICUSS_RequestPayloadJSON",new."ICUSS_DeclarationSnapshotJSON");
  return new;
end;
$$;
revoke all on function public.customs_capture_provider_response() from public, anon, authenticated;
create trigger customs_provider_response_capture after insert or update
  on public."ICUS_Submissions" for each row execute function public.customs_capture_provider_response();

-- Do not invent historical receipt times or claim earlier overwritten responses
-- were recovered: this is explicitly the snapshot available at migration time.
insert into public."Customs_ProviderResponseHistory"(
  declaration_id,submission_id,source_updated_at,capture_kind,response_status,
  submission_status,response_payload,request_payload,declaration_snapshot)
select "ICUSS_CustomsID","ICUSS_id","ICUSS_UpdatedAt",'existing-snapshot',
  "ICUSS_ResponseStatusCode","ICUSS_Status",coalesce("ICUSS_ResponsePayloadJSON",'{}'::jsonb),
  "ICUSS_RequestPayloadJSON","ICUSS_DeclarationSnapshotJSON"
from public."ICUS_Submissions" where "ICUSS_CustomsID" is not null
  and ("ICUSS_ResponseStatusCode" is not null or coalesce("ICUSS_ResponsePayloadJSON",'{}'::jsonb) <> '{}'::jsonb);
commit;
