begin;
alter table private_live_gateway.customer_grants add column version integer not null default 1;
create table private_live_gateway.grant_audit(
 id bigint generated always as identity primary key,actor_id uuid not null,grant_id text not null,
 reason text not null,before_value jsonb not null,after_value jsonb not null,created_at timestamptz not null default now()
);
alter table private_live_gateway.grant_audit enable row level security;
revoke all on private_live_gateway.grant_audit from public,anon,authenticated,service_role;
create trigger gateway_grant_audit_immutable before update or delete on private_live_gateway.grant_audit
for each row execute function private_live_gateway.prevent_history_changes();
create function public.live_gateway_admin_grants(p_actor_id uuid,p_organisation_id uuid,p_facility_ids uuid[],p_input jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g private_live_gateway.customer_grants%rowtype; result jsonb; requested_facilities uuid[]; previous jsonb:='{}';
begin
 if p_actor_id is null or p_organisation_id is null or coalesce(cardinality(p_facility_ids),0)=0 then raise exception 'Warehouse administration denied' using errcode='42501'; end if;
 if p_input is null then
   select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]') into result from private_live_gateway.customer_grants a
   where a.organisation_id=p_organisation_id and a.facility_ids<@p_facility_ids;
   return result;
 end if;
 if jsonb_typeof(p_input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('id','connectionId','keyId','subjectId','facilityIds','enabled','productsEnabled','ordersEnabled','purchaseOrdersEnabled','expectedVersion','reason'))
   or coalesce(p_input->>'id','')!~'^[A-Za-z0-9_-]{1,128}$' or coalesce(p_input->>'connectionId','')!~'^[A-Za-z0-9_-]{1,128}$'
   or coalesce(p_input->>'keyId','')!~'^[A-Za-z0-9_-]{1,128}$' or coalesce(p_input->>'subjectId','')!~'^[A-Za-z0-9_-]{1,128}$'
   or nullif(btrim(p_input->>'reason'),'') is null or length(p_input->>'reason')>500
   or jsonb_typeof(p_input->'facilityIds') is distinct from 'array' then raise exception 'Invalid grant' using errcode='22023'; end if;
 if exists(select 1 from unnest(array['enabled','productsEnabled','ordersEnabled','purchaseOrdersEnabled']) k where jsonb_typeof(p_input->k) is distinct from 'boolean') then raise exception 'Choose each permission' using errcode='22023'; end if;
 select array_agg(distinct value::uuid) into requested_facilities from jsonb_array_elements_text(p_input->'facilityIds');
 if coalesce(cardinality(requested_facilities),0)=0 or not requested_facilities<@p_facility_ids or ((p_input->>'enabled')::boolean and exists(select 1 from unnest(requested_facilities) id
   where not exists(select 1 from public."WMS_CustomerFacilityAccess" a join public."WMS_Facilities" f on f."WMSFacility_ID"=a."WMSCustomerFacilityAccess_FacilityID"
     where a."WMSCustomerFacilityAccess_CustomerOrgID"=p_organisation_id and a."WMSCustomerFacilityAccess_FacilityID"=id and a."WMSCustomerFacilityAccess_IsActive" and f."WMSFacility_IsActive" and not f."WMSFacility_IsDeleted"))) then raise exception 'Warehouse assignment denied' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_input->>'id',0));
 select * into g from private_live_gateway.customer_grants where id=p_input->>'id' for update;
 if g.id is not null and (g.organisation_id<>p_organisation_id or not g.facility_ids<@p_facility_ids or g.connection_id<>p_input->>'connectionId' or g.subject_id<>p_input->>'subjectId') then raise exception 'Grant identity cannot be reassigned' using errcode='42501'; end if;
 if (g.id is null and p_input->>'expectedVersion' is not null) or (g.id is not null and g.version is distinct from (p_input->>'expectedVersion')::integer) then raise exception 'Grant changed' using errcode='40001'; end if;
 if g.id is not null then previous:=to_jsonb(g); end if;
 if (p_input->>'enabled')::boolean then
 insert into private_live_gateway.connections(id,enabled) values(p_input->>'connectionId',true) on conflict(id) do nothing;
 insert into private_live_gateway.keys(id,connection_id,enabled) values(p_input->>'keyId',p_input->>'connectionId',true) on conflict(id) do nothing;
 if not exists(select 1 from private_live_gateway.keys k join private_live_gateway.connections c on c.id=k.connection_id where k.id=p_input->>'keyId' and k.connection_id=p_input->>'connectionId' and k.enabled and c.enabled and (k.expires_at is null or k.expires_at>now())) then raise exception 'Connection key is disabled or belongs to another company' using errcode='42501'; end if;
 end if;
 insert into private_live_gateway.customer_grants as a(id,connection_id,subject_id,organisation_id,facility_ids,enabled,products_enabled,orders_enabled,purchase_orders_enabled)
 values(p_input->>'id',p_input->>'connectionId',p_input->>'subjectId',p_organisation_id,requested_facilities,(p_input->>'enabled')::boolean,(p_input->>'productsEnabled')::boolean,(p_input->>'ordersEnabled')::boolean,(p_input->>'purchaseOrdersEnabled')::boolean)
 on conflict(id) do update set facility_ids=excluded.facility_ids,enabled=excluded.enabled,products_enabled=excluded.products_enabled,orders_enabled=excluded.orders_enabled,purchase_orders_enabled=excluded.purchase_orders_enabled,version=a.version+1
 returning to_jsonb(a) into result;
 insert into private_live_gateway.grant_audit(actor_id,grant_id,reason,before_value,after_value) values(p_actor_id,p_input->>'id',btrim(p_input->>'reason'),previous,result);
 return result;
end;
$$;
revoke all on function public.live_gateway_admin_grants(uuid,uuid,uuid[],jsonb) from public,anon,authenticated;
grant execute on function public.live_gateway_admin_grants(uuid,uuid,uuid[],jsonb) to service_role;
commit;
