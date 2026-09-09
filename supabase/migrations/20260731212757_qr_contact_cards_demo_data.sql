-- A small, coherent development dataset for the Supabase-backed QR workspace.
-- Rows are idempotent and explicitly marked as demo data where they touch the CRM lead register.

begin;

do $$
declare
  v_company uuid;
  v_harry uuid;
  v_andrew uuid;
  v_lee uuid;
  v_pipeline uuid;
  v_stage uuid;
  v_card uuid;
  v_scan uuid;
  v_lead uuid;
  v_person jsonb;
  v_branding jsonb;
  v_name text;
  v_slug text;
  v_context text;
  v_accent text;
  v_owner uuid;
  v_email text;
  v_index integer;
begin
  select "Company_ID" into v_company from public."cmp_Company" where "Company_Name" = 'Development' limit 1;
  select "User_ID" into v_harry from public."cmp_Users" where "Company_ID" = v_company and lower("User_Email") = 'harry@databrain.solutions' limit 1;
  select "User_ID" into v_andrew from public."cmp_Users" where "Company_ID" = v_company and lower("User_Email") = 'andrew@databrain.solutions' limit 1;
  select "User_ID" into v_lee from public."cmp_Users" where "Company_ID" = v_company and lower("User_Email") = 'lee@databrain.solutions' limit 1;
  select p."CRMPipeline_ID", s."CRMPipelineStage_ID" into v_pipeline, v_stage
  from public."CRM_Pipelines" p join public."CRM_PipelineStages" s on s."CRMPipeline_ID" = p."CRMPipeline_ID"
  where p."Company_ID" = v_company and p."CRMPipeline_Name" = 'Freight opportunity' and s."CRMPipelineStage_IsDefaultEntry" and not p."Is_Deleted" and not s."Is_Deleted" limit 1;

  if v_company is null or v_harry is null or v_pipeline is null or v_stage is null then
    raise exception 'The Development workspace, Harry user, and Freight opportunity pipeline must exist before QR demo data is seeded.';
  end if;

  for v_index in 1..3 loop
    if v_index = 1 then
      v_name := 'Harry Phillips'; v_slug := 'harry-phillips'; v_context := 'London Freight Forum'; v_accent := '#1f6f68'; v_owner := v_harry; v_email := 'harry@databrain.solutions';
    elsif v_index = 2 then
      v_name := 'Andrew Phillips'; v_slug := 'andrew-phillips'; v_context := 'UCN Sri Lanka'; v_accent := '#3f5f8a'; v_owner := coalesce(v_andrew, v_harry); v_email := 'andrew@databrain.solutions';
    else
      v_name := 'Lee Wright'; v_slug := 'lee-wright'; v_context := 'Freight Forum Rotterdam'; v_accent := '#8a5a3f'; v_owner := coalesce(v_lee, v_harry); v_email := 'lee@databrain.solutions';
    end if;

    v_person := jsonb_build_object('fullName', v_name, 'role', case when v_index=1 then 'Founder' when v_index=2 then 'Operations Director' else 'Commercial Director' end, 'company', 'Databrain', 'email', v_email, 'phone', '+44 20 7946 ' || (8200 + v_index), 'website', 'databrain.solutions');
    v_branding := jsonb_build_object('accent', v_accent, 'theme', case when v_index=2 then 'dark' else 'light' end, 'headerStyle', case when v_index=3 then 'band' else 'bar' end, 'layout', case when v_index=2 then 'centred' else 'classic' end, 'cornerStyle', 'soft', 'logoDataUrl', null, 'logoInQr', false, 'qrModuleStyle', case when v_index=2 then 'dots' else 'rounded' end, 'qrEyeStyle', case when v_index=2 then 'circle' else 'rounded' end, 'qrDark', '#0b1413', 'qrLight', '#ffffff');

    insert into public."CRM_ContactCards" ("Company_ID", "Owner_User_ID", "ContactCard_Slug", "ContactCard_Label", "ContactCard_Context", "ContactCard_Status", "ContactCard_Person", "ContactCard_Branding", "ContactCard_LeadSource", "ContactCard_PublicHeading", "ContactCard_PublicSubheading", "ContactCard_SubmitLabel", "ContactCard_ThanksHeading", "ContactCard_ThanksBody", "ContactCard_PhoneField", "ContactCard_ShowPhone", "ContactCard_ShowWebsite", "ContactCard_ConsentEnabled", "ContactCard_ConsentCopy", "ContactCard_PrivacyUrl", "ContactCard_CreatedAt")
    values (v_company, v_owner, v_slug, v_name, v_context, 'published', v_person, v_branding, 'QR · ' || v_context, 'Let''s stay in touch', 'Share your details and ' || split_part(v_name,' ',1) || ' will follow up after ' || v_context || '.', 'Share my details', 'You''re connected', 'Thanks — ' || split_part(v_name,' ',1) || ' will be in touch shortly.', 'optional', true, true, true, 'Send me occasional freight and Multideck updates.', 'https://databrain.solutions/privacy', now() - make_interval(days => 28 - v_index * 6))
    on conflict ("ContactCard_Slug") where "ContactCard_DeletedAt" is null do update set "ContactCard_Person"=excluded."ContactCard_Person", "ContactCard_Branding"=excluded."ContactCard_Branding", "ContactCard_UpdatedAt"=now()
    returning "ContactCard_ID" into v_card;

    insert into public."CRM_ContactCardAutomations" ("ContactCard_ID", "Automation_State") values (v_card, 'active')
    on conflict ("ContactCard_ID") do update set "Automation_State"='active', "Automation_UpdatedAt"=now();
    delete from public."CRM_ContactCardAutomationActions" where "ContactCard_ID"=v_card;
    insert into public."CRM_ContactCardAutomationActions" ("ContactCard_ID", "Action_Kind", "Action_Config", "Action_OwnerUserID", "Action_SortOrder")
    values (v_card, 'assign-owner', jsonb_build_object('owner',v_name,'ownerId',v_owner), v_owner, 0);
    insert into public."CRM_ContactCardAutomationActions" ("ContactCard_ID", "Action_Kind", "Action_Config", "Action_PipelineID", "Action_PipelineStageID", "Action_SortOrder")
    values (v_card, 'pipeline-stage', jsonb_build_object('pipeline','Freight opportunity','pipelineId',v_pipeline,'stage','New enquiry','stageId',v_stage), v_pipeline, v_stage, 1);

    if not exists (select 1 from public."CRM_ContactCardScans" where "ContactCard_ID"=v_card) then
      insert into public."CRM_ContactCardScans" ("ContactCard_ID", "Scan_At", "Scan_Device", "Scan_Browser", "Scan_Channel", "Scan_Country", "Scan_Region", "Scan_StartedAt", "Scan_ExchangedAt")
      select v_card, now() - make_interval(days => g) - make_interval(hours => (g*3 + v_index)%11), case when g%5=0 then 'desktop' when g%4=0 then 'tablet' else 'mobile' end, case when g%3=0 then 'Safari' when g%3=1 then 'Chrome' else 'Edge' end, case when g%4=0 then 'shared-link' else 'direct-scan' end, case when v_index=2 then 'Sri Lanka' when v_index=3 then 'Netherlands' else 'United Kingdom' end, case when v_index=2 then 'Western Province' when v_index=3 then 'South Holland' else 'England' end, case when g%3<>0 then now() - make_interval(days => g) else null end, null
      from generate_series(0, 7 + v_index*3) g;
    end if;
  end loop;

  -- Five realistic but non-deliverable demo exchanges, linked to actual CRM lead rows.
  for v_index in 1..5 loop
    v_email := 'qr-demo-' || v_index || '@example.com';
    select "CRMLead_ID" into v_lead from public."CRM_Leads" where lower("CRMLead_Email")=v_email and not "CRMLead_IsDeleted" limit 1;
    if v_lead is null then
      insert into public."CRM_Leads" ("CRMLead_SourceCode", "CRMLead_StatusCode", "CRMLead_RatingCode", "CRMLead_OwnerUserID", "CRMLead_CompanyName", "CRMLead_PersonName", "CRMLead_Email", "CRMLead_MetadataJSON", "CRMLead_CreatedBy", "CRMLead_UpdatedBy")
      values ('website','new','unrated',v_harry,'Demo Freight ' || v_index,'QR Demo Contact ' || v_index,v_email,jsonb_build_object('isDemo',true,'source','qr-contact-card-seed'),v_harry,v_harry)
      returning "CRMLead_ID" into v_lead;
    end if;
    select "ContactCard_ID" into v_card from public."CRM_ContactCards" where "ContactCard_Slug"=case when v_index<=3 then 'harry-phillips' else 'andrew-phillips' end and "ContactCard_DeletedAt" is null;
    select "Scan_ID" into v_scan from public."CRM_ContactCardScans" where "ContactCard_ID"=v_card order by "Scan_At" desc offset v_index-1 limit 1;
    if not exists (select 1 from public."CRM_ContactCardExchanges" where "Exchange_Email"=v_email) then
      insert into public."CRM_ContactCardExchanges" ("ContactCard_ID","Scan_ID","CRMLead_ID","Exchange_FirstName","Exchange_LastName","Exchange_Email","Exchange_Company","Exchange_MarketingConsent","Exchange_At","Exchange_Outcome","Exchange_AutomationOutcome","Exchange_AutomationDetail")
      values (v_card,v_scan,v_lead,'QR Demo','Contact ' || v_index,v_email,'Demo Freight ' || v_index,v_index%2=0,now()-make_interval(days=>v_index),'created','ran','2 connected CRM actions ran.');
      update public."CRM_ContactCardScans" set "Scan_StartedAt"=coalesce("Scan_StartedAt","Scan_At"+interval '20 seconds'), "Scan_ExchangedAt"="Scan_At"+interval '2 minutes' where "Scan_ID"=v_scan;
      insert into public."CRM_LeadPipelinePlacements" ("CRMLead_ID","CRMPipeline_ID","CRMPipelineStage_ID","ContactCard_ID","Placed_At") values (v_lead,v_pipeline,v_stage,v_card,now()-make_interval(days=>v_index))
      on conflict ("CRMLead_ID") do update set "CRMPipeline_ID"=excluded."CRMPipeline_ID", "CRMPipelineStage_ID"=excluded."CRMPipelineStage_ID", "ContactCard_ID"=excluded."ContactCard_ID", "Placed_At"=excluded."Placed_At";
    end if;
  end loop;
  update public."CRM_ContactCardAutomations" automation
  set "Automation_LastRunAt" = latest.last_run_at
  from (
    select "ContactCard_ID", max("Exchange_At") as last_run_at
    from public."CRM_ContactCardExchanges"
    where "Exchange_AutomationOutcome" = 'ran'
    group by "ContactCard_ID"
  ) latest
  where automation."ContactCard_ID" = latest."ContactCard_ID";
end $$;

commit;
