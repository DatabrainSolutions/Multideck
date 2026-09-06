begin;
set local lock_timeout='5s';

create function booking_api.dexter_route_mode_review(company_id uuid,user_id uuid,arguments jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare actor uuid;job public."Job_Header";leg public."Job_Routing";to_mode text;from_mode text;references_before jsonb;
  changes jsonb;field record;review jsonb;
begin
  select "Auth_User_ID" into actor from public."cmp_Users" where "User_ID"=user_id and "Company_ID"=company_id and "User_AccessStatus"='active';
  if actor is null or not booking_api.has_permission(actor,'Bookings.Read') or not booking_api.has_permission(actor,'Bookings.Write') then
    raise exception 'You do not have permission to change routing mode.' using errcode='42501';end if;
  if jsonb_typeof(arguments) is distinct from 'object'
    or not (arguments ?& array['target_id','route_id','expected_updated_at','expected_route_updated_at','mode','reason'])
    or exists(select 1 from jsonb_object_keys(arguments) key where key not in ('target_id','route_id','expected_updated_at','expected_route_updated_at','mode','reason','mode_review','_document_evidence'))
    or (arguments ? '_document_evidence' and jsonb_typeof(arguments->'_document_evidence') is distinct from 'object')
    or nullif(btrim(arguments->>'reason'),'') is null then raise exception 'Provide an exact routing mode proposal and reason.' using errcode='22023';end if;
  select j.* into job from public."Job_Header" j join public."cmp_Offices" office on office."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
    where j."Job_ID"=nullif(arguments->>'target_id','')::uuid and office."Company_ID"=company_id and not j."Job_IsDeleted";
  if not found then raise exception 'That booking is outside this workspace.' using errcode='42501';end if;
  select * into leg from public."Job_Routing" where "JobRoute_ID"=nullif(arguments->>'route_id','')::uuid and "Job_ID"=job."Job_ID";
  if not found then raise exception 'Choose an exact routing leg from this booking.' using errcode='42501';end if;
  if nullif(arguments->>'expected_updated_at','') is null or job."Job_UpdatedAt" is distinct from (arguments->>'expected_updated_at')::timestamptz
    or nullif(arguments->>'expected_route_updated_at','') is null or leg."JobRoute_UpdatedAt" is distinct from (arguments->>'expected_route_updated_at')::timestamptz then
    raise exception 'The booking or routing leg changed. Read it again and request fresh approval.' using errcode='40001';end if;
  to_mode:=booking_api.normalise_mode(arguments->>'mode');from_mode:=booking_api.normalise_mode(leg."JobRoute_ModeCode");
  if to_mode is null then raise exception 'Choose an active mode from the workspace lookup.' using errcode='22023';end if;
  if to_mode is not distinct from from_mode then raise exception 'This leg already uses that mode.' using errcode='22023';end if;
  references_before:=jsonb_build_object('masterTransportReference',nullif(btrim(leg."JobRoute_MasterTransportReference"),''),
    'houseTransportReference',nullif(btrim(leg."JobRoute_HouseTransportReference"),''),
    'carrierBookingReference',nullif(btrim(leg."JobRoute_CarrierBookingReference"),''),
    'transportMeansName',nullif(btrim(leg."JobRoute_TransportMeansName"),''));
  review:=jsonb_build_object('fromMode',from_mode,'toMode',to_mode,'beforeReferences',references_before);
  changes:=jsonb_build_array(jsonb_build_object('field','Routing leg mode','before',from_mode,'after',to_mode,'value',to_mode,'beforeKnown',true,'kind','changed'));
  for field in select * from (values('masterTransportReference','Master transport reference'),('houseTransportReference','House transport reference'),
    ('carrierBookingReference','Carrier booking reference'),('transportMeansName','Transport service')) fields(key,label) loop
    changes:=changes||jsonb_build_array(jsonb_build_object('field',field.label,'before',references_before->field.key,'after',null,'value',null,'beforeKnown',true,'kind','removed'));
  end loop;
  -- Optional upload provenance is retained for audit only. It cannot supply
  -- target identities, current values, the mode review or approval authority.
  return jsonb_build_object('arguments',(arguments-'mode_review')||jsonb_build_object('mode',to_mode,'mode_review',review),
    'title',format('Change %s · Leg %s mode',job."Job_BookingReference",leg."JobRoute_OrderNo"),
    'description','Warning: changing this leg mode clears its shared transport references. Previous references and mode-specific transport evidence remain in audit/history. Other legs, the overall Booking mode, cargo, equipment, documents and the accepted Quote stay unchanged. Carrier and planned dates stay as they are: review their suitability for the new mode before approving.',
    'changes',changes);
end $$;

-- Persist a database-derived approval card. Caller/model copy cannot hide the
-- reset. Once prepared, neither the arguments nor the displayed review change.
create function booking_api.secure_dexter_route_mode_proposal()
returns trigger language plpgsql security definer set search_path='' as $$
declare review jsonb;
begin
  if tg_op='UPDATE' then
    if old."AIDexterPrepared_ActionCode"='change_booking_route_mode' or new."AIDexterPrepared_ActionCode"='change_booking_route_mode' then
      if row(old."AIDexterPrepared_ActionCode",old."AIDexterPrepared_ArgumentsJSON",old."AIDexterPrepared_Title",old."AIDexterPrepared_Description",old."AIDexterPrepared_ChangesJSON",old."AIDexterPrepared_CompanyID",old."AIDexterPrepared_UserID",old."AIDexterPrepared_TargetID",old."AIDexterPrepared_TargetJSON",
          old."AIDexterPrepared_ConversationID",old."AIDexterPrepared_ClientSessionID",old."AIDexterPrepared_IntentID",old."AIDexterPrepared_GrantID",old."AIDexterPrepared_AccessMode")
        is distinct from row(new."AIDexterPrepared_ActionCode",new."AIDexterPrepared_ArgumentsJSON",new."AIDexterPrepared_Title",new."AIDexterPrepared_Description",new."AIDexterPrepared_ChangesJSON",new."AIDexterPrepared_CompanyID",new."AIDexterPrepared_UserID",new."AIDexterPrepared_TargetID",new."AIDexterPrepared_TargetJSON",
          new."AIDexterPrepared_ConversationID",new."AIDexterPrepared_ClientSessionID",new."AIDexterPrepared_IntentID",new."AIDexterPrepared_GrantID",new."AIDexterPrepared_AccessMode") then
        raise exception 'A routing mode review cannot be changed after preparation. Create a fresh proposal.' using errcode='42501';end if;
    end if;
    return new;
  end if;
  if new."AIDexterPrepared_ActionCode"<>'change_booking_route_mode' then return new;end if;
  review:=booking_api.dexter_route_mode_review(new."AIDexterPrepared_CompanyID",new."AIDexterPrepared_UserID",new."AIDexterPrepared_ArgumentsJSON");
  new."AIDexterPrepared_ArgumentsJSON":=review->'arguments';
  new."AIDexterPrepared_Title":=review->>'title';new."AIDexterPrepared_Description":=review->>'description';new."AIDexterPrepared_ChangesJSON":=review->'changes';
  new."AIDexterPrepared_TargetID":=(review#>>'{arguments,target_id}')::uuid;
  new."AIDexterPrepared_TargetJSON":=jsonb_build_object('recordId',review#>>'{arguments,target_id}','recordIds',jsonb_build_array(review#>>'{arguments,target_id}',review#>>'{arguments,route_id}'));
  return new;
end $$;
create trigger secure_dexter_route_mode_proposal before insert or update on public."AI_DexterPreparedActions"
  for each row execute function booking_api.secure_dexter_route_mode_proposal();

create function public.multideck_dexter_action_change_booking_route_mode(p_company_id uuid,p_user_id uuid,p_arguments jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare review jsonb;actor uuid;job_id uuid;route_id uuid;lines jsonb;saved jsonb;reference text;cleared jsonb;
begin
  -- Match the Booking editor's job-then-leg lock order before checking the
  -- prepared evidence, so another writer cannot change references in between.
  job_id:=nullif(p_arguments->>'target_id','')::uuid;route_id:=nullif(p_arguments->>'route_id','')::uuid;
  review:=booking_api.dexter_route_mode_review(p_company_id,p_user_id,p_arguments);
  perform 1 from public."Job_Header" job join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    where job."Job_ID"=job_id and office."Company_ID"=p_company_id for update of job;
  perform 1 from public."Job_Routing" leg join public."Job_Header" job on job."Job_ID"=leg."Job_ID"
    join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
    where leg."JobRoute_ID"=route_id and leg."Job_ID"=job_id and office."Company_ID"=p_company_id for update of leg;
  review:=booking_api.dexter_route_mode_review(p_company_id,p_user_id,p_arguments);
  if p_arguments->'mode_review' is distinct from review#>'{arguments,mode_review}' then
    raise exception 'The mode or shared references changed since review. Request fresh approval.' using errcode='40001';end if;
  select "Auth_User_ID" into actor from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id;
  select "Job_BookingReference" into reference from public."Job_Header" where "Job_ID"=job_id;
  cleared:='{"masterTransportReference":null,"houseTransportReference":null,"carrierBookingReference":null,"transportMeansName":null}';
  saved:=booking_api.workspace_extended(actor,reference);
  select jsonb_agg(case when line->>'id'=route_id::text then line||cleared||jsonb_build_object('mode',review#>>'{arguments,mode}',
      'routeData',coalesce(line->'routeData','{}')||cleared||jsonb_build_object('mode',review#>>'{arguments,mode}','modeChangeReview',review#>'{arguments,mode_review}')) else line end order by ordinal)
    into lines from jsonb_array_elements(saved->'routes') with ordinality entries(line,ordinal);
  if not exists(select 1 from jsonb_array_elements(lines) line where line->>'id'=route_id::text) then raise exception 'The routing workspace changed. Reload before approving.' using errcode='40001';end if;
  saved:=public.booking_workflow_save(actor,job_id,jsonb_build_object('routes',lines));
  insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
    values(p_company_id,job_id,'dexter_route_mode_changed','Approved routing mode changed',jsonb_build_object('routeId',route_id,
      'review',review#>'{arguments,mode_review}','reason',p_arguments->>'reason'),p_user_id);
  return jsonb_build_object('recordId',route_id,'bookingId',job_id,'bookingReference',reference,
    'before',review#>>'{arguments,mode_review,fromMode}','after',review#>>'{arguments,mode}',
    'updatedAt',saved#>'{booking,updatedAt}','sourceUrl','/bookings/'||lower(reference));
end $$;

insert into public."sys_AIDexterActions"("AIDexterAction_Code","AIDexterAction_DomainCode","AIDexterAction_Name","AIDexterAction_Description","AIDexterAction_Function",
  "AIDexterAction_ParametersJSON","AIDexterAction_RequiredPermissionsJSON","AIDexterAction_IntentFamily","AIDexterAction_AlwaysRequiresApproval")
values('change_booking_route_mode','booking_routes','Review routing leg mode change','Always requires explicit approval of a database-derived warning and reference reset. Read the exact leg and both timestamps first. Changes only its mode; clears shared transport references but preserves prior evidence in audit/history. Other legs, Booking mode and accepted Quote stay unchanged.',
  'multideck_dexter_action_change_booking_route_mode',
  '{"type":"object","properties":{"target_id":{"type":"string"},"route_id":{"type":"string"},"expected_updated_at":{"type":"string"},"expected_route_updated_at":{"type":"string"},"mode":{"type":"string","description":"Active workspace mode code/name"},"reason":{"type":"string"}},"required":["target_id","route_id","expected_updated_at","expected_route_updated_at","mode","reason"],"additionalProperties":false}',
  '["Bookings.Read","Bookings.Write"]','change_booking_route_mode',true);
do $patch$
declare definition text;marker text:='(''update_booking_cargo'',''update_booking_container'',''update_booking_route'')';
begin
  definition:=pg_get_functiondef('public.multideck_dexter_execute_prepared_action(uuid,uuid,uuid,uuid)'::regprocedure);
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review current approval guard before mode action';end if;
  execute replace(definition,marker,'(''update_booking_cargo'',''update_booking_container'',''update_booking_route'',''change_booking_route_mode'')');
end $patch$;
revoke all on function booking_api.dexter_route_mode_review(uuid,uuid,jsonb),booking_api.secure_dexter_route_mode_proposal() from public,anon,authenticated,service_role;
revoke all on function public.multideck_dexter_action_change_booking_route_mode(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.multideck_dexter_action_change_booking_route_mode(uuid,uuid,jsonb) to service_role;
commit;
