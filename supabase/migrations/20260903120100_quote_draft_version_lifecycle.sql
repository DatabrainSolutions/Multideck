-- Keep one mutable working draft per master quote and make submitted versions
-- immutable evidence. Customer responses continue to use the existing
-- `challenged` decision code internally, while the operator-facing lifecycle
-- is normalised to `changes_requested`.

begin;

alter table public."CusQuote_Versions"
  add column if not exists "CusQuoteVersion_IsSubmitted" boolean not null default false,
  add column if not exists "CusQuoteVersion_SubmittedAt" timestamptz,
  add column if not exists "CusQuoteVersion_SubmittedBy" uuid references public."cmp_Users"("User_ID") on delete set null;

-- Reconcile the versions already issued by the earlier workflow. This is
-- deliberately evidence-based: a response link or customer response proves
-- that the snapshot was submitted, while an accepted/declined quote header
-- proves the current snapshot was finalised by the earlier implementation.
update public."CusQuote_Versions" version
set
  "CusQuoteVersion_IsSubmitted" = true,
  "CusQuoteVersion_SubmittedAt" = coalesce(
    "CusQuoteVersion_SubmittedAt",
    (
      select min(link.created_at)
      from quote_api.customer_response_links link
      where link.quote_version_id = version."CusQuoteVersion_ID"
    ),
    (
      select min(response.created_at)
      from quote_api.customer_responses response
      where response.quote_version_id = version."CusQuoteVersion_ID"
    ),
    version."CusQuoteVersion_CreatedAt"
  ),
  "CusQuoteVersion_SubmittedBy" = coalesce(
    "CusQuoteVersion_SubmittedBy",
    (
      select link.created_by
      from quote_api.customer_response_links link
      where link.quote_version_id = version."CusQuoteVersion_ID"
      order by link.created_at
      limit 1
    ),
    "CusQuoteVersion_CreatedBy"
  ),
  "CusQuoteVersion_StatusCode" = case
    when exists (
      select 1 from quote_api.customer_responses response
      where response.quote_version_id = version."CusQuoteVersion_ID"
        and response.decision_code = 'accepted'
    ) then 'accepted'
    when exists (
      select 1 from quote_api.customer_responses response
      where response.quote_version_id = version."CusQuoteVersion_ID"
        and response.decision_code = 'declined'
    ) then 'declined'
    when exists (
      select 1 from quote_api.customer_responses response
      where response.quote_version_id = version."CusQuoteVersion_ID"
        and response.decision_code = 'challenged'
    ) then 'changes_requested'
    when version."CusQuoteVersion_StatusCode" in ('sent', 'accepted', 'declined') then version."CusQuoteVersion_StatusCode"
    else 'submitted'
  end
where
  exists (
    select 1 from quote_api.customer_response_links link
    where link.quote_version_id = version."CusQuoteVersion_ID"
  )
  or exists (
    select 1 from quote_api.customer_responses response
    where response.quote_version_id = version."CusQuoteVersion_ID"
  )
  or (
    version."CusQuoteVersion_IsCurrent"
    and exists (
      select 1 from public."CusQuote_Header" quote
      where quote."CusQuoteHeader_ID" = version."CusQuoteHeader_ID"
        and quote."CusQuoteHeader_LifecycleCode" in ('sent', 'accepted', 'declined', 'ghosted')
    )
  );

create or replace function quote_api.prevent_submitted_quote_version_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old."CusQuoteVersion_IsSubmitted" then
      raise exception 'Submitted quote versions are immutable.' using errcode = '22023';
    end if;
    return old;
  end if;

  if old."CusQuoteVersion_IsSubmitted" and (
    new."Company_ID" is distinct from old."Company_ID"
    or new."CusQuoteHeader_ID" is distinct from old."CusQuoteHeader_ID"
    or new."CusQuoteVersion_Number" is distinct from old."CusQuoteVersion_Number"
    or new."CusQuoteVersion_SnapshotJSON" is distinct from old."CusQuoteVersion_SnapshotJSON"
    or new."CusQuoteVersion_CreatedAt" is distinct from old."CusQuoteVersion_CreatedAt"
    or new."CusQuoteVersion_CreatedBy" is distinct from old."CusQuoteVersion_CreatedBy"
    or not new."CusQuoteVersion_IsSubmitted"
    or new."CusQuoteVersion_SubmittedAt" is distinct from old."CusQuoteVersion_SubmittedAt"
    or new."CusQuoteVersion_SubmittedBy" is distinct from old."CusQuoteVersion_SubmittedBy"
  ) then
    raise exception 'Submitted quote versions are immutable.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CusQuote_Versions_prevent_submitted_mutation" on public."CusQuote_Versions";
create trigger "TR_CusQuote_Versions_prevent_submitted_mutation"
before update or delete on public."CusQuote_Versions"
for each row execute function quote_api.prevent_submitted_quote_version_mutation();

revoke delete on table public."CusQuote_Versions" from public, anon, authenticated, service_role;
revoke all on function quote_api.prevent_submitted_quote_version_mutation() from public, anon, authenticated;

-- Keep the original implementation as a private compatibility helper. The
-- wrapper below reuses its validation and row projection, then collapses the
-- transient version it creates when the quote is still a draft.
alter function quote_api.save_quote(uuid, uuid, jsonb)
  rename to save_quote_legacy_20260903;

create or replace function quote_api.save_quote(
  caller_auth_user_id uuid,
  requested_quote_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_version_id uuid;
  prior_version_number integer;
  prior_version_is_submitted boolean := false;
  prior_lifecycle text;
  transient_version_id uuid;
  transient_version record;
  saved jsonb;
begin
  if requested_quote_id is not null then
    select quote."CusQuoteHeader_LifecycleCode"
      into prior_lifecycle
    from public."CusQuote_Header" quote
    where quote."CusQuoteHeader_ID" = requested_quote_id
      and not quote."CusQuoteHeader_IsDeleted";

    select version."CusQuoteVersion_ID",
      version."CusQuoteVersion_Number",
      version."CusQuoteVersion_IsSubmitted"
      into prior_version_id, prior_version_number, prior_version_is_submitted
    from public."CusQuote_Versions" version
    where version."CusQuoteHeader_ID" = requested_quote_id
      and version."CusQuoteVersion_IsCurrent"
    order by version."CusQuoteVersion_Number" desc
    limit 1;

    -- A quote in one of these states has already crossed a submission or
    -- customer-decision boundary, even when it was created by an older build
    -- before IsSubmitted was introduced.
    prior_version_is_submitted := coalesce(prior_version_is_submitted, false)
      or coalesce(prior_lifecycle in ('sent', 'accepted', 'declined', 'ghosted', 'changes_requested'), false)
      or exists (
        select 1
        from quote_api.customer_response_links link
        where link.quote_id = requested_quote_id
          and link.quote_version_id = prior_version_id
      )
      or exists (
        select 1
        from quote_api.customer_responses response
        where response.quote_id = requested_quote_id
          and response.quote_version_id = prior_version_id
      );
  end if;

  saved := quote_api.save_quote_legacy_20260903(caller_auth_user_id, requested_quote_id, payload);
  transient_version_id := nullif(saved ->> 'versionId', '')::uuid;

  if requested_quote_id is not null
     and prior_version_id is not null
     and not prior_version_is_submitted
     and transient_version_id is not null
     and transient_version_id <> prior_version_id then
    select version.* into strict transient_version
    from public."CusQuote_Versions" version
    where version."CusQuoteVersion_ID" = transient_version_id;

    -- The legacy helper has already applied the validated payload to the
    -- header, lines and parties. Persist that same payload on the existing
    -- mutable draft and remove only the helper's transient history row.
    update public."CusQuote_Versions"
    set "CusQuoteVersion_IsCurrent" = false
    where "CusQuoteVersion_ID" = transient_version_id;

    update public."CusQuote_Versions"
    set "CusQuoteVersion_SnapshotJSON" = transient_version."CusQuoteVersion_SnapshotJSON",
        "CusQuoteVersion_StatusCode" = 'draft',
        "CusQuoteVersion_IsCurrent" = true
    where "CusQuoteVersion_ID" = prior_version_id;

    delete from public."CusQuote_Events"
    where "CusQuoteVersion_ID" = transient_version_id
      and "CusQuoteEvent_TypeCode" in ('created', 'saved');

    delete from public."CusQuote_Versions"
    where "CusQuoteVersion_ID" = transient_version_id;

    return saved || jsonb_build_object(
      'versionId', prior_version_id,
      'versionNumber', prior_version_number,
      'versionState', 'draft'
    );
  end if;

  if transient_version_id is not null and not prior_version_is_submitted then
    update public."CusQuote_Versions"
    set "CusQuoteVersion_StatusCode" = 'draft',
        "CusQuoteVersion_IsSubmitted" = false,
        "CusQuoteVersion_SubmittedAt" = null,
        "CusQuoteVersion_SubmittedBy" = null
    where "CusQuoteVersion_ID" = transient_version_id;
    return saved || jsonb_build_object('versionState', 'draft');
  end if;

  -- A new version created after a submitted version is a mutable draft. It
  -- gets a new number, but is not historical until it is issued.
  if transient_version_id is not null then
    update public."CusQuote_Versions"
    set "CusQuoteVersion_StatusCode" = 'draft',
        "CusQuoteVersion_IsSubmitted" = false,
        "CusQuoteVersion_SubmittedAt" = null,
        "CusQuoteVersion_SubmittedBy" = null
    where "CusQuoteVersion_ID" = transient_version_id;
    return saved || jsonb_build_object('versionState', 'draft');
  end if;

  return saved;
end;
$$;

revoke all on function quote_api.save_quote_legacy_20260903(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function quote_api.save_quote(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function quote_api.save_quote(uuid, uuid, jsonb) to service_role;

-- The public workflow boundary already converts accepted quotes into a revised
-- cycle before saving. Treat a customer change request the same way so the new
-- mutable version is clearly a revision, while preserving the submitted
-- version and response as immutable evidence.
create or replace function public.quote_workflow_save_quote(
  caller_auth_user_id uuid,
  requested_quote_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if requested_quote_id is not null
     and quote_api.has_permission(caller_auth_user_id, 'Quotes.Write')
     and exists (
       select 1
       from public."CusQuote_Header" quote
       join public."cmp_Offices" office
         on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
       join public."cmp_Users" app_user
         on app_user."Auth_User_ID" = caller_auth_user_id
        and app_user."Company_ID" = office."Company_ID"
        and app_user."User_AccessStatus" = 'active'
       where quote."CusQuoteHeader_ID" = requested_quote_id
         and quote."CusQuoteHeader_LifecycleCode" in ('accepted', 'changes_requested')
         and not quote."CusQuoteHeader_IsDeleted"
     ) then
    update public."CusQuote_Header" set
      "CusQuoteHeader_LifecycleCode" = 'revised',
      "CusQuoteHeader_Status" = 1
    where "CusQuoteHeader_ID" = requested_quote_id;
  end if;

  return quote_api.save_quote(caller_auth_user_id, requested_quote_id, payload);
end;
$$;

revoke all on function public.quote_workflow_save_quote(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.quote_workflow_save_quote(uuid, uuid, jsonb) to service_role;

-- Issuing a customer link is the submission boundary. This also covers
-- reissues and prevents a later save from mutating the linked snapshot.
create or replace function quote_api.mark_quote_version_submitted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public."CusQuote_Versions"
  set "CusQuoteVersion_IsSubmitted" = true,
      "CusQuoteVersion_SubmittedAt" = coalesce("CusQuoteVersion_SubmittedAt", new.created_at),
      "CusQuoteVersion_SubmittedBy" = coalesce("CusQuoteVersion_SubmittedBy", new.created_by),
      "CusQuoteVersion_StatusCode" = case
        when "CusQuoteVersion_StatusCode" in ('accepted', 'declined', 'changes_requested') then "CusQuoteVersion_StatusCode"
        else 'submitted'
      end
  where "CusQuoteVersion_ID" = new.quote_version_id
    and "CusQuoteHeader_ID" = new.quote_id;

  if not found then
    raise exception 'The quote version for this response link is unavailable.' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

drop trigger if exists "TR_CusQuote_ResponseLinks_mark_version_submitted" on quote_api.customer_response_links;
create trigger "TR_CusQuote_ResponseLinks_mark_version_submitted"
after insert on quote_api.customer_response_links
for each row execute function quote_api.mark_quote_version_submitted();

revoke all on function quote_api.mark_quote_version_submitted() from public, anon, authenticated;

-- Customer change requests are a distinct operator-facing state. The
-- constraint trigger runs at transaction end so it wins over the legacy
-- response function's temporary `revised` assignment without changing the
-- response API contract in the same deployment.
create or replace function quote_api.sync_quote_after_customer_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lifecycle_value text := case new.decision_code
    when 'accepted' then 'accepted'
    when 'declined' then 'declined'
    else 'changes_requested'
  end;
  version_status text := case new.decision_code
    when 'accepted' then 'accepted'
    when 'declined' then 'declined'
    else 'changes_requested'
  end;
begin
  update public."CusQuote_Versions"
  set "CusQuoteVersion_IsSubmitted" = true,
      "CusQuoteVersion_SubmittedAt" = coalesce("CusQuoteVersion_SubmittedAt", new.created_at),
      "CusQuoteVersion_StatusCode" = version_status
  where "CusQuoteVersion_ID" = new.quote_version_id
    and "CusQuoteHeader_ID" = new.quote_id;

  update public."CusQuote_Header" quote
  set "CusQuoteHeader_LifecycleCode" = lifecycle_value,
      "CusQuoteHeader_Status" = case lifecycle_value when 'accepted' then 5 when 'declined' then 6 else 1 end,
      "CusQuoteHeader_AcceptedVersionID" = coalesce(
        (
          select response.quote_version_id
          from quote_api.customer_responses response
          where response.quote_id = new.quote_id
            and response.decision_code = 'accepted'
          order by response.created_at desc
          limit 1
        ),
        quote."CusQuoteHeader_AcceptedVersionID"
      ),
      "CusQuoteHeader_LastEditedDate" = now()
  where quote."CusQuoteHeader_ID" = new.quote_id;

  return new;
end;
$$;

drop trigger if exists "TR_CusQuote_CustomerResponses_sync_quote_state" on quote_api.customer_responses;
create constraint trigger "TR_CusQuote_CustomerResponses_sync_quote_state"
after insert on quote_api.customer_responses
deferrable initially deferred
for each row execute function quote_api.sync_quote_after_customer_response();

revoke all on function quote_api.sync_quote_after_customer_response() from public, anon, authenticated;

commit;
