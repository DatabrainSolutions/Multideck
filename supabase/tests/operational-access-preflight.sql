-- Administrative, read-only business-data probe. All temporary state is rolled
-- back. Uses real authenticated RLS and public register RPCs for every active
-- internal operator. Outputs counts, never business payloads or credentials.
begin;
create temporary table operational_access_results (
  account_id uuid, company_id uuid, result jsonb
);
do $probe$
declare actor record; actual jsonb; expected jsonb;
begin
  for actor in
    select u."User_ID",u."Auth_User_ID",u."Company_ID"
    from public."cmp_Users" u
    where u."Auth_User_ID" is not null and u."Company_ID" is not null
      and coalesce(u."User_AccessStatus",'active')='active'
      and exists (
        select 1 from public."cmp_Users_Roles" ur
        join public."sys_UserRoles" r using("sys_UserRole_ID")
        where ur."User_ID"=u."User_ID" and lower(r."sys_UserRole_Name") in
          ('administrator','company admin','system admin','company manager','company user','operations manager','operator')
      )
  loop
    if not booking_api.has_permission(actor."Auth_User_ID",'Quotes.Read')
       or not booking_api.has_permission(actor."Auth_User_ID",'Bookings.Read') then
      raise exception 'Missing operational read permission for account %',actor."User_ID";
    end if;
    select jsonb_build_object(
      'bookings',(select coalesce(jsonb_agg(j."Job_ID" order by j."Job_ID"),'[]') from public."Job_Header" j join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID") where o."Company_ID"=actor."Company_ID"),
      'quotes',(select coalesce(jsonb_agg(q."CusQuoteHeader_ID" order by q."CusQuoteHeader_ID"),'[]') from public."CusQuote_Header" q join public."cmp_Offices" o on o."Office_ID"=coalesce(q."CusQuoteHeader_OrgOfficeID",q."OrgOffice_ID") where o."Company_ID"=actor."Company_ID")
    ) into expected;
    perform set_config('request.jwt.claim.sub',actor."Auth_User_ID"::text,true);
    set local role authenticated;
    select jsonb_build_object(
      'bookings',(select coalesce(jsonb_agg("Job_ID" order by "Job_ID"),'[]') from public."Job_Header"),
      'quotes',(select coalesce(jsonb_agg("CusQuoteHeader_ID" order by "CusQuoteHeader_ID"),'[]') from public."CusQuote_Header")
    ) into actual;
    if actual is distinct from expected then
      raise exception 'Operational visibility mismatch for account %',actor."User_ID";
    end if;
    select jsonb_build_object(
      'bookings',jsonb_array_length(actual->'bookings'),
      'quotes',jsonb_array_length(actual->'quotes'),
      'routing',(select count(*) from public."Job_Routing"),
      'cargo',(select count(*) from public."Job_Cargo"),
      'quoteLines',(select count(*) from public."CusQuote_Lines"),
      'organisations',(select count(*) from public."Org_Master"),
      'documents',(select count(*) from public."DOC_StoredObjects"),
      'bookingRegister',public.multideck_booking_register_page(p_scope=>'All Jobs',p_limit=>1,p_offset=>0)->'total',
      'quoteRegister',public.multideck_quote_register_page(p_limit=>1,p_offset=>0)->'total'
    ) into actual;
    reset role;
    insert into operational_access_results values(actor."User_ID",actor."Company_ID",actual);
  end loop;
  if not exists(select 1 from operational_access_results) then raise exception 'No active internal operators were tested'; end if;
  if exists(select 1 from operational_access_results group by company_id having count(distinct result)>1) then
    raise exception 'Colleague register or child-data visibility differs; review intentional scope before release';
  end if;
end $probe$;
select company_id,count(*) as accounts_checked,(array_agg(result))[1] as verified_counts
from operational_access_results group by company_id;
rollback;
