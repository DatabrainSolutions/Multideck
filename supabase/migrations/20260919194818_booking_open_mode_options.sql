begin;
set local lock_timeout='5s';
create function public.booking_workflow_open_options(caller_auth_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(booking_api.has_permission(caller_auth_user_id,'Bookings.Write'),false)
 or not exists(select 1 from public."cmp_Users" where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active') then
 raise exception 'Booking creation is not authorised.' using errcode='42501';end if;
 return jsonb_build_object('modes',(select coalesce(jsonb_agg(jsonb_build_object('code',"JTM_Code",'name',"JTM_Name") order by "JTM_SortOrder","JTM_Code"),'[]') from public."sys_JobTransportModes" where "JTM_IsActive"));
end $$;
revoke all on function public.booking_workflow_open_options(uuid) from public,anon,authenticated;
grant execute on function public.booking_workflow_open_options(uuid) to service_role;
commit;
