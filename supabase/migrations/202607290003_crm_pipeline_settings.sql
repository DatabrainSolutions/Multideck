-- Company-wide CRM pipeline configuration.
-- Pipelines, stage order, and lead field settings were previously client-side defaults, so every
-- operator saw their own copy. Storing them against cmp_Company.Company_ID means one shared,
-- durable configuration per workspace. Reads are open to the whole company; writes go through the
-- API, which gates them on Settings.Manage.

begin;

create table if not exists public."CRM_Pipelines" (
  "CRMPipeline_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CRMPipeline_Name" varchar not null,
  "CRMPipeline_Owner" varchar,
  "CRMPipeline_Automation" text,
  "CRMPipeline_SortOrder" integer not null default 0,
  "Created_At" timestamptz not null default now(),
  "Updated_At" timestamptz not null default now(),
  "Created_By_User_ID" uuid references public."cmp_Users"("User_ID"),
  "Updated_By_User_ID" uuid references public."cmp_Users"("User_ID"),
  "Is_Deleted" boolean not null default false
);

create table if not exists public."CRM_PipelineStages" (
  "CRMPipelineStage_ID" uuid primary key default gen_random_uuid(),
  -- Denormalised from the parent so row level security never has to join back to the pipeline.
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CRMPipeline_ID" uuid not null references public."CRM_Pipelines"("CRMPipeline_ID") on delete cascade,
  "CRMPipelineStage_Name" varchar not null,
  "CRMPipelineStage_Tone" varchar not null default 'neutral',
  "CRMPipelineStage_EntryRule" text,
  "CRMPipelineStage_ProbabilityPct" numeric(5, 2) not null default 0,
  "CRMPipelineStage_SortOrder" integer not null default 0,
  -- Flags rather than foreign keys on the pipeline, so renaming or reordering a stage cannot
  -- orphan the workspace's default entry point or conversion trigger.
  "CRMPipelineStage_IsDefaultEntry" boolean not null default false,
  "CRMPipelineStage_IsConversion" boolean not null default false,
  "Created_At" timestamptz not null default now(),
  "Updated_At" timestamptz not null default now(),
  "Is_Deleted" boolean not null default false,
  constraint "CK_CRM_PipelineStages_Tone" check ("CRMPipelineStage_Tone" in ('green', 'amber', 'red', 'blue', 'neutral', 'teal')),
  constraint "CK_CRM_PipelineStages_Probability" check ("CRMPipelineStage_ProbabilityPct" between 0 and 100)
);

create table if not exists public."CRM_LeadFieldSettings" (
  "CRMLeadField_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null references public."cmp_Company"("Company_ID") on delete cascade,
  "CRMLeadField_Label" varchar not null,
  "CRMLeadField_TypeCode" varchar not null default 'Dropdown',
  "CRMLeadField_OptionsJSON" jsonb not null default '[]'::jsonb,
  "CRMLeadField_ActiveOptionsJSON" jsonb not null default '[]'::jsonb,
  "CRMLeadField_SortOrder" integer not null default 0,
  "Created_At" timestamptz not null default now(),
  "Updated_At" timestamptz not null default now(),
  "Updated_By_User_ID" uuid references public."cmp_Users"("User_ID"),
  "Is_Deleted" boolean not null default false
);

create unique index if not exists "UX_CRM_Pipelines_Company_Name"
  on public."CRM_Pipelines"("Company_ID", "CRMPipeline_Name")
  where "Is_Deleted" = false;
create index if not exists "IX_CRM_Pipelines_Company_Order"
  on public."CRM_Pipelines"("Company_ID", "CRMPipeline_SortOrder")
  where "Is_Deleted" = false;

create unique index if not exists "UX_CRM_PipelineStages_Pipeline_Name"
  on public."CRM_PipelineStages"("CRMPipeline_ID", "CRMPipelineStage_Name")
  where "Is_Deleted" = false;
create index if not exists "IX_CRM_PipelineStages_Pipeline_Order"
  on public."CRM_PipelineStages"("CRMPipeline_ID", "CRMPipelineStage_SortOrder")
  where "Is_Deleted" = false;
-- A pipeline has at most one default entry stage and one conversion stage.
create unique index if not exists "UX_CRM_PipelineStages_DefaultEntry"
  on public."CRM_PipelineStages"("CRMPipeline_ID")
  where "CRMPipelineStage_IsDefaultEntry" = true and "Is_Deleted" = false;
create unique index if not exists "UX_CRM_PipelineStages_Conversion"
  on public."CRM_PipelineStages"("CRMPipeline_ID")
  where "CRMPipelineStage_IsConversion" = true and "Is_Deleted" = false;

create unique index if not exists "UX_CRM_LeadFieldSettings_Company_Label"
  on public."CRM_LeadFieldSettings"("Company_ID", "CRMLeadField_Label")
  where "Is_Deleted" = false;

alter table public."CRM_Pipelines" enable row level security;
alter table public."CRM_PipelineStages" enable row level security;
alter table public."CRM_LeadFieldSettings" enable row level security;

-- Read-only for signed-in staff. Every write path is the Multideck API, which checks
-- Settings.Manage before touching these tables.
grant select on public."CRM_Pipelines", public."CRM_PipelineStages", public."CRM_LeadFieldSettings" to authenticated;

drop policy if exists "Users can read their company CRM pipelines" on public."CRM_Pipelines";
create policy "Users can read their company CRM pipelines"
on public."CRM_Pipelines"
for select
to authenticated
using (
  "Company_ID" in (
    select "Company_ID"
    from public."cmp_Users"
    where "Auth_User_ID" = (select auth.uid())
  )
);

drop policy if exists "Users can read their company CRM pipeline stages" on public."CRM_PipelineStages";
create policy "Users can read their company CRM pipeline stages"
on public."CRM_PipelineStages"
for select
to authenticated
using (
  "Company_ID" in (
    select "Company_ID"
    from public."cmp_Users"
    where "Auth_User_ID" = (select auth.uid())
  )
);

drop policy if exists "Users can read their company CRM lead fields" on public."CRM_LeadFieldSettings";
create policy "Users can read their company CRM lead fields"
on public."CRM_LeadFieldSettings"
for select
to authenticated
using (
  "Company_ID" in (
    select "Company_ID"
    from public."cmp_Users"
    where "Auth_User_ID" = (select auth.uid())
  )
);

-- Give every existing company the starting configuration the UI used to hardcode, so the editor
-- opens with real rows instead of an empty canvas. Companies that already have pipelines are left
-- untouched, which keeps this migration safe to re-run.
do $$
declare
  target_company uuid;
  new_pipeline uuid;
begin
  for target_company in select "Company_ID" from public."cmp_Company" loop
    if not exists (
      select 1 from public."CRM_Pipelines"
      where "Company_ID" = target_company and "Is_Deleted" = false
    ) then
      insert into public."CRM_Pipelines" ("Company_ID", "CRMPipeline_Name", "CRMPipeline_Owner", "CRMPipeline_Automation", "CRMPipeline_SortOrder")
      values (target_company, 'Commercial pipeline', 'Elena Moreno', 'Create customer handoff when a lead reaches Committed.', 0)
      returning "CRMPipeline_ID" into new_pipeline;

      insert into public."CRM_PipelineStages"
        ("Company_ID", "CRMPipeline_ID", "CRMPipelineStage_Name", "CRMPipelineStage_Tone", "CRMPipelineStage_EntryRule", "CRMPipelineStage_ProbabilityPct", "CRMPipelineStage_SortOrder", "CRMPipelineStage_IsDefaultEntry", "CRMPipelineStage_IsConversion")
      values
        (target_company, new_pipeline, 'Qualifying', 'blue', 'Inbound lead, lane fit, or trial account needs triage.', 0, 0, true, false),
        (target_company, new_pipeline, 'Quoted', 'teal', 'Rates sent and customer is comparing options.', 25, 1, false, false),
        (target_company, new_pipeline, 'Negotiating', 'amber', 'Commercial terms, service levels, or renewal margin in review.', 75, 2, false, false),
        (target_company, new_pipeline, 'Committed', 'green', 'Ready to become a Multideck customer record.', 100, 3, false, true);

      insert into public."CRM_Pipelines" ("Company_ID", "CRMPipeline_Name", "CRMPipeline_Owner", "CRMPipeline_Automation", "CRMPipeline_SortOrder")
      values (target_company, 'Renewal pipeline', 'Julia Lee', 'Open a customer review task when renewal risk turns amber.', 1)
      returning "CRMPipeline_ID" into new_pipeline;

      insert into public."CRM_PipelineStages"
        ("Company_ID", "CRMPipeline_ID", "CRMPipelineStage_Name", "CRMPipelineStage_Tone", "CRMPipelineStage_EntryRule", "CRMPipelineStage_ProbabilityPct", "CRMPipelineStage_SortOrder", "CRMPipelineStage_IsDefaultEntry", "CRMPipelineStage_IsConversion")
      values
        (target_company, new_pipeline, 'Review', 'neutral', 'Customer health and lane mix checked.', 0, 0, true, false),
        (target_company, new_pipeline, 'Commercials', 'amber', 'Pricing, margin, and service recovery reviewed.', 50, 1, false, false),
        (target_company, new_pipeline, 'Renewed', 'green', 'Renewal accepted and operating defaults updated.', 100, 2, false, true);
    end if;

    if not exists (
      select 1 from public."CRM_LeadFieldSettings"
      where "Company_ID" = target_company and "Is_Deleted" = false
    ) then
      insert into public."CRM_LeadFieldSettings"
        ("Company_ID", "CRMLeadField_Label", "CRMLeadField_TypeCode", "CRMLeadField_OptionsJSON", "CRMLeadField_ActiveOptionsJSON", "CRMLeadField_SortOrder")
      values
        (target_company, 'Lead source', 'Dropdown',
          '["Inbound email", "Referral", "Existing customer", "Trade lane", "Website"]'::jsonb,
          '["Inbound email"]'::jsonb, 0),
        (target_company, 'Services needed', 'Multi-select dropdown',
          '["Ocean", "Air", "Customs", "Warehousing", "Insurance"]'::jsonb,
          '["Ocean", "Customs"]'::jsonb, 1),
        (target_company, 'Buying committee', 'Multi-select dropdown',
          '["Decision maker", "Finance", "Operations", "Broker", "Warehouse"]'::jsonb,
          '["Decision maker", "Finance"]'::jsonb, 2),
        (target_company, 'Conversion trigger', 'Dropdown',
          '["Committed stage", "Quote accepted", "First booking created", "Manual approval"]'::jsonb,
          '["Committed stage"]'::jsonb, 3);
    end if;
  end loop;
end $$;

commit;
