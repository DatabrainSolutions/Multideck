-- Run after company-brand-removal.fixture.sql and the actual migration in an
-- empty disposable PostgreSQL database. These assertions never touch live data.
begin;
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  a_brand uuid;
  a_user uuid := gen_random_uuid();
  complete jsonb := '{"tenantBranding":{"version":1,"primaryColor":"#316FAB","secondaryColor":"#FFB800","logoPath":"jenkar.svg"}}';
  saved text;
begin
  insert into public."cmp_Brands" ("Company_ID","Brand_Name","Brand_TemplateSettingsJSON")
    values (a,'Jenkar Shipping',complete) returning "Brand_ID" into a_brand;
  insert into public."cmp_Brands" ("Company_ID","Brand_Name","Brand_TemplateSettingsJSON")
    values (b,'Other company',complete);
  insert into public."cmp_Users" ("Company_ID","Auth_User_ID","User_AccentPreset") values (a,a_user,'company');
  insert into public."cmp_Users" ("Company_ID","User_AccentPreset") values (a,'company'),(a,'violet'),(a,'teal'),(a,null),(b,'company');

  -- Removing just a logo preserves the complete identity and personal choice.
  update public."cmp_Brands" set "Brand_TemplateSettingsJSON" = complete #- '{tenantBranding,logoPath}' where "Brand_ID"=a_brand;
  assert (select count(*)=2 from public."cmp_Users" where "Company_ID"=a and "User_AccentPreset"='company'), 'logo removal reset company users';

  update public."cmp_Brands" set "Brand_TemplateSettingsJSON" = jsonb_set(complete,'{tenantBranding,configured}','false') where "Brand_ID"=a_brand;
  assert (select count(*)=3 from public."cmp_Users" where "Company_ID"=a and "User_AccentPreset"='teal'), 'not all company-theme users reset';
  assert (select count(*)=1 from public."cmp_Users" where "Company_ID"=a and "User_AccentPreset"='violet'), 'other preset changed';
  assert (select count(*)=1 from public."cmp_Users" where "Company_ID"=a and "User_AccentPreset" is null), 'unset preference changed';
  assert (select count(*)=1 from public."cmp_Users" where "Company_ID"=b and "User_AccentPreset"='company'), 'another company changed';

  perform set_config('request.jwt.claim.sub',a_user::text,true);
  select accent_preset into saved from public.set_current_user_accent_preference('company');
  assert saved='teal', 'stale selector can re-enable removed brand';
  assert (select "User_AccentPreset"='company' from public."cmp_Users" where "Company_ID"=b), 'profile RPC changed another company';

  update public."cmp_Brands" set "Brand_TemplateSettingsJSON"=complete where "Brand_ID"=a_brand;
  assert (select count(*)=0 from public."cmp_Users" where "Company_ID"=a and "User_AccentPreset"='company'), 're-adding brand silently opted users back in';
  select accent_preset into saved from public.set_current_user_accent_preference('company');
  assert saved='company', 'cannot opt back in after re-adding';

  update public."cmp_Brands" set "Brand_IsActive"=false where "Brand_ID"=a_brand;
  assert (select "User_AccentPreset"='teal' from public."cmp_Users" where "Auth_User_ID"=a_user), 'deactivation did not reset';
  update public."cmp_Brands" set "Brand_IsActive"=true where "Brand_ID"=a_brand;
  perform public.set_current_user_accent_preference('company');
  update public."cmp_Brands" set "Brand_TemplateSettingsJSON"=complete #- '{tenantBranding,secondaryColor}' where "Brand_ID"=a_brand;
  assert (select "User_AccentPreset"='teal' from public."cmp_Users" where "Auth_User_ID"=a_user), 'incomplete brand did not reset';
  update public."cmp_Brands" set "Brand_TemplateSettingsJSON"=complete where "Brand_ID"=a_brand;
  perform public.set_current_user_accent_preference('company');
  delete from public."cmp_Brands" where "Brand_ID"=a_brand;
  assert (select "User_AccentPreset"='teal' from public."cmp_Users" where "Auth_User_ID"=a_user), 'brand deletion did not reset';

  assert not has_function_privilege('anon','public.set_current_user_accent_preference(text)','execute'), 'anonymous profile writes allowed';
  assert not has_function_privilege('authenticated','public.company_appearance_available(uuid)','execute'), 'private company lookup exposed';
  assert exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='cmp_Users'), 'profile reset events not published';
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.set_current_user_accent_preference('company');
    raise exception 'unauthenticated profile write accepted';
  exception when raise_exception then
    if SQLERRM <> 'Authentication is required.' then raise; end if;
  end;
  raise notice 'PASS: removal, all affected users, other presets, company isolation, logo-only removal, restore, stale writes, deactivation, incomplete brand, deletion, permissions and realtime publication';
end;
$$;
rollback;
