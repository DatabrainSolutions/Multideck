-- Repair legacy function dependencies found while rehearsing the first clean
-- customer installation. These changes are additive and retain every existing
-- function signature so older callers continue to fail closed behind the
-- existing execution grants.

alter table public."CRM_QuoteFollowups"
  add column if not exists "CRMQF_CusQuoteRevID" uuid;

alter table public."RATE_RateRequests"
  add column if not exists "RATERequest_CusQuoteRevID" uuid;

alter table public."CRM_OpportunityQuoteLinks"
  add column if not exists "CRMOpptyQuote_CusQuoteRevID" uuid,
  add column if not exists "CRMOpptyQuote_CostOptID" uuid,
  add column if not exists "CRMOpptyQuote_RevenueOptID" uuid,
  add column if not exists "CRMOpptyQuote_CostRevenueLinkID" uuid;

create table if not exists public."CusQuote_CostRevenueLinks" (
  "CQCRL_ID" uuid primary key default gen_random_uuid(),
  "CQCRL_CostOptID" uuid,
  "CQCRL_RevenueOptID" uuid,
  "CQCRL_CreatedAt" timestamptz not null default now()
);

alter table public."CusQuote_CostRevenueLinks" enable row level security;
revoke all on table public."CusQuote_CostRevenueLinks" from public, anon, authenticated;
grant select, insert, update, delete on table public."CusQuote_CostRevenueLinks" to service_role;

-- A real staging relation makes the reference synchroniser statically
-- verifiable. A global advisory lock below keeps each short-lived plan private
-- to one invocation, and the function clears the plan before and after use.
create unlogged table if not exists quote_api.multideck_reference_sync_plan (
  reference_kind text not null,
  source_id uuid not null,
  old_reference text,
  new_reference text not null,
  primary key (reference_kind, source_id)
);

revoke all on table quote_api.multideck_reference_sync_plan from public, anon, authenticated;
grant select, insert, update, delete on table quote_api.multideck_reference_sync_plan to service_role;

do $migration$
declare
  definition text;
begin
  select pg_get_functiondef(proc.oid)
  into strict definition
  from pg_proc proc
  join pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'CRM_CreatePersonalMessageDraft';

  definition := replace(
    definition,
    'encode(digest(coalesce(p_body_text, ''''), ''sha256''), ''hex'')',
    'encode(extensions.digest(coalesce(p_body_text, ''''), ''sha256''), ''hex'')'
  );
  execute definition;

  select pg_get_functiondef(proc.oid)
  into strict definition
  from pg_proc proc
  join pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'TCE_AddScreeningSubject';

  definition := replace(definition, 'WHERE "Org_ID" = p_org_id', 'WHERE "Org_id" = p_org_id');
  execute definition;

  select pg_get_functiondef(proc.oid)
  into strict definition
  from pg_proc proc
  join pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'CRM_ConvertLeadToOpportunity';

  definition := replace(definition, 'RETURNING "Org_ID" INTO v_org_id', 'RETURNING "Org_id" INTO v_org_id');
  definition := replace(definition, 'WHERE "Org_ID" = v_org_id', 'WHERE "Org_id" = v_org_id');
  execute definition;

  select pg_get_functiondef(proc.oid)
  into strict definition
  from pg_proc proc
  join pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'booking_api'
    and proc.proname = 'send_to_customs';

  definition := replace(
    definition,
    'on conflict (declaration_id, user_id) do update',
    'on conflict on constraint customs_declaration_grants_pkey do update'
  );
  execute definition;

  select pg_get_functiondef(proc.oid)
  into strict definition
  from pg_proc proc
  join pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'quote_api'
    and proc.proname = 'synchronise_company_references';

  definition := replace(
    definition,
    'pg_advisory_xact_lock(hashtextextended(workspace_company_id::text || '':reference-sync'', 0))',
    'pg_advisory_xact_lock(hashtextextended(''multideck:reference-sync'', 0))'
  );
  definition := replace(
    definition,
    'create temp table if not exists pg_temp.multideck_reference_sync_plan (
    reference_kind text not null,
    source_id uuid not null,
    old_reference text,
    new_reference text not null,
    primary key (reference_kind, source_id)
  ) on commit drop;
  truncate pg_temp.multideck_reference_sync_plan;',
    'delete from quote_api.multideck_reference_sync_plan;'
  );
  definition := replace(definition, 'pg_temp.multideck_reference_sync_plan', 'quote_api.multideck_reference_sync_plan');
  definition := replace(
    definition,
    'where sequence.company_id = workspace_company_id;
end;',
    'where sequence.company_id = workspace_company_id;
  delete from quote_api.multideck_reference_sync_plan;
end;'
  );
  execute definition;
end;
$migration$;
