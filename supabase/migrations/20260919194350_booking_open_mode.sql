begin;
set local lock_timeout='5s';

-- One transaction: retain existing owner/branch/reference/idempotency rules,
-- and use the existing operational mode validation/save before returning.
create function public.booking_workflow_open_with_mode(
 caller_auth_user_id uuid,requested_idempotency_key uuid,requested_sequence_key text,
 requested_direction text,requested_mode text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare opened jsonb; mode_code text;
begin
 if not coalesce(booking_api.has_permission(caller_auth_user_id,'Bookings.Write'),false) then
   raise exception 'Booking creation is not authorised.' using errcode='42501';end if;
 if requested_direction is null or requested_direction not in ('import','export','domestic','cross_trade') then
   raise exception 'Choose a Booking direction.' using errcode='22023';end if;
 mode_code:=booking_api.normalise_mode(requested_mode);
 if mode_code is null then raise exception 'Choose an active Booking mode.' using errcode='22023';end if;
 opened:=booking_api.open_booking(caller_auth_user_id,requested_idempotency_key,requested_sequence_key,requested_direction);
 if (opened->>'reused')::boolean is false then
   perform public.booking_workflow_save(caller_auth_user_id,(opened->>'jobId')::uuid,jsonb_build_object('mode',mode_code));
 end if;
 return opened;
end $$;
revoke all on function public.booking_workflow_open_with_mode(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.booking_workflow_open_with_mode(uuid,uuid,text,text,text) to service_role;
comment on function public.booking_workflow_open_with_mode(uuid,uuid,text,text,text) is
'Operator creation dialog only. Dexter Booking creation remains unsupported; saved mode remains available through existing Booking read/watch capabilities.';
commit;
