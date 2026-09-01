-- Contact-card submissions have one fixed CRM contract. The public form fields
-- map automatically to the lead, while the card owner controls only the lead
-- source and an optional note added to the lead's ordinary Notes section.

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
  v_config jsonb := '{}'::jsonb;
  v_custom_notes text;
begin
  select * into v_card
  from public."CRM_ContactCards"
  where "ContactCard_ID" = p_card_id
    and "ContactCard_DeletedAt" is null;

  if not found then
    raise exception 'Contact card not found.' using errcode = 'P0002';
  end if;

  select coalesce("Action_Config", '{}'::jsonb) into v_config
  from public."CRM_ContactCardAutomationActions"
  where "ContactCard_ID" = p_card_id
    and "Action_Kind" = 'add-to-crm'
  order by "Action_SortOrder", "Action_ID"
  limit 1;

  v_custom_notes := nullif(left(btrim(coalesce(v_config ->> 'customNotes', '')), 12000), '');

  update public."CRM_Leads"
  set
    "CRMLead_PersonName" = left(btrim(concat_ws(' ', p_input ->> 'firstName', p_input ->> 'lastName')), 255),
    "CRMLead_Email" = left(lower(btrim(p_input ->> 'email')), 255),
    "CRMLead_CompanyName" = left(btrim(p_input ->> 'company'), 255),
    "CRMLead_Phone" = coalesce(nullif(left(btrim(coalesce(p_input ->> 'phone', '')), 80), ''), "CRMLead_Phone"),
    "CRMLead_MetadataJSON" = (coalesce("CRMLead_MetadataJSON", '{}'::jsonb) - 'mappedFields')
      || jsonb_build_object(
        'contactCardId', p_card_id,
        'contactCardSlug', v_card."ContactCard_Slug",
        'leadSource', coalesce(v_card."ContactCard_LeadSource", ''),
        'marketingConsent', coalesce((p_input ->> 'marketingConsent')::boolean, false)
      ),
    "CRMLead_UpdatedAt" = now(),
    "CRMLead_UpdatedBy" = v_card."Owner_User_ID"
  where "CRMLead_ID" = p_lead_id
    and not "CRMLead_IsDeleted";

  if not found then
    raise exception 'Lead not found.' using errcode = 'P0002';
  end if;

  if v_custom_notes is not null and not exists (
    select 1
    from public."CRM_Notes"
    where "CRMNote_LeadID" = p_lead_id
      and "CRMNote_SourceTable" = 'CRM_ContactCards'
      and "CRMNote_SourceID" = p_card_id
      and "CRMNote_Body" = v_custom_notes
      and not "CRMNote_IsDeleted"
  ) then
    insert into public."CRM_Notes" (
      "CRMNote_LeadID",
      "CRMNote_SourceTable",
      "CRMNote_SourceID",
      "CRMNote_Title",
      "CRMNote_Body",
      "CRMNote_SensitivityCode",
      "CRMNote_IsCustomerVisible",
      "CRMNote_IsTrainingAllowed",
      "CRMNote_CreatedBy",
      "CRMNote_UpdatedBy"
    ) values (
      p_lead_id,
      'CRM_ContactCards',
      p_card_id,
      'Contact card context',
      v_custom_notes,
      'internal',
      false,
      false,
      v_card."Owner_User_ID",
      v_card."Owner_User_ID"
    );
  end if;
end;
$$;

revoke all on function private.apply_contact_card_crm_field_mappings(uuid, uuid, jsonb) from public, anon, authenticated;

-- Keep the retired mapping payload out of newly published configurations. It
-- is no longer consulted by the submission boundary, but removing it keeps the
-- stored action aligned with the two choices shown in the product.
update public."CRM_ContactCardAutomationActions"
set "Action_Config" = "Action_Config" - 'fieldMappings'
where "Action_Kind" = 'add-to-crm'
  and "Action_Config" ? 'fieldMappings';
