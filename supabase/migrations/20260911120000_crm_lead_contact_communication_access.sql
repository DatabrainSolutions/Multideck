-- A contact can exist before an organisation. Use the same reachable lead boundary
-- as the lead register; never infer contact access from a matching email address.
begin;
create or replace function public.multideck_crm_company_can_access_contact(p_company_id uuid, p_contact_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists (
    select 1 from public."Org_Contacts" contact
    where contact."OrgContact_ID" = p_contact_id and (
      (contact."Org_ID" is not null and public.multideck_crm_company_can_access_account(p_company_id, contact."Org_ID"))
      or (contact."Org_ID" is null and exists (
        select 1 from public."CRM_Leads" lead
        where lead."CRMLead_PrimaryContactID" = contact."OrgContact_ID"
          and public._multideck_crm_lead_is_reachable(lead."CRMLead_ID", p_company_id)
      ))
    )
  )
$$;
create or replace function public._multideck_crm_require_contact_access(p_actor_user_id uuid, p_contact_id uuid)
returns void language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if not public.multideck_crm_company_can_access_contact(public._multideck_crm_actor_company(p_actor_user_id), p_contact_id) then
    raise exception 'Contact not found.' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.multideck_crm_company_can_access_contact(uuid, uuid) from public, anon, authenticated;
revoke all on function public._multideck_crm_require_contact_access(uuid, uuid) from public, anon, authenticated;
grant execute on function public.multideck_crm_company_can_access_contact(uuid, uuid) to service_role;
grant execute on function public._multideck_crm_require_contact_access(uuid, uuid) to service_role;

-- Preserve the current transactional writer, email history, consent evidence,
-- optimistic version check, write permission and audit. Only its reachability
-- check changes, and an unexpected current definition aborts this migration.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.multideck_crm_update_contact(uuid,uuid,bigint,jsonb)'::regprocedure);
  if position('public._multideck_crm_require_account_access(p_actor_user_id, v_contact."Org_ID")' in definition) = 0 then
    raise exception 'Unexpected contact writer: review its access boundary before migrating';
  end if;
  execute replace(definition,
    'public._multideck_crm_require_account_access(p_actor_user_id, v_contact."Org_ID")',
    'public._multideck_crm_require_contact_access(p_actor_user_id, p_contact_id)');
end;
$$;

-- Contact profile edits remain a structured form capability. Explicitly describe
-- the current chat/watch limit rather than suggesting account consent applies.
update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Description" = 'Individual company contacts: contact details, preferred channel and personal consent. Company or lead consent never substitutes for a person''s consent. Contacts linked only to a lead must be reviewed and edited in that lead''s Contact preferences; standalone contact reads, edits and contact preference watches for those people are not supported in Dexter yet.',
    "AIDexterDomain_UpdatedAt" = now()
where "AIDexterDomain_Code" = 'contacts';
commit;
