begin;
create schema if not exists private_live_gateway;
revoke all on schema private_live_gateway from public,anon,authenticated;
create table private_live_gateway.connections(id text primary key, enabled boolean not null default false);
create table private_live_gateway.keys(id text primary key, connection_id text not null references private_live_gateway.connections(id),enabled boolean not null default false,expires_at timestamptz);
create table private_live_gateway.customer_grants(
  id text primary key,connection_id text not null references private_live_gateway.connections(id),subject_id text not null,
  organisation_id uuid not null references public."Org_Master"("Org_id"),facility_ids uuid[] not null default '{}',enabled boolean not null default false
);
create table private_live_gateway.requests(
  key_id text not null references private_live_gateway.keys(id),nonce uuid not null,connection_id text not null,
  subject_id text not null,grant_id text not null,operation text not null,created_at timestamptz not null default now(),
  primary key(key_id,nonce)
);
alter table private_live_gateway.connections enable row level security;
alter table private_live_gateway.keys enable row level security;
alter table private_live_gateway.customer_grants enable row level security;
alter table private_live_gateway.requests enable row level security;
revoke all on all tables in schema private_live_gateway from public,anon,authenticated;

create function public.live_gateway_read(p_key_id text,p_connection_id text,p_subject_id text,p_grant_id text,p_nonce uuid,p_operation text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare grant_row private_live_gateway.customer_grants%rowtype; facilities uuid[]; selected uuid;
  result jsonb; page_offset integer; page_size integer;
begin
  if p_nonce is null or p_operation not in ('warehouse.context','warehouse.stock','warehouse.products') or p_operation is null
    or jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid request' using errcode='22023'; end if;
  perform 1 from private_live_gateway.keys k join private_live_gateway.connections c on c.id=k.connection_id
    where k.id=p_key_id and c.id=p_connection_id and c.enabled and k.enabled and (k.expires_at is null or k.expires_at>now()) for share of k,c;
  if not found then raise exception 'Connection denied' using errcode='42501'; end if;
  select * into grant_row from private_live_gateway.customer_grants g
    where g.id=p_grant_id and g.connection_id=p_connection_id and g.subject_id=p_subject_id and g.enabled for share;
  if not found then raise exception 'Customer grant denied' using errcode='42501'; end if;
  if exists(select 1 from jsonb_object_keys(p_input) k where k not in ('facilityId','offset','limit'))
    or (p_operation='warehouse.context' and p_input<>'{}'::jsonb) then raise exception 'Unsupported filter' using errcode='22023'; end if;
  if coalesce(p_input->>'offset','0')!~'^\d+$' or coalesce(p_input->>'limit','50')!~'^\d+$' then raise exception 'Invalid page' using errcode='22023'; end if;
  page_offset:=(coalesce(p_input->>'offset','0'))::integer; page_size:=(coalesce(p_input->>'limit','50'))::integer;
  if page_offset<0 or page_offset>100000 or page_size<1 or page_size>100 then raise exception 'Invalid page' using errcode='22023'; end if;
  selected:=nullif(p_input->>'facilityId','')::uuid;
  select coalesce(array_agg(f."WMSFacility_ID"),'{}') into facilities
    from public."WMS_CustomerFacilityAccess" a join public."WMS_Facilities" f on f."WMSFacility_ID"=a."WMSCustomerFacilityAccess_FacilityID"
    where a."WMSCustomerFacilityAccess_CustomerOrgID"=grant_row.organisation_id and a."WMSCustomerFacilityAccess_IsActive"
      and f."WMSFacility_ID"=any(grant_row.facility_ids) and f."WMSFacility_IsActive" and not f."WMSFacility_IsDeleted";
  if selected is not null and not selected=any(facilities) then raise exception 'Warehouse denied' using errcode='42501'; end if;
  insert into private_live_gateway.requests(key_id,nonce,connection_id,subject_id,grant_id,operation)
    values(p_key_id,p_nonce,p_connection_id,p_subject_id,p_grant_id,p_operation);
  if p_operation='warehouse.context' then
    select jsonb_build_object('assignments',coalesce(jsonb_agg(jsonb_build_object('facilityId',f."WMSFacility_ID",'facilityCode',f."WMSFacility_Code",'facilityName',f."WMSFacility_Name") order by f."WMSFacility_Name",f."WMSFacility_ID"),'[]'::jsonb)) into result
    from public."WMS_Facilities" f where f."WMSFacility_ID"=any(facilities);
  else
    with records as (
      select b."WMSBalance_ID" as id,i."WMSItem_SKU"::text as sku,jsonb_build_object('id',b."WMSBalance_ID",'itemId',i."WMSItem_ID",'sku',i."WMSItem_SKU",'description',i."WMSItem_Description",
        'facilityId',b."WMSBalance_FacilityID",'uom',b."WMSBalance_UOMCode",'onHand',b."WMSBalance_OnHandQuantity",'available',b."WMSBalance_AvailableQuantity",
        'held',b."WMSBalance_HeldQuantity",'reserved',b."WMSBalance_ReservedQuantity",'allocated',b."WMSBalance_AllocatedQuantity",'updatedAt',b."WMSBalance_UpdatedAt") as value
      from public."WMS_InventoryBalances" b join public."WMS_Items" i on i."WMSItem_ID"=b."WMSBalance_ItemID" and i."WMSItem_CustomerOrgID"=grant_row.organisation_id and not i."WMSItem_IsDeleted"
      where p_operation='warehouse.stock' and b."WMSBalance_CustomerOrgID"=grant_row.organisation_id and b."WMSBalance_FacilityID"=any(facilities) and (selected is null or b."WMSBalance_FacilityID"=selected)
      union all
      select i."WMSItem_ID",i."WMSItem_SKU",jsonb_build_object('id',i."WMSItem_ID",'sku',i."WMSItem_SKU",'description',i."WMSItem_Description",'uom',i."WMSItem_BaseUOMCode",'active',i."WMSItem_IsActive",'updatedAt',i."WMSItem_UpdatedAt")
      from public."WMS_Items" i where p_operation='warehouse.products' and i."WMSItem_CustomerOrgID"=grant_row.organisation_id and not i."WMSItem_IsDeleted"
        and exists(select 1 from public."WMS_ItemFacilityAssignments" a where a."WMSItemFacility_ItemID"=i."WMSItem_ID" and a."WMSItemFacility_IsActive" and a."WMSItemFacility_FacilityID"=any(facilities) and (selected is null or a."WMSItemFacility_FacilityID"=selected))
    ), page as(select * from records order by sku,id limit page_size+1 offset page_offset), numbered as(select *,row_number() over(order by sku,id) as n from page)
    select jsonb_build_object('rows',coalesce(jsonb_agg(value order by n) filter(where n<=page_size),'[]'::jsonb),'hasMore',count(*)>page_size,'offset',page_offset) into result from numbered;
  end if;
  return result;
end;
$$;
revoke all on function public.live_gateway_read(text,text,text,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.live_gateway_read(text,text,text,text,uuid,text,jsonb) to service_role;
commit;
