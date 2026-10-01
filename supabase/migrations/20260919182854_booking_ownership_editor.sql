begin;
set local lock_timeout='5s';

-- New records have a durable initial owner. Existing owners and legacy records are
-- not backfilled; a colleague opening an old Booking must never become its owner.
do $patch$
declare definition text; signature text; before_text text;
begin
 signature:='booking_api.open_booking(uuid,uuid,text,text)';
 definition:=pg_get_functiondef(signature::regprocedure);
 before_text:='"Job_Period","Job_CreatedBy","Job_Customer"';
 if position(before_text in definition)=0 then raise exception 'Review direct Booking owner insertion.';end if;
 definition:=replace(definition,before_text,'"Job_Period","Job_CreatedBy","Job_OperationsOwnerID","Job_Customer"');
 before_text:='to_char(current_date,''YYYYMM''),app_user."User_ID",null';
 if position(before_text in definition)=0 then raise exception 'Review direct Booking owner values.';end if;
 definition:=replace(definition,before_text,'to_char(current_date,''YYYYMM''),app_user."User_ID",app_user."User_ID",null');execute definition;
 signature:='booking_api.convert_accepted_quote_before_sync_review_20260904(uuid,uuid,uuid)';
 definition:=pg_get_functiondef(signature::regprocedure);
 before_text:='"Job_Period", "Job_CreatedBy", "Job_Customer"';
 if position(before_text in definition)=0 then raise exception 'Review Quote conversion owner insertion.';end if;
 definition:=replace(definition,before_text,'"Job_Period", "Job_CreatedBy", "Job_OperationsOwnerID", "Job_Customer"');
 before_text:='to_char(current_date, ''YYYYMM''), actor_user_id, customer_id';
 if position(before_text in definition)=0 then raise exception 'Review Quote conversion owner values.';end if;
 definition:=replace(definition,before_text,'to_char(current_date, ''YYYYMM''), actor_user_id, actor_user_id, customer_id');execute definition;
end $patch$;

create function booking_api.can_use_booking_office(actor uuid, office_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public."cmp_Users" u join public."cmp_Offices" o on o."Company_ID"=u."Company_ID"
 where u."User_ID"=actor and u."User_AccessStatus"='active' and o."Office_ID"=office_id and o."Office_IsActive"
 and case
 when exists(select 1 from public."SEC_UserOfficeAccess" a where a."SECUserOffice_UserID"=actor) then exists(
 select 1 from public."SEC_UserOfficeAccess" a where a."SECUserOffice_UserID"=actor and a."SECUserOffice_OrgOfficeID"=office_id
 and a."SECUserOffice_StatusCode"='active' and a."SECUserOffice_CanView" and a."SECUserOffice_CanCreateJobs"
 and now()>=a."SECUserOffice_EffectiveFrom" and (a."SECUserOffice_EffectiveTo" is null or now()<a."SECUserOffice_EffectiveTo"))
 when exists(select 1 from public."cmp_Users_Offices" a where a."User_ID"=actor) then exists(
 select 1 from public."cmp_Users_Offices" a where a."User_ID"=actor and a."Office_ID"=office_id)
 else public."SEC_UserHasPermission"(actor,'Bookings.Write',office_id) end);
$$;

create function public.booking_ownership_workspace(caller_auth_user_id uuid, requested_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public."cmp_Users"%rowtype; job public."Job_Header"%rowtype; result jsonb;
begin
 if not coalesce(booking_api.has_permission(caller_auth_user_id,'Bookings.Read'),false) then raise exception 'Booking access is not authorised.' using errcode='42501';end if;
 select * into strict actor from public."cmp_Users" where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
 select j.* into job from public."Job_Header" j join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
 where j."Job_ID"=requested_job_id and not j."Job_IsDeleted" and o."Company_ID"=actor."Company_ID";
 if not found then raise exception 'That Booking is outside this workspace.' using errcode='42501';end if;
 select jsonb_build_object('supported',true,'officeId',o."Office_ID",'branch',o."Office_Name",
 'ownerId',coalesce(job."Job_OperationsOwnerID",job."Job_CreatedBy"),'owner',nullif(concat_ws(' ',u."User_Firstname",u."User_Lastname"),''),
 'editable',coalesce(booking_api.has_permission(caller_auth_user_id,'Bookings.Write'),false)
 and booking_api.can_use_booking_office(actor."User_ID",o."Office_ID") and job."Job_Status" in ('draft','open') and not job."Job_ProvisionalCancelled",
 'offices',(select coalesce(jsonb_agg(jsonb_build_object('id',b."Office_ID",'name',b."Office_Name") order by b."Office_Name"),'[]')
 from public."cmp_Offices" b where b."Company_ID"=actor."Company_ID" and booking_api.can_use_booking_office(actor."User_ID",b."Office_ID")),
 'users',(select coalesce(jsonb_agg(jsonb_build_object('id',p."User_ID",'name',concat_ws(' ',p."User_Firstname",p."User_Lastname")) order by p."User_Firstname",p."User_Lastname"),'[]')
 from public."cmp_Users" p where p."Company_ID"=actor."Company_ID" and p."User_AccessStatus"='active')) into result
 from public."cmp_Offices" o left join public."cmp_Users" u on u."User_ID"=coalesce(job."Job_OperationsOwnerID",job."Job_CreatedBy") and u."Company_ID"=actor."Company_ID"
 where o."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID");
 return result;
end $$;

create function public.booking_ownership_save(caller_auth_user_id uuid, requested_job_id uuid, requested_office_id uuid, requested_owner_id uuid, expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public."cmp_Users"%rowtype; job public."Job_Header"%rowtype; context jsonb; target_entity uuid; owner_name text; before_value jsonb; after_value jsonb;
begin
 if not coalesce(booking_api.has_permission(caller_auth_user_id,'Bookings.Write'),false) then raise exception 'Booking changes are not authorised.' using errcode='42501';end if;
 select * into strict actor from public."cmp_Users" where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
 select j.* into job from public."Job_Header" j join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
 where j."Job_ID"=requested_job_id and not j."Job_IsDeleted" and o."Company_ID"=actor."Company_ID" for update of j;
 if not found then raise exception 'That Booking is outside this workspace.' using errcode='42501';end if;
 if expected_updated_at is null or expected_updated_at is distinct from job."Job_UpdatedAt" then raise exception 'Booking changed. Reload before changing ownership.' using errcode='40001';end if;
 context:=public.booking_ownership_workspace(caller_auth_user_id,requested_job_id);
 if not (context->>'editable')::boolean or not booking_api.can_use_booking_office(actor."User_ID",requested_office_id) then
 raise exception 'You cannot change ownership for these branches or this Booking status.' using errcode='42501';end if;
 select concat_ws(' ',u."User_Firstname",u."User_Lastname") into owner_name from public."cmp_Users" u
 where u."User_ID"=requested_owner_id and u."Company_ID"=actor."Company_ID" and u."User_AccessStatus"='active';
 if not found then raise exception 'Choose an active Booking owner in this company.' using errcode='22023';end if;
 if requested_office_id is distinct from coalesce(job."Job_OrgOfficeID",job."Job_OfficeID") then
   target_entity:=booking_api.default_booking_legal_entity(requested_office_id);
   if job."Job_LegalEntityID" is null or target_entity is distinct from job."Job_LegalEntityID" then
     raise exception 'This branch needs a billing-entity review. No branch, currency or charges have been changed.' using errcode='22023';end if;
 end if;
 before_value:=jsonb_build_object('officeId',coalesce(job."Job_OrgOfficeID",job."Job_OfficeID"),'ownerId',coalesce(job."Job_OperationsOwnerID",job."Job_CreatedBy"),'direction',job."Job_Direction");
 after_value:=jsonb_build_object('officeId',requested_office_id,'ownerId',requested_owner_id,'direction',job."Job_Direction");
 if before_value is distinct from after_value then
   update public."Job_Header" set "Job_OfficeID"=requested_office_id,"Job_OrgOfficeID"=requested_office_id,
   "Job_OperationsOwnerID"=requested_owner_id,"Job_EditableDetailsJSON"=coalesce("Job_EditableDetailsJSON",'{}')||jsonb_build_object('ownerName',owner_name),
   "Job_UpdatedBy"=actor."User_ID","Job_UpdatedAt"=clock_timestamp() where "Job_ID"=requested_job_id;
   -- Existing branch-relative direction triggers may also update direction.
   select after_value||jsonb_build_object('direction',"Job_Direction") into after_value from public."Job_Header" where "Job_ID"=requested_job_id;
   insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
   values(actor."Company_ID",requested_job_id,'ownership_changed','Booking ownership changed.',jsonb_build_object('before',before_value,'after',after_value),actor."User_ID");
 end if;
 return jsonb_build_object('saved',true,'jobId',requested_job_id);
end $$;

revoke all on function booking_api.can_use_booking_office(uuid,uuid),public.booking_ownership_workspace(uuid,uuid),public.booking_ownership_save(uuid,uuid,uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.booking_ownership_workspace(uuid,uuid),public.booking_ownership_save(uuid,uuid,uuid,uuid,timestamptz) to service_role;

-- Audit ordinary Details saves under the authenticated editor. Normalise timestamps
-- out of comparisons so a read/no-op is not described as a business change.
create function booking_api.audit_business_value(value jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(value)='object' then return coalesce((select jsonb_object_agg(key,booking_api.audit_business_value(v)) from jsonb_each(value) e(key,v) where key not in ('updatedAt','updatedBy')),'{}');
 elsif jsonb_typeof(value)='array' then return coalesce((select jsonb_agg(booking_api.audit_business_value(v) order by ord) from jsonb_array_elements(value) with ordinality e(v,ord)),'[]');
 else return value;end if;
end $$;
revoke all on function booking_api.audit_business_value(jsonb) from public,anon,authenticated,service_role;

alter function public.booking_workflow_save(uuid,uuid,jsonb) rename to booking_workflow_save_before_editor_audit_20260919;
revoke all on function public.booking_workflow_save_before_editor_audit_20260919(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.booking_workflow_save(caller_auth_user_id uuid,requested_job_id uuid,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public."cmp_Users"%rowtype; job public."Job_Header"%rowtype; before_value jsonb; after_value jsonb; saved jsonb;
begin
 if not coalesce(booking_api.has_permission(caller_auth_user_id,'Bookings.Write'),false) then raise exception 'Booking changes are not authorised.' using errcode='42501';end if;
 select * into strict actor from public."cmp_Users" where "Auth_User_ID"=caller_auth_user_id and "User_AccessStatus"='active';
 select j.* into job from public."Job_Header" j join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
 where j."Job_ID"=requested_job_id and not j."Job_IsDeleted" and o."Company_ID"=actor."Company_ID" for update of j;
 if not found then raise exception 'That Booking is outside this workspace.' using errcode='42501';end if;
 if payload ? 'operationsOwnerId' or payload ? 'officeId' or
   (payload ? 'editableDetails' and payload#>'{editableDetails,ownerName}' is distinct from job."Job_EditableDetailsJSON"->'ownerName') then
   raise exception 'Use the Booking ownership controls to change the owner or branch.' using errcode='22023';end if;
 before_value:=booking_api.audit_business_value(booking_api.workspace(caller_auth_user_id,job."Job_BookingReference") - array['events','documents','declarations','charges','sourceQuote']);
 saved:=public.booking_workflow_save_before_editor_audit_20260919(caller_auth_user_id,requested_job_id,payload);
 after_value:=booking_api.audit_business_value(booking_api.workspace(caller_auth_user_id,job."Job_BookingReference") - array['events','documents','declarations','charges','sourceQuote']);
 if before_value is distinct from after_value then
   insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
   values(actor."Company_ID",requested_job_id,'details_changed','Booking details changed.',jsonb_build_object('before',before_value,'after',after_value),actor."User_ID");
 end if;
 return jsonb_set(saved,'{events}',coalesce(booking_api.workspace(caller_auth_user_id,job."Job_BookingReference")->'events','[]'));
end $$;
revoke all on function public.booking_workflow_save(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.booking_workflow_save(uuid,uuid,jsonb) to service_role;
commit;
