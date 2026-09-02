begin;

-- Older Reset to default clients retained version/name/import metadata. Repair
-- only records with no logo and the full unchanged Multideck visual fallback.
-- Identity, website and import history remain intact; no assets are deleted.
-- The existing removal trigger reconciles only affected company-theme users.
update public."cmp_Brands"
set "Brand_TemplateSettingsJSON" = jsonb_set("Brand_TemplateSettingsJSON", '{tenantBranding,configured}', 'false'::jsonb)
where "Brand_TemplateSettingsJSON" #> '{tenantBranding,version}' = '1'::jsonb
  and not (("Brand_TemplateSettingsJSON" -> 'tenantBranding') ? 'configured')
  and coalesce(btrim("Brand_TemplateSettingsJSON" #>> '{tenantBranding,logoPath}'), '') = ''
  and upper(coalesce("Brand_TemplateSettingsJSON" #>> '{tenantBranding,primaryColor}', '#0E7D74')) = '#0E7D74'
  and upper(coalesce("Brand_TemplateSettingsJSON" #>> '{tenantBranding,secondaryColor}', '#164E49')) = '#164E49'
  and upper(coalesce("Brand_TemplateSettingsJSON" #>> '{tenantBranding,backgroundColor}', '#F3F4F4')) = '#F3F4F4'
  and upper(coalesce("Brand_TemplateSettingsJSON" #>> '{tenantBranding,surfaceColor}', '#FFFFFF')) = '#FFFFFF'
  and upper(coalesce("Brand_TemplateSettingsJSON" #>> '{tenantBranding,textColor}', '#292929')) = '#292929'
  and coalesce("Brand_TemplateSettingsJSON" #>> '{tenantBranding,appearanceMode}', 'light') = 'light'
  and coalesce("Brand_TemplateSettingsJSON" #>> '{tenantBranding,cornerStyle}', 'rounded') = 'rounded'
  and coalesce(btrim("Brand_TemplateSettingsJSON" #>> '{tenantBranding,emailSignOff}'), '') = '';

commit;
