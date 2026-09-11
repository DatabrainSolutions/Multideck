begin;
create or replace function public.multideck_dexter_domain_booking_summary(p_company_id uuid,p_search text,p_take integer)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if nullif(btrim(p_search),'') is not null then
  return jsonb_build_object('error','This summary counts all accessible bookings. Use an empty search, then use the returned status groups.');
 end if;
 with scoped as (
  select coalesce(nullif(btrim(j."Job_Status"),''),'Unknown') as status,j."Job_ClosedDate" is not null as closed
  from public."Job_Header" j join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
  where o."Company_ID"=p_company_id and not coalesce(j."Job_IsDeleted",false)
 ), grouped as (select status,closed,count(*) as total from scoped group by status,closed)
 select jsonb_build_object('totalCount',coalesce(sum(total),0),'countIsExact',true,
  'scope','All non-deleted bookings in the signed-in company; no result limit.',
  'byStatus',coalesce(jsonb_agg(jsonb_build_object('status',status,'hasClosedDate',closed,'count',total) order by status,closed),'[]'::jsonb),
  'observedAt',statement_timestamp(),'sourceUrl','/bookings') into result from grouped;
 return result;
end $$;
revoke all on function public.multideck_dexter_domain_booking_summary(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.multideck_dexter_domain_booking_summary(uuid,text,integer) to service_role;
insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON")
values('booking_summary','Booking counts','Exact total and saved-status counts for all accessible non-deleted bookings. Use an empty search. Explain which status groups you count as active; closed dates are reported separately. Query bookings for individual examples. Count-threshold watching is not supported; existing booking watches track individual status changes.','multideck_dexter_domain_booking_summary','["Bookings.Read"]','["operational"]');
commit;
