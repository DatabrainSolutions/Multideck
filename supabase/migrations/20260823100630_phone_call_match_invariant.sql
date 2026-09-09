-- Keep every phone-call CRM link internally consistent, including links applied
-- by reviewed generated actions and future privileged ingestion paths.

begin;

create or replace function public._multideck_phone_call_enforce_match_consistency()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_expected_org_id uuid;
  v_has_related_record boolean := false;
begin
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
  "CommCall_MatchedOrgID",
  "CommCall_MatchedContactID",
  "CommCall_MatchedLeadID"
on public."Comm_CallLogs"
for each row execute function public._multideck_phone_call_enforce_match_consistency();

revoke all on function public._multideck_phone_call_enforce_match_consistency()
  from public, anon, authenticated;
grant execute on function public._multideck_phone_call_enforce_match_consistency()
  to service_role;

commit;
