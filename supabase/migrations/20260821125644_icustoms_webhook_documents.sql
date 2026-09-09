-- iCustoms owns the accepted declaration document. Multideck receives the
-- provider notification and PDF through one public, secret-path Edge Function,
-- records every delivery idempotently, and serves only previously stored files.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'icustoms-webhook-captures',
  'icustoms-webhook-captures',
  false,
  52428800,
  array[
    'application/json',
    'application/octet-stream',
    'application/pdf',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'text/plain'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public."ICUS_WebhookEvents"
  add column if not exists "ICUSWH_CorrelationID" character varying(160),
  add column if not exists "ICUSWH_BodySHA256" character(64),
  add column if not exists "ICUSWH_ContentType" character varying(160),
  add column if not exists "ICUSWH_BodySizeBytes" integer,
  add column if not exists "ICUSWH_RawStorageBucket" text,
  add column if not exists "ICUSWH_RawStoragePath" text,
  add column if not exists "ICUSWH_SubmissionID" uuid references public."ICUS_Submissions"("ICUSS_id") on delete set null,
  add column if not exists "ICUSWH_DocumentSHA256" character(64),
  add column if not exists "ICUSWH_NotificationID" uuid references public."Comm_Notifications"("CommNotif_ID") on delete set null;

alter table public."ICUS_WebhookEvents"
  drop constraint if exists "CK_ICUS_WebhookEvents_body_hash",
  add constraint "CK_ICUS_WebhookEvents_body_hash"
    check ("ICUSWH_BodySHA256" is null or "ICUSWH_BodySHA256" ~ '^[0-9a-f]{64}$'),
  drop constraint if exists "CK_ICUS_WebhookEvents_document_hash",
  add constraint "CK_ICUS_WebhookEvents_document_hash"
    check ("ICUSWH_DocumentSHA256" is null or "ICUSWH_DocumentSHA256" ~ '^[0-9a-f]{64}$'),
  drop constraint if exists "CK_ICUS_WebhookEvents_body_size",
  add constraint "CK_ICUS_WebhookEvents_body_size"
    check ("ICUSWH_BodySizeBytes" is null or "ICUSWH_BodySizeBytes" between 0 and 52428800);

create unique index if not exists "UX_ICUS_WebhookEvents_delivery"
  on public."ICUS_WebhookEvents" (
    "ICUSWH_ApiConnectionID",
    coalesce(nullif("ICUSWH_EventID", ''), "ICUSWH_BodySHA256")
  );
create index if not exists "IX_ICUS_WebhookEvents_correlation"
  on public."ICUS_WebhookEvents" ("ICUSWH_CorrelationID", "ICUSWH_ReceivedAt" desc);

alter table public."ICUS_WebhookEvents" enable row level security;
revoke all on table public."ICUS_WebhookEvents" from public, anon, authenticated;
grant all on table public."ICUS_WebhookEvents" to service_role;

comment on table public."ICUS_WebhookEvents" is
  'Service-role-only iCustoms delivery ledger. Full capture bodies are private Storage objects; JSON columns must contain only bounded, redacted evidence.';
comment on column public."ICUS_WebhookEvents"."ICUSWH_SignatureVerified" is
  'True only after the tenant-specific callback-path secret has passed constant-time validation.';
comment on column public."ICUS_WebhookEvents"."ICUSWH_RawStoragePath" is
  'Private capture object used to bind and audit the provider contract. Never a signed URL.';

alter table public."Customs_DeclarationDocuments"
  add column if not exists "CUSTD_SourceCode" text not null default 'multideck_carbone',
  add column if not exists "CUSTD_ProviderEventID" text,
  add column if not exists "CUSTD_ProviderEnvironment" text not null default 'sandbox',
  add column if not exists "CUSTD_ReceivedAt" timestamptz;

update public."Customs_DeclarationDocuments"
set "CUSTD_ReceivedAt" = coalesce("CUSTD_ReceivedAt", "CUSTD_CreatedAt"),
    "CUSTD_ProviderEnvironment" = case
      when "CUSTD_IsOfficial" then 'production'
      else coalesce(nullif("CUSTD_ProviderEnvironment", ''), 'sandbox')
    end
where "CUSTD_ReceivedAt" is null
   or ("CUSTD_IsOfficial" and "CUSTD_ProviderEnvironment" <> 'production');

alter table public."Customs_DeclarationDocuments"
  alter column "CUSTD_ReceivedAt" set not null,
  drop constraint if exists "CK_Customs_DeclarationDocuments_source",
  add constraint "CK_Customs_DeclarationDocuments_source"
    check ("CUSTD_SourceCode" in ('multideck_carbone', 'icustoms_webhook')),
  drop constraint if exists "CK_Customs_DeclarationDocuments_environment",
  add constraint "CK_Customs_DeclarationDocuments_environment"
    check ("CUSTD_ProviderEnvironment" in ('sandbox', 'production'));

create unique index if not exists "UX_Customs_DeclarationDocuments_provider_event"
  on public."Customs_DeclarationDocuments" ("CUSTD_ProviderEventID")
  where "CUSTD_SourceCode" = 'icustoms_webhook' and "CUSTD_ProviderEventID" is not null;

alter table public."Customs_Declarations"
  add column if not exists "CUST_DeclarationDocumentID" uuid
    references public."Customs_DeclarationDocuments"("CUSTD_ID") on delete restrict,
  add column if not exists "CUST_DeclarationDocumentFileName" text,
  add column if not exists "CUST_DeclarationDocumentMimeType" text,
  add column if not exists "CUST_DeclarationDocumentReceivedAt" timestamptz;

comment on column public."Customs_Declarations"."CUST_DeclarationDocumentID" is
  'Latest immutable declaration document received from iCustoms. Historical stored documents remain available.';

create unique index if not exists "UX_Comm_Notifications_icustoms_event"
  on public."Comm_Notifications" (("CommNotif_MetadataJSON" ->> 'provider_event_id'))
  where "CommNotif_LinkTypeCode" = 'icustoms_webhook'
    and nullif("CommNotif_MetadataJSON" ->> 'provider_event_id', '') is not null;

create unique index if not exists "UX_ICUS_SubmissionEvents_webhook_event"
  on public."ICUS_SubmissionEvents" (("ICUSE_EventPayloadJSON" ->> 'providerEventId'))
  where "ICUSE_EventType" in ('icustoms_webhook_notification', 'icustoms_webhook_document')
    and nullif("ICUSE_EventPayloadJSON" ->> 'providerEventId', '') is not null;

-- Document records are evidence. The webhook creates a new row for a new
-- provider delivery; no runtime path may rewrite or delete an existing row.
create or replace function public._multideck_customs_declaration_document_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Customs declaration document evidence is immutable.' using errcode = '55000';
end;
$$;

revoke all on function public._multideck_customs_declaration_document_immutable() from public, anon, authenticated;
drop trigger if exists "TR_Customs_DeclarationDocuments_immutable" on public."Customs_DeclarationDocuments";
create trigger "TR_Customs_DeclarationDocuments_immutable"
before update or delete on public."Customs_DeclarationDocuments"
for each row execute function public._multideck_customs_declaration_document_immutable();

create or replace function public._multideck_dexter_customs_declaration_watch_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company_id uuid;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb;
begin
  select actor."Company_ID" into v_company_id
  from public."cmp_Users" actor
  where actor."Auth_User_ID" = new."CUST_CreatedBy"
  order by actor."User_ID"
  limit 1;
  if v_company_id is null then return new; end if;

  if tg_op <> 'INSERT' then
    v_old := jsonb_build_object(
      'assignedUserId', old."CUST_AssignedUserID",
      'status', old."CUST_Status",
      'iCustomsStatus', old."CUST_iCustomsStatusSnapshot",
      'customsReference', old."CUST_CustomsReferenceNumber",
      'mrn', old."CUST_MasterReferenceNumber",
      'documentAvailable', old."CUST_DeclarationDocumentID" is not null,
      'documentReceivedAt', old."CUST_DeclarationDocumentReceivedAt",
      'destinationCountry', old."CUST_CountryOfDestinationCodeSnapshot",
      'invoiceAmount', old."CUST_InvoiceAmount",
      'currency', old."CUST_InvoiceCurrencyCodeSnapshot",
      'updatedAt', old."CUST_UpdatedAt"
    );
  end if;
  v_new := jsonb_build_object(
    'reference', coalesce(new."CUST_LocalReferenceNumber", new."CUST_id"::text),
    'sourceType', case when new."CUST_JobID" is null then 'standalone' else 'job_related' end,
    'jobId', new."CUST_JobID",
    'assignedUserId', new."CUST_AssignedUserID",
    'status', new."CUST_Status",
    'iCustomsStatus', new."CUST_iCustomsStatusSnapshot",
    'customsReference', new."CUST_CustomsReferenceNumber",
    'mrn', new."CUST_MasterReferenceNumber",
    'documentAvailable', new."CUST_DeclarationDocumentID" is not null,
    'documentReceivedAt', new."CUST_DeclarationDocumentReceivedAt",
    'destinationCountry', new."CUST_CountryOfDestinationCodeSnapshot",
    'invoiceAmount', new."CUST_InvoiceAmount",
    'currency', new."CUST_InvoiceCurrencyCodeSnapshot",
    'updatedAt', new."CUST_UpdatedAt"
  );

  if exists (
    select 1 from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CompanyID" = v_company_id
      and watch."AIDexterWatch_CapabilityCode" = 'customs_declarations'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and watch."AIDexterWatch_TargetID" = new."CUST_id"
  ) then
    insert into public."AI_DexterWatchSignals" (
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode",
      "AIDexterWatchSignal_SourceTable", "AIDexterWatchSignal_SourceID",
      "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    ) values (
      v_company_id, 'customs_declarations', tg_table_name, new."CUST_id", v_old, v_new
    );
  end if;
  return new;
end;
$$;

revoke all on function public._multideck_dexter_customs_declaration_watch_change() from public, anon, authenticated;

create or replace function public.multideck_dexter_domain_customs_declarations(
  p_company_id uuid,
  p_search text,
  p_take integer
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(row_data order by search_rank desc, sort_updated desc), '[]'::jsonb)
  from (
    select
      jsonb_strip_nulls(jsonb_build_object(
        'recordId', declaration."CUST_id",
        'sourceType', case when declaration."CUST_JobID" is null then 'standalone' else 'job_related' end,
        'jobId', declaration."CUST_JobID",
        'reference', coalesce(declaration."CUST_LocalReferenceNumber", declaration."CUST_id"::text),
        'traderReference', declaration."CUST_TraderReference",
        'ucr', declaration."CUST_UCR",
        'status', declaration."CUST_Status",
        'direction', declaration."CUST_Direction",
        'declarationKind', declaration."CUST_DeclarationKind",
        'jurisdiction', declaration."CUST_JurisdictionCode",
        'assignedUserId', declaration."CUST_AssignedUserID",
        'assignedUserName', coalesce(nullif(btrim(concat_ws(' ', assigned_user."User_Firstname", assigned_user."User_Lastname")), ''), assigned_user."User_Email"),
        'assignedUserEmail', assigned_user."User_Email",
        'destinationCountry', declaration."CUST_CountryOfDestinationCodeSnapshot",
        'invoiceAmount', declaration."CUST_InvoiceAmount",
        'currency', declaration."CUST_InvoiceCurrencyCodeSnapshot",
        'itemCount', coalesce(items.item_count, 0),
        'customsReference', declaration."CUST_CustomsReferenceNumber",
        'mrn', coalesce(latest_submission."ICUSS_MRN", declaration."CUST_MasterReferenceNumber"),
        'iCustomsStatus', declaration."CUST_iCustomsStatusSnapshot",
        'submissionStatus', latest_submission."ICUSS_Status",
        'submissionErrorCode', latest_submission."ICUSS_ErrorCode",
        'submissionErrorMessage', latest_submission."ICUSS_ErrorMessage",
        'submittedAt', latest_submission."ICUSS_SubmittedAt",
        'acknowledgedAt', latest_submission."ICUSS_AcknowledgedAt",
        'completedAt', latest_submission."ICUSS_CompletedAt",
        'documentAvailable', declaration."CUST_DeclarationDocumentID" is not null,
        'documentId', declaration."CUST_DeclarationDocumentID",
        'documentFileName', declaration."CUST_DeclarationDocumentFileName",
        'documentReceivedAt', declaration."CUST_DeclarationDocumentReceivedAt",
        'documentMimeType', declaration."CUST_DeclarationDocumentMimeType",
        'createdAt', declaration."CUST_CreatedAt",
        'updatedAt', declaration."CUST_UpdatedAt",
        'searchEvidence', evidence.value - 'matched'
      )) as row_data,
      coalesce((evidence.value->>'confidence')::numeric, 0) as search_rank,
      declaration."CUST_UpdatedAt" as sort_updated
    from public."Customs_Declarations" declaration
    left join public."cmp_Users" assigned_user
      on assigned_user."User_ID" = declaration."CUST_AssignedUserID"
    left join lateral (
      select count(*)::integer as item_count from public."Customs_Items" item
      where item."CUSTI_CustomsID" = declaration."CUST_id"
    ) items on true
    left join lateral (
      select submission.* from public."ICUS_Submissions" submission
      where submission."ICUSS_CustomsID" = declaration."CUST_id"
      order by submission."ICUSS_CreatedAt" desc, submission."ICUSS_id" desc limit 1
    ) latest_submission on true
    cross join lateral public._multideck_dexter_search_evidence(
      p_search,
      jsonb_build_object(
        'recordId', declaration."CUST_id",
        'reference', declaration."CUST_LocalReferenceNumber",
        'traderReference', declaration."CUST_TraderReference",
        'ucr', declaration."CUST_UCR",
        'status', declaration."CUST_Status",
        'direction', declaration."CUST_Direction",
        'assignedUserName', coalesce(nullif(btrim(concat_ws(' ', assigned_user."User_Firstname", assigned_user."User_Lastname")), ''), assigned_user."User_Email"),
        'assignedUserEmail', assigned_user."User_Email",
        'customsReference', declaration."CUST_CustomsReferenceNumber",
        'mrn', coalesce(latest_submission."ICUSS_MRN", declaration."CUST_MasterReferenceNumber")
      ),
      array['recordId', 'reference', 'traderReference', 'ucr', 'assignedUserEmail', 'customsReference', 'mrn']::text[]
    ) evidence(value)
    where not declaration."CUST_IsDeleted"
      and booking_api.customs_access(auth.uid(), declaration."CUST_id", false)
      and exists (
        select 1 from public."cmp_Users" actor
        where actor."Auth_User_ID" = auth.uid()
          and actor."Company_ID" = p_company_id
          and coalesce(actor."User_AccessStatus", 'active') = 'active'
      )
      and (evidence.value->>'matched')::boolean
    order by search_rank desc, declaration."CUST_UpdatedAt" desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) declarations;
$$;

revoke all on function public.multideck_dexter_domain_customs_declarations(uuid, text, integer)
  from public, anon, authenticated;

update public."sys_AIDexterDataDomains" set
  "AIDexterDomain_Description" = 'Authorised company Customs import and export declarations, including responsible user, iCustoms filing evidence, and declaration document availability and receipt time. Document binaries remain available only through the authenticated Customs workspace.',
  "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'customs_declarations';

update public."sys_AIDexterWatchCapabilities" set
  "AIDexterWatchCapability_Description" = 'Responsible user, status, reference, value, iCustoms status and declaration document availability changes for one exact authorised declaration.',
  "AIDexterWatchCapability_FieldsJSON" = (
    select coalesce(jsonb_agg(distinct field), '[]'::jsonb)
    from jsonb_array_elements(
      coalesce("AIDexterWatchCapability_FieldsJSON", '[]'::jsonb)
      || '["documentAvailable","documentReceivedAt"]'::jsonb
    ) as fields(field)
  ),
  "AIDexterWatchCapability_UpdatedAt" = now()
where "AIDexterWatchCapability_Code" = 'customs_declarations';

commit;
