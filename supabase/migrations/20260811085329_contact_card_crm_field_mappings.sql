-- Contact cards have one deterministic CRM outcome: create a lead for a new
-- email address or update the existing lead. The saved allowlisted mappings
-- decide which submitted/fixed values populate supported CRM fields.

create or replace function private.apply_contact_card_crm_field_mappings(
  p_card_id uuid,
  p_lead_id uuid,
  p_input jsonb
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_card record;
  v_config jsonb;
  v_mapping jsonb;
  v_values jsonb := '{}'::jsonb;
  v_source text;
  v_target text;
  v_value text;
  v_first_name text;
  v_last_name text;
begin
  select * into v_card
  from public."CRM_ContactCards"
  where "ContactCard_ID" = p_card_id
    and "ContactCard_DeletedAt" is null;

  if not found then
    raise exception 'Contact card not found.' using errcode = 'P0002';
  end if;

  select "Action_Config" into v_config
  from public."CRM_ContactCardAutomationActions"
  where "ContactCard_ID" = p_card_id
    and "Action_Kind" = 'add-to-crm'
  order by "Action_SortOrder", "Action_ID"
  limit 1;

  for v_mapping in
    select value
    from jsonb_array_elements(
      case
        when jsonb_typeof(v_config -> 'fieldMappings') = 'array' then v_config -> 'fieldMappings'
        when jsonb_typeof((v_config ->> 'fieldMappings')::jsonb) = 'array' then (v_config ->> 'fieldMappings')::jsonb
        else '[]'::jsonb
      end
    )
  loop
    v_source := v_mapping ->> 'source';
    v_target := v_mapping ->> 'target';

    if v_source = 'fixed' then
      v_value := coalesce(v_mapping ->> 'value', '');
    elsif v_source = 'cardName' then
      v_value := coalesce(v_card."ContactCard_Label", '');
    elsif v_source = 'marketingConsent' then
      v_value := coalesce(p_input ->> 'marketingConsent', 'false');
    elsif v_source = any(array['firstName','lastName','email','company','phone']) then
      v_value := coalesce(p_input ->> v_source, '');
    else
      continue;
    end if;

    if v_target = any(array['firstName','lastName','email','company','phone','jobTitle','notes','campaign']) then
      v_values := v_values || jsonb_build_object(v_target, left(btrim(v_value), 2000));
    end if;
  end loop;

  v_first_name := nullif(v_values ->> 'firstName', '');
  v_last_name := nullif(v_values ->> 'lastName', '');

  update public."CRM_Leads"
  set
    "CRMLead_PersonName" = case
      when v_values ? 'firstName' or v_values ? 'lastName'
        then nullif(left(btrim(concat_ws(' ', v_first_name, v_last_name)), 255), '')
      else "CRMLead_PersonName"
    end,
    "CRMLead_Email" = case when v_values ? 'email' then nullif(left(lower(btrim(v_values ->> 'email')), 255), '') else "CRMLead_Email" end,
    "CRMLead_CompanyName" = case when v_values ? 'company' then nullif(left(btrim(v_values ->> 'company'), 255), '') else "CRMLead_CompanyName" end,
    "CRMLead_Phone" = case when v_values ? 'phone' then nullif(left(btrim(v_values ->> 'phone'), 80), '') else "CRMLead_Phone" end,
    "CRMLead_MetadataJSON" = coalesce("CRMLead_MetadataJSON", '{}'::jsonb)
      || jsonb_build_object(
        'contactCardId', p_card_id,
        'contactCardSlug', v_card."ContactCard_Slug",
        'leadSource', coalesce(v_card."ContactCard_LeadSource", ''),
        'marketingConsent', coalesce((p_input ->> 'marketingConsent')::boolean, false),
        'mappedFields', v_values - array['firstName','lastName','email','company','phone']
      ),
    "CRMLead_UpdatedAt" = now(),
    "CRMLead_UpdatedBy" = v_card."Owner_User_ID"
  where "CRMLead_ID" = p_lead_id
    and not "CRMLead_IsDeleted";
end;
$$;

revoke all on function private.apply_contact_card_crm_field_mappings(uuid, uuid, jsonb) from public, anon, authenticated;

-- Existing workflow-builder actions are retired. The add-to-CRM action remains
-- as the persisted mapping container and always updates duplicate emails.
update public."CRM_ContactCardAutomationActions"
set
  "Action_Enabled" = ("Action_Kind" = 'add-to-crm'),
  "Action_Config" = case when "Action_Kind" = 'add-to-crm'
    then jsonb_set(jsonb_set("Action_Config", '{duplicateHandling}', '"update"'::jsonb, true), '{recordType}', '"lead"'::jsonb, true)
    else "Action_Config"
  end
where "Action_Kind" <> 'add-to-crm'
   or coalesce("Action_Config" ->> 'duplicateHandling', '') <> 'update'
   or coalesce("Action_Config" ->> 'recordType', '') <> 'lead';

create or replace function public.multideck_contact_card_submit_exchange(p_slug text,p_scan_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private as $$
declare v_card record; v_email text; v_lead uuid; v_existing boolean:=false; v_exchange uuid; v_outcome text; v_run uuid; v_run_status text;
begin
  select * into v_card from public."CRM_ContactCards" where "ContactCard_Slug"=lower(btrim(p_slug)) and "ContactCard_Status"='published' and "ContactCard_DeletedAt" is null limit 1;
  if not found then raise exception 'This contact card is not active.' using errcode='P0002'; end if;
  v_email:=lower(btrim(p_input->>'email'));
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid email address.' using errcode='22023'; end if;
  if btrim(coalesce(p_input->>'firstName',''))='' or btrim(coalesce(p_input->>'lastName',''))='' or btrim(coalesce(p_input->>'company',''))='' then raise exception 'Enter a first name, last name and company.' using errcode='22023'; end if;
  select "CRMLead_ID" into v_lead from public."CRM_Leads" where lower("CRMLead_Email")=v_email and not "CRMLead_IsDeleted" order by "CRMLead_CreatedAt" limit 1; v_existing:=v_lead is not null;
  if not v_existing then insert into public."CRM_Leads"("CRMLead_SourceCode","CRMLead_StatusCode","CRMLead_RatingCode","CRMLead_OwnerUserID","CRMLead_CompanyName","CRMLead_PersonName","CRMLead_Email","CRMLead_Phone","CRMLead_MetadataJSON","CRMLead_CreatedBy","CRMLead_UpdatedBy") values('website','new','unrated',v_card."Owner_User_ID",left(btrim(p_input->>'company'),255),left(btrim(concat_ws(' ',p_input->>'firstName',p_input->>'lastName')),255),left(v_email,255),left(coalesce(p_input->>'phone',''),80),jsonb_build_object('contactCardId',v_card."ContactCard_ID",'contactCardSlug',v_card."ContactCard_Slug",'leadSource',v_card."ContactCard_LeadSource",'marketingConsent',coalesce((p_input->>'marketingConsent')::boolean,false)),v_card."Owner_User_ID",v_card."Owner_User_ID") returning "CRMLead_ID" into v_lead; end if;
  perform private.apply_contact_card_crm_field_mappings(v_card."ContactCard_ID", v_lead, p_input);
  if p_scan_id is not null and not exists(select 1 from public."CRM_ContactCardScans" where "Scan_ID"=p_scan_id and "ContactCard_ID"=v_card."ContactCard_ID" and "Scan_At">now()-interval '24 hours') then p_scan_id:=null; end if;
  v_outcome:=case when v_existing then 'matched' else 'created' end;
  insert into public."CRM_ContactCardExchanges"("ContactCard_ID","Scan_ID","CRMLead_ID","Exchange_FirstName","Exchange_LastName","Exchange_Email","Exchange_Company","Exchange_Phone","Exchange_MarketingConsent","Exchange_Outcome","Exchange_AutomationOutcome","Exchange_AutomationDetail") values(v_card."ContactCard_ID",p_scan_id,v_lead,btrim(p_input->>'firstName'),btrim(p_input->>'lastName'),v_email,btrim(p_input->>'company'),btrim(coalesce(p_input->>'phone','')),coalesce((p_input->>'marketingConsent')::boolean,false),v_outcome,'none','CRM mapping pending.') returning "Exchange_ID" into v_exchange;
  v_run:=public._multideck_contact_card_execute_automation(v_card."ContactCard_ID",v_exchange,v_lead,p_input,v_existing,false,null,0);
  select "AutomationRun_Status" into v_run_status from public."CRM_ContactCardAutomationRuns" where "AutomationRun_ID"=v_run;
  update public."CRM_ContactCardExchanges" set "Exchange_AutomationOutcome"=case when v_run_status='succeeded' then 'ran' when v_run_status='failed' then 'failed' when v_run_status='skipped' then 'skipped' else 'none' end,"Exchange_AutomationDetail"=case when v_run_status='succeeded' then 'CRM fields updated.' when v_run_status='failed' then 'A CRM update step failed. The input was preserved for rerun.' when v_run_status='skipped' then 'The CRM contact was updated; optional automation was inactive.' else 'CRM fields updated.' end where "Exchange_ID"=v_exchange;
  update public."CRM_ContactCardScans" set "Scan_StartedAt"=coalesce("Scan_StartedAt",now()),"Scan_ExchangedAt"=now() where "Scan_ID"=p_scan_id and "ContactCard_ID"=v_card."ContactCard_ID";
  return jsonb_build_object('outcome',v_outcome,'exchangeId',v_exchange,'leadId',v_lead,'runId',v_run,'automationOutcome',v_run_status);
end; $$;
