begin;
create or replace function public._multideck_dexter_address_watch_value(p_row jsonb)
returns jsonb language sql immutable set search_path=pg_catalog,public as $$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(p_row)
 where key in ('OrgAdd_ID','Org_ID','Org_NameOverride','OrgAdd_Line1','OrgAdd_Line2',
 'OrgAdd_TownCity','OrgAdd_CountyState','OrgAdd_PostZipCode','OrgAdd_Country','OrgAdd_UNLOCODE',
 'OrgAdd_TimeZone','OrgAdd_IsActive','OrgAdd_MainEmail','OrgAdd_MainPhone')
$$;
commit;
