-- Canonical CRM link columns are trusted by call lists, analytics, Dexter and
-- the confirmed relationship mirror. Keep them empty until an operator review
-- or an approved generated action has made the match explicit.

begin;

do $$
begin
  if exists (
    select 1
    from public."Comm_CallLogs" call
    where (
      call."CommCall_MatchedOrgID" is not null
      or call."CommCall_MatchedContactID" is not null
      or call."CommCall_MatchedLeadID" is not null
    )
      and (
        call."CommCall_MatchStatusCode" is distinct from 'matched'
        or coalesce(call."CommCall_MatchMethodCode" not in (
          'user_review',
          'approved_action',
          'approved_action_edited'
        ), true)
      )
  ) then
    raise exception 'Phone-call canonical CRM links require review before this migration can be applied.'
      using errcode = '23514';
  end if;
end
$$;

create or replace function public._multideck_phone_call_enforce_match_consistency()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_expected_org_id uuid;
  v_has_related_record boolean := false;
  v_has_canonical_link boolean := false;
begin
  v_has_canonical_link := new."CommCall_MatchedOrgID" is not null
    or new."CommCall_MatchedContactID" is not null
    or new."CommCall_MatchedLeadID" is not null;

  if v_has_canonical_link and (
    new."CommCall_MatchStatusCode" is distinct from 'matched'
    or coalesce(new."CommCall_MatchMethodCode" not in (
      'user_review',
      'approved_action',
      'approved_action_edited'
    ), true)
  ) then
    raise exception 'Phone-call CRM links require an operator-reviewed or approved match.'
      using errcode = '23514';
  end if;

  if new."CommCall_MatchedContactID" is not null
    and new."CommCall_MatchedLeadID" is not null then
    raise exception 'A phone call cannot be linked to both a contact and a lead.'
      using errcode = '22023';
  end if;

  if new."CommCall_MatchedContactID" is not null then
    select contact."Org_ID"
    into v_expected_org_id
    from public."Org_Contacts" contact
    where contact."OrgContact_ID" = new."CommCall_MatchedContactID";

    if not found then
      raise exception 'The selected phone-call contact no longer exists.'
        using errcode = '22023';
    end if;
    v_has_related_record := true;
  elsif new."CommCall_MatchedLeadID" is not null then
    select lead."CRMLead_OrgID"
    into v_expected_org_id
    from public."CRM_Leads" lead
    where lead."CRMLead_ID" = new."CommCall_MatchedLeadID"
      and not lead."CRMLead_IsDeleted";

    if not found then
      raise exception 'The selected phone-call lead is unavailable.'
        using errcode = '22023';
    end if;
    v_has_related_record := true;
  end if;

  if v_has_related_record then
    if new."CommCall_MatchedOrgID" is null then
      new."CommCall_MatchedOrgID" := v_expected_org_id;
    elsif v_expected_org_id is null
      or new."CommCall_MatchedOrgID" <> v_expected_org_id then
      raise exception 'The phone-call CRM links do not belong to the same company.'
        using errcode = '22023';
    end if;
  end if;

  if new."CommCall_MatchedOrgID" is not null
    and not public.multideck_crm_company_can_access_account(
      new."CommCall_CompanyID",
      new."CommCall_MatchedOrgID"
    ) then
    raise exception 'The phone-call company is outside this workspace.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists "TR_Comm_CallLogs_match_consistency"
  on public."Comm_CallLogs";
create trigger "TR_Comm_CallLogs_match_consistency"
before insert or update of
  "CommCall_CompanyID",
  "CommCall_MatchStatusCode",
  "CommCall_MatchMethodCode",
  "CommCall_MatchedOrgID",
  "CommCall_MatchedContactID",
  "CommCall_MatchedLeadID"
on public."Comm_CallLogs"
for each row execute function public._multideck_phone_call_enforce_match_consistency();

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'CK_Comm_CallLogs_confirmed_match_links'
      and conrelid = 'public."Comm_CallLogs"'::regclass
  ) then
    alter table public."Comm_CallLogs"
      add constraint "CK_Comm_CallLogs_confirmed_match_links"
      check (
        (
          "CommCall_MatchedOrgID" is null
          and "CommCall_MatchedContactID" is null
          and "CommCall_MatchedLeadID" is null
        )
        or (
          "CommCall_MatchStatusCode" = 'matched'
          and "CommCall_MatchMethodCode" in (
            'user_review',
            'approved_action',
            'approved_action_edited'
          )
        )
      );
  end if;
end
$$;

revoke all on function public._multideck_phone_call_enforce_match_consistency()
  from public, anon, authenticated;
grant execute on function public._multideck_phone_call_enforce_match_consistency()
  to service_role;

comment on constraint "CK_Comm_CallLogs_confirmed_match_links"
  on public."Comm_CallLogs" is
  'Canonical CRM link IDs exist only after operator review or approval of a generated match action.';

commit;
