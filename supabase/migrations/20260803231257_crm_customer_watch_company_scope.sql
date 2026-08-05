-- Route CRM change signals to the companies that own matching active watches.
-- active watch. The tenant project may retain more than one company row for
-- historical data, so choosing the first company is not a valid boundary.

begin;

create or replace function public._multideck_crm_customer_watch_signal()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_source uuid;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'Org_Master' then
    v_source := new."Org_id";
    if tg_op <> 'INSERT' then
      v_old := jsonb_build_object('recordType', 'account', 'name', old."Org_Name", 'relationshipStatus', old."Org_CRMRelationshipStatusCode");
    end if;
    v_new := jsonb_build_object('recordType', 'account', 'name', new."Org_Name", 'relationshipStatus', new."Org_CRMRelationshipStatusCode");
  elsif tg_table_name = 'CRM_AccountProfiles' then
    v_source := new."CRMAccount_OrgID";
    if tg_op <> 'INSERT' then
      v_old := jsonb_build_object('recordType', 'account', 'relationshipStatus', old."CRMAccount_RelationshipStatusCode", 'tier', old."CRMAccount_Tier", 'segment', old."CRMAccount_Segment", 'healthScore', old."CRMAccount_HealthScore", 'churnRiskScore', old."CRMAccount_ChurnRiskScore", 'lastContactAt', old."CRMAccount_LastContactAt", 'nextActionDueAt', old."CRMAccount_NextActionDueAt");
    end if;
    v_new := jsonb_build_object('recordType', 'account', 'relationshipStatus', new."CRMAccount_RelationshipStatusCode", 'tier', new."CRMAccount_Tier", 'segment', new."CRMAccount_Segment", 'healthScore', new."CRMAccount_HealthScore", 'churnRiskScore', new."CRMAccount_ChurnRiskScore", 'lastContactAt', new."CRMAccount_LastContactAt", 'nextActionDueAt', new."CRMAccount_NextActionDueAt");
  elsif tg_table_name = 'Org_Contacts' then
    v_source := new."OrgContact_ID";
    if tg_op <> 'INSERT' then
      v_old := jsonb_build_object('recordType', 'contact', 'name', nullif(btrim(concat_ws(' ', old."OrgContact_FirstName", old."OrgContact_LastName")), ''));
    end if;
    v_new := jsonb_build_object('recordType', 'contact', 'name', nullif(btrim(concat_ws(' ', new."OrgContact_FirstName", new."OrgContact_LastName")), ''));
  else
    v_source := new."CRMContact_OrgContactID";
    if tg_op <> 'INSERT' then
      v_old := jsonb_build_object('recordType', 'contact', 'role', old."CRMContact_RoleCode", 'influenceLevel', old."CRMContact_InfluenceLevel", 'relationshipStrength', old."CRMContact_RelationshipStrength", 'preferredChannel', old."CRMContact_PreferredChannelCode", 'salesContactAllowed', old."CRMContact_ConsentSalesContact", 'lastContactAt', old."CRMContact_LastContactAt");
    end if;
    v_new := jsonb_build_object('recordType', 'contact', 'role', new."CRMContact_RoleCode", 'influenceLevel', new."CRMContact_InfluenceLevel", 'relationshipStrength', new."CRMContact_RelationshipStrength", 'preferredChannel', new."CRMContact_PreferredChannelCode", 'salesContactAllowed', new."CRMContact_ConsentSalesContact", 'lastContactAt', new."CRMContact_LastContactAt");
  end if;

  if v_source is not null and v_new is distinct from v_old then
    insert into public."AI_DexterWatchSignals"(
      "AIDexterWatchSignal_CompanyID", "AIDexterWatchSignal_CapabilityCode", "AIDexterWatchSignal_SourceTable",
      "AIDexterWatchSignal_SourceID", "AIDexterWatchSignal_OldJSON", "AIDexterWatchSignal_NewJSON"
    )
    select distinct watch."AIDexterWatch_CompanyID", 'customers', tg_table_name, v_source, v_old, v_new
    from public."AI_DexterWatches" watch
    where watch."AIDexterWatch_CapabilityCode" = 'customers'
      and watch."AIDexterWatch_StatusCode" = 'active'
      and watch."AIDexterWatch_IsArmed"
      and (watch."AIDexterWatch_TargetID" is null or watch."AIDexterWatch_TargetID" = v_source);
  end if;
  return new;
end;
$$;

revoke all on function public._multideck_crm_customer_watch_signal() from public, anon, authenticated;

commit;
