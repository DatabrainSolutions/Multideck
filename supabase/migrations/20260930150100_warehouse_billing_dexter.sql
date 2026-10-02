begin;
set local lock_timeout='5s';

-- Dexter parity for warehouse billing.
-- Chat can read the billing settings and a customer's calculated charges for
-- the current and previous billing period through the same functions, access
-- checks and warehouse scope as Warehouse > Charges. Charges are calculated on
-- demand for review, so there is no stored record change to watch yet and no
-- Dexter write: changing settings stays in Admin > Warehouse > Billing settings.

create function public.multideck_dexter_domain_warehouse_charges(p_company_id uuid, p_search text, p_take integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  actor public."cmp_Users"%rowtype;
  facilities uuid[];
  settings jsonb;
  customers jsonb;
  target uuid;
  cur_period jsonb;
  previous jsonb;
begin
  select * into actor from public."cmp_Users" where "Auth_User_ID"=auth.uid()
    and coalesce("User_AccessStatus",'active')='active' and "Company_ID" is not null;
  if actor."User_ID" is null or actor."Company_ID"<>p_company_id then
    raise exception 'The warehouse workspace is unavailable.' using errcode='42501'; end if;
  settings:=public.warehouse_billing_settings(null,null)-'canManage';

  select coalesce(array_agg(distinct facility."WMSFacility_ID"),'{}') into facilities
  from public."cmp_Users_Offices" link
  join public."cmp_Offices" office on office."Office_ID"=link."Office_ID" and office."Company_ID"=actor."Company_ID"
  join public."WMS_Facilities" facility on facility."WMSFacility_OrgOfficeID"=office."Office_ID" and not facility."WMSFacility_IsDeleted"
  where link."User_ID"=actor."User_ID";

  select coalesce(jsonb_agg(jsonb_build_object('recordId',c.id,'name',c.name,'sourceUrl','/warehouse/charges?customer='||c.id) order by c.name),'[]') into customers
  from (
    select distinct organisation."Org_id" id, organisation."Org_Name" name
    from public."Org_Master" organisation
    where (exists(select 1 from public."WMS_Orders" o where o."WMSOrder_CustomerOrgID"=organisation."Org_id" and o."WMSOrder_FacilityID"=any(facilities) and not o."WMSOrder_IsDeleted")
        or exists(select 1 from public."WMS_InventoryBalances" b where b."WMSBalance_CustomerOrgID"=organisation."Org_id" and b."WMSBalance_FacilityID"=any(facilities)))
      and (p_search is null or organisation."Org_id"::text=p_search or organisation."Org_Name" ilike '%'||replace(replace(p_search,'%','\%'),'_','\_')||'%')
    order by organisation."Org_Name" limit greatest(1,least(coalesce(p_take,10),25))
  ) c;

  if p_search is not null and jsonb_array_length(customers)=1 then
    target:=(customers->0->>'recordId')::uuid;
    cur_period:=public.warehouse_charge_statement(target,null);
    previous:=public.warehouse_charge_statement(target,(cur_period#>>'{period,previousStart}')::date);
    return jsonb_build_array(jsonb_build_object('recordId',target,'sourceUrl','/warehouse/charges?customer='||target,
      'sourceTable','warehouse_charge_statement','settings',settings,'currentPeriod',cur_period,'previousPeriod',previous,
      'evidence','Calculated on request from goods-in receipts, goods-out dispatches and stock recorded at the daily cut-off, using the customer and default rate cards. Not an invoice.'));
  end if;
  return jsonb_build_array(jsonb_build_object('settings',settings,'sourceUrl','/warehouse/billing','customers',customers,
    'hint','Search with one customer name or ID to read that customer''s calculated charges.'));
end $$;
revoke all on function public.multideck_dexter_domain_warehouse_charges(uuid,text,integer) from public, anon;
grant execute on function public.multideck_dexter_domain_warehouse_charges(uuid,text,integer) to authenticated;

delete from public."sys_AIDexterDataDomains" where "AIDexterDomain_Code"='warehouse_charges';
insert into public."sys_AIDexterDataDomains"("AIDexterDomain_Code","AIDexterDomain_Name","AIDexterDomain_Description","AIDexterDomain_QueryFunction","AIDexterDomain_RequiredPermissionsJSON","AIDexterDomain_DataCategoriesJSON")
values('warehouse_charges','Warehouse charges',
  'Warehouse billing settings (time zone, daily cut-off, weekly or monthly cycle) and, when searched with one customer, that customer''s calculated goods-in, goods-out and storage charges for the current and previous billing period with warnings. Storage is charged only on stock recorded at a cut-off after it was booked in; expected receipts, orders, invoices and purchase orders are never charged. These are calculated charges for review, not invoices or posted amounts. Changing settings, approving charges and watching charges are not available in chat; direct the operator to /warehouse/billing or /warehouse/charges.',
  'multideck_dexter_domain_warehouse_charges','["Warehouse.Read"]','["business_record","warehouse_details","financial"]');

commit;
