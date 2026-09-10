begin;
alter table private_live_gateway.customer_grants add column email text,add column live_customer_id bigint,add column live_sync_status text not null default 'pending' check(live_sync_status in ('pending','ready')); 
create function public.live_gateway_admin_email_access(p_actor_id uuid,p_organisation_id uuid,p_facility_ids uuid[],p_input jsonb,p_email text,p_live_customer_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; old_value jsonb;
begin
 if p_email is null or length(p_email)>254 or p_email!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or p_live_customer_id is null or p_live_customer_id<1 then raise exception 'Choose a Live customer' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_input->>'id',0));
 select to_jsonb(g) into old_value from private_live_gateway.customer_grants g where g.id=p_input->>'id';
 if old_value->>'live_customer_id' is not null and (old_value->>'live_customer_id')::bigint<>p_live_customer_id then raise exception 'Customer identity cannot change' using errcode='42501'; end if;
 result:=public.live_gateway_admin_grants(p_actor_id,p_organisation_id,p_facility_ids,p_input);
 update private_live_gateway.customer_grants g set email=lower(btrim(p_email)),live_customer_id=p_live_customer_id,live_sync_status='pending' where g.id=result->>'id' returning to_jsonb(g) into result;
 insert into private_live_gateway.grant_audit(actor_id,grant_id,reason,before_value,after_value) values(p_actor_id,result->>'id','Verified Live email binding',coalesce(old_value,'{}'),result);
 return result;
end;
$$;
revoke all on function public.live_gateway_admin_email_access(uuid,uuid,uuid[],jsonb,text,bigint) from public,anon,authenticated;
grant execute on function public.live_gateway_admin_email_access(uuid,uuid,uuid[],jsonb,text,bigint) to service_role;
create function public.live_gateway_access_synced(p_grant_id text,p_version integer) returns void language sql security definer set search_path='' as $$
 update private_live_gateway.customer_grants set live_sync_status='ready' where id=p_grant_id and version=p_version;
$$;
revoke all on function public.live_gateway_access_synced(text,integer) from public,anon,authenticated;
grant execute on function public.live_gateway_access_synced(text,integer) to service_role;
commit;
