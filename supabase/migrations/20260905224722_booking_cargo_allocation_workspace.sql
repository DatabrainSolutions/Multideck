begin;
set local lock_timeout='5s';

alter function booking_api.workspace_extended(uuid,text) rename to workspace_before_allocations_20260905;
create function booking_api.workspace_extended(caller_auth_user_id uuid,requested_reference text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; allocation_state jsonb;
begin
  result:=booking_api.workspace_before_allocations_20260905(caller_auth_user_id,requested_reference);
  allocation_state:=booking_api.cargo_allocation_state(caller_auth_user_id,(result#>>'{booking,jobId}')::uuid);
  return result||jsonb_build_object('cargoAllocationState',allocation_state);
end $$;

-- The existing save endpoint remains authoritative. Allocation-aware clients
-- supply a full reviewed allocation list and the previously read Job timestamp.
-- Older clients omit the key, preserving allocations. All existing Booking
-- validation (including branch direction/mode approvals) still runs unchanged.
alter function public.booking_workflow_save(uuid,uuid,jsonb) rename to booking_workflow_save_before_allocations_20260905;
create function public.booking_workflow_save(caller_auth_user_id uuid,requested_job_id uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; reference text; saved_timestamp timestamptz;
begin
  if not coalesce(payload ? 'cargoAllocations',false) then
    return public.booking_workflow_save_before_allocations_20260905(caller_auth_user_id,requested_job_id,payload);
  end if;
  -- Read validates the actor and company before acquiring the write lock.
  perform booking_api.cargo_allocation_state(caller_auth_user_id,requested_job_id);
  if not booking_api.has_permission(caller_auth_user_id,'Bookings.Write') then
    raise exception 'Booking changes are not authorised.' using errcode='42501';end if;
  if jsonb_typeof(payload->'expectedUpdatedAt') is distinct from 'string' or
    jsonb_typeof(payload->'cargoAllocations') is distinct from 'array' then
    raise exception 'Reload the Booking before reviewing cargo allocations.' using errcode='22023';end if;
  select "Job_BookingReference","Job_UpdatedAt" into reference,saved_timestamp from public."Job_Header"
    where "Job_ID"=requested_job_id and not "Job_IsDeleted" for update;
  if not found or (payload->>'expectedUpdatedAt')::timestamptz is distinct from saved_timestamp then
    raise exception 'Booking changed. Reload before saving cargo allocations.' using errcode='40001';end if;
  -- Stable cargo/equipment/route identities must already exist. New unsaved
  -- rows are saved first; allocation never guesses their identities by order.
  if payload-'cargoAllocations'-'expectedUpdatedAt'<>'{}'::jsonb then
    perform public.booking_workflow_save_before_allocations_20260905(caller_auth_user_id,requested_job_id,payload-'cargoAllocations'-'expectedUpdatedAt');
  end if;
  select "Job_UpdatedAt" into saved_timestamp from public."Job_Header" where "Job_ID"=requested_job_id;
  perform booking_api.replace_cargo_allocations(caller_auth_user_id,requested_job_id,
    jsonb_build_object('expectedUpdatedAt',saved_timestamp,'allocations',payload->'cargoAllocations'));
  result:=booking_api.workspace_extended(caller_auth_user_id,reference);
  return result;
end $$;

revoke all on function booking_api.workspace_before_allocations_20260905(uuid,text),
  public.booking_workflow_save_before_allocations_20260905(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function booking_api.workspace_extended(uuid,text),public.booking_workflow_save(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function booking_api.workspace_extended(uuid,text),public.booking_workflow_save(uuid,uuid,jsonb) to service_role;
commit;
