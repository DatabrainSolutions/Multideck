-- Run only in the disposable company-brand-removal.fixture.sql database,
-- after 20260902093000_company_brand_removal_fallback.sql.
insert into public."cmp_Brands" ("Company_ID", "Brand_Name", "Brand_TemplateSettingsJSON") values
  ('00000000-0000-4000-8000-000000000001', 'Legacy reset', '{"tenantBranding":{"version":1,"primaryColor":"#0E7D74","secondaryColor":"#164E49","backgroundColor":"#F3F4F4","surfaceColor":"#FFFFFF","textColor":"#292929","appearanceMode":"light","cornerStyle":"rounded","emailSignOff":"","logoPath":null,"importedFrom":{"url":"https://www.jenkar.com/"}}}'),
  ('00000000-0000-4000-8000-000000000002', 'Custom palette', '{"tenantBranding":{"version":1,"primaryColor":"#316FAB","secondaryColor":"#FFB800"}}'),
  ('00000000-0000-4000-8000-000000000003', 'Explicit saved identity', '{"tenantBranding":{"version":1,"configured":true,"primaryColor":"#0E7D74","secondaryColor":"#164E49"}}');
insert into public."cmp_Users" ("Company_ID", "User_AccentPreset") values
  ('00000000-0000-4000-8000-000000000001', 'company'),
  ('00000000-0000-4000-8000-000000000001', 'violet'),
  ('00000000-0000-4000-8000-000000000002', 'company'),
  ('00000000-0000-4000-8000-000000000003', 'company');

\ir ../migrations/20260902103000_legacy_brand_reset_state.sql

do $$
begin
  assert (select "Brand_TemplateSettingsJSON" #> '{tenantBranding,configured}' = 'false'::jsonb from public."cmp_Brands" where "Brand_Name"='Legacy reset'), 'legacy reset still configured';
  assert (select "Brand_TemplateSettingsJSON" #>> '{tenantBranding,importedFrom,url}' = 'https://www.jenkar.com/' from public."cmp_Brands" where "Brand_Name"='Legacy reset'), 'import history changed';
  assert (select count(*)=1 from public."cmp_Users" where "Company_ID"='00000000-0000-4000-8000-000000000001' and "User_AccentPreset"='teal'), 'legacy company preference not reset';
  assert (select count(*)=1 from public."cmp_Users" where "Company_ID"='00000000-0000-4000-8000-000000000001' and "User_AccentPreset"='violet'), 'standard theme changed';
  assert (select count(*)=2 from public."cmp_Users" where "Company_ID"<>'00000000-0000-4000-8000-000000000001' and "User_AccentPreset"='company'), 'valid brand users changed';
  assert (select count(*)=3 from public."cmp_Brands"), 'brand records deleted';
  raise notice 'PASS: legacy reset hidden, company preference corrected, valid identities and other themes preserved, no branding or history deleted';
end;
$$;
