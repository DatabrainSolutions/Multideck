-- Let signed-in operators preview their own draft or paused contact cards without
-- weakening the published-only public lookup used by shared QR codes.
create or replace function public.multideck_contact_card_preview(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in again to preview this contact card.' using errcode = '42501';
  end if;

  select * into v_context from public._multideck_crm_context();

  select jsonb_build_object(
    'ContactCard_ID', c."ContactCard_ID",
    'ContactCard_Slug', c."ContactCard_Slug",
    'ContactCard_Label', c."ContactCard_Label",
    'ContactCard_Status', c."ContactCard_Status",
    'ContactCard_Person', c."ContactCard_Person",
    'ContactCard_Branding', c."ContactCard_Branding",
    'ContactCard_TenantName', company."Company_Name",
    'ContactCard_ShowTenantName', c."ContactCard_ShowTenantName",
    'ContactCard_PublicHeading', c."ContactCard_PublicHeading",
    'ContactCard_PublicSubheading', c."ContactCard_PublicSubheading",
    'ContactCard_SubmitLabel', c."ContactCard_SubmitLabel",
    'ContactCard_ThanksHeading', c."ContactCard_ThanksHeading",
    'ContactCard_ThanksBody', c."ContactCard_ThanksBody",
    'ContactCard_PhoneField', c."ContactCard_PhoneField",
    'ContactCard_ShowPhone', c."ContactCard_ShowPhone",
    'ContactCard_ShowWebsite', c."ContactCard_ShowWebsite",
    'ContactCard_ConsentEnabled', c."ContactCard_ConsentEnabled",
    'ContactCard_ConsentCopy', c."ContactCard_ConsentCopy",
    'ContactCard_PrivacyUrl', c."ContactCard_PrivacyUrl",
    'ContactCard_CreatedAt', c."ContactCard_CreatedAt"
  )
  into v_result
  from public."CRM_ContactCards" c
  join public."cmp_Company" company on company."Company_ID" = c."Company_ID"
  where c."Company_ID" = v_context.company_id
    and c."ContactCard_Slug" = lower(btrim(p_slug))
    and c."ContactCard_DeletedAt" is null
  limit 1;

  return v_result;
end;
$$;

revoke all on function public.multideck_contact_card_preview(text) from public, anon;
grant execute on function public.multideck_contact_card_preview(text) to authenticated, service_role;

comment on function public.multideck_contact_card_preview(text) is
  'Returns a tenant-scoped contact card in any active authoring state for signed-in operator previews.';
