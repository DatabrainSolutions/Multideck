begin;

create index if not exists "IX_CRM_CallEntityLinks_confirmed_target"
  on public."CRM_CallEntityLinks" (
    "CRMCallEntity_TargetTable",
    "CRMCallEntity_TargetID",
    "CRMCallEntity_CallReviewID"
  )
  where "CRMCallEntity_IsConfirmed" = true;

create or replace function public._multideck_phone_call_sync_confirmed_entity_links()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_review_id uuid;
  v_is_approved_match boolean := false;
begin
  select review."CRMCallReview_ID"
  into v_review_id
  from public."CRM_CallReviews" review
  where review."CRMCallReview_CommCallID" = new."CommCall_ID";

  if v_review_id is null then
    return new;
  end if;

  v_is_approved_match := new."CommCall_MatchStatusCode" = 'matched'
    and new."CommCall_MatchMethodCode" in (
      'user_review',
      'approved_action',
      'approved_action_edited'
    );

  -- Confirmed relationship rows mirror the canonical approved match exactly.
  -- Unconfirmed extraction candidates remain intact for the review rail.
  delete from public."CRM_CallEntityLinks" link
  where link."CRMCallEntity_CallReviewID" = v_review_id
    and link."CRMCallEntity_IsConfirmed" = true
    and link."CRMCallEntity_TargetTable" in (
      'Org_Master',
      'Org_Contacts',
      'CRM_Leads'
    );

  if not v_is_approved_match then
    return new;
  end if;

  if new."CommCall_MatchedOrgID" is not null then
    insert into public."CRM_CallEntityLinks" (
      "CRMCallEntity_CallReviewID",
      "CRMCallEntity_EntityType",
      "CRMCallEntity_EntityValue",
      "CRMCallEntity_TargetTable",
      "CRMCallEntity_TargetID",
      "CRMCallEntity_ConfidenceScore",
      "CRMCallEntity_IsConfirmed"
    ) values (
      v_review_id,
      'company',
      new."CommCall_MatchedOrgID"::text,
      'Org_Master',
      new."CommCall_MatchedOrgID",
      1,
      true
    );
  end if;

  if new."CommCall_MatchedContactID" is not null then
    insert into public."CRM_CallEntityLinks" (
      "CRMCallEntity_CallReviewID",
      "CRMCallEntity_EntityType",
      "CRMCallEntity_EntityValue",
      "CRMCallEntity_TargetTable",
      "CRMCallEntity_TargetID",
      "CRMCallEntity_ConfidenceScore",
      "CRMCallEntity_IsConfirmed"
    ) values (
      v_review_id,
      'contact',
      new."CommCall_MatchedContactID"::text,
      'Org_Contacts',
      new."CommCall_MatchedContactID",
      1,
      true
    );
  end if;

  if new."CommCall_MatchedLeadID" is not null then
    insert into public."CRM_CallEntityLinks" (
      "CRMCallEntity_CallReviewID",
      "CRMCallEntity_EntityType",
      "CRMCallEntity_EntityValue",
      "CRMCallEntity_TargetTable",
      "CRMCallEntity_TargetID",
      "CRMCallEntity_ConfidenceScore",
      "CRMCallEntity_IsConfirmed"
    ) values (
      v_review_id,
      'lead',
      new."CommCall_MatchedLeadID"::text,
      'CRM_Leads',
      new."CommCall_MatchedLeadID",
      1,
      true
    );
  end if;

  return new;
end;
$$;

revoke all on function public._multideck_phone_call_sync_confirmed_entity_links()
  from public, anon, authenticated, service_role;

drop trigger if exists "TR_Comm_CallLogs_sync_confirmed_entity_links"
  on public."Comm_CallLogs";
create trigger "TR_Comm_CallLogs_sync_confirmed_entity_links"
after insert or update of
  "CommCall_MatchStatusCode",
  "CommCall_MatchMethodCode",
  "CommCall_MatchedOrgID",
  "CommCall_MatchedContactID",
  "CommCall_MatchedLeadID"
on public."Comm_CallLogs"
for each row
execute function public._multideck_phone_call_sync_confirmed_entity_links();

-- Backfill only the three match methods that already passed an explicit review
-- or approved action. Candidate/fuzzy/unmatched records are intentionally absent.
insert into public."CRM_CallEntityLinks" (
  "CRMCallEntity_CallReviewID",
  "CRMCallEntity_EntityType",
  "CRMCallEntity_EntityValue",
  "CRMCallEntity_TargetTable",
  "CRMCallEntity_TargetID",
  "CRMCallEntity_ConfidenceScore",
  "CRMCallEntity_IsConfirmed"
)
select
  review."CRMCallReview_ID",
  source.entity_type,
  source.target_id::text,
  source.target_table,
  source.target_id,
  1,
  true
from public."Comm_CallLogs" call
join public."CRM_CallReviews" review
  on review."CRMCallReview_CommCallID" = call."CommCall_ID"
cross join lateral (
  values
    ('company'::varchar, 'Org_Master'::varchar, call."CommCall_MatchedOrgID"),
    ('contact'::varchar, 'Org_Contacts'::varchar, call."CommCall_MatchedContactID"),
    ('lead'::varchar, 'CRM_Leads'::varchar, call."CommCall_MatchedLeadID")
) source(entity_type, target_table, target_id)
where call."CommCall_MatchStatusCode" = 'matched'
  and call."CommCall_MatchMethodCode" in (
    'user_review',
    'approved_action',
    'approved_action_edited'
  )
  and source.target_id is not null
  and not exists (
    select 1
    from public."CRM_CallEntityLinks" existing
    where existing."CRMCallEntity_CallReviewID" = review."CRMCallReview_ID"
      and existing."CRMCallEntity_TargetTable" = source.target_table
      and existing."CRMCallEntity_TargetID" = source.target_id
      and existing."CRMCallEntity_IsConfirmed" = true
  );

comment on function public._multideck_phone_call_sync_confirmed_entity_links() is
  'Mirrors only operator-reviewed or approved phone-call CRM matches into confirmed relationship rows for Lead and Company record views.';

commit;
