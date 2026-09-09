-- Transaction-only development fixture checks; rolls back every test note.
begin;
do $test$
declare actor uuid; account_id uuid := 'de1000c1-5eed-4ead-8000-000000000002'; note jsonb; page jsonb; company_id uuid; watcher uuid; before_count integer;
begin
 select u."Auth_User_ID",u."Company_ID" into strict actor,company_id from public."cmp_Users" u where u."User_AccessStatus"='active' and quote_api.has_permission(u."Auth_User_ID",'Customers.Write') and public.multideck_crm_company_can_access_account(u."Company_ID",account_id) limit 1;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('app.user_id',(select "User_ID"::text from public."cmp_Users" where "Auth_User_ID"=actor limit 1),true);
 watcher := (public.multideck_dexter_create_watch('lifecycle_notes','Company notes check','Test','Test',account_id,'Test company','{"field":"body","operator":"contains","value":"Company note transaction test"}',null)->>'id')::uuid;
 note:=public.multideck_add_lifecycle_note('company',account_id,'Company note transaction test','[]');
 select "AIDexterWatch_TriggerCount" into before_count from public."AI_DexterWatches" where "AIDexterWatch_ID"=watcher;
 if before_count <> 1 then raise exception 'Expected one watch match, got %',before_count; end if;
 perform public.multideck_add_lifecycle_note('company',account_id,'Non-matching note','[]');
 if (select "AIDexterWatch_TriggerCount" from public."AI_DexterWatches" where "AIDexterWatch_ID"=watcher) <> 1 then raise exception 'Non-match triggered watch'; end if;
 update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_ID"=watcher;
 perform public.multideck_add_lifecycle_note('company',account_id,'Company note transaction test paused','[]');
 if (select "AIDexterWatch_TriggerCount" from public."AI_DexterWatches" where "AIDexterWatch_ID"=watcher) <> 1 then raise exception 'Paused watch triggered'; end if;
 update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_ID"=watcher;
 perform public.multideck_add_lifecycle_note('company',account_id,'Company note transaction test resumed','[]');
 if (select "AIDexterWatch_TriggerCount" from public."AI_DexterWatches" where "AIDexterWatch_ID"=watcher) <> 2 then raise exception 'Resumed watch did not trigger'; end if;
 page:=public.multideck_lifecycle_notes('company',account_id,30,null);
 if not page->'notes' @> jsonb_build_array(jsonb_build_object('id',note->>'id')) then raise exception 'Saved note missing'; end if;
 if not public.multideck_dexter_domain_lifecycle_notes_v2(company_id,'Company note transaction test',25) @> jsonb_build_array(jsonb_build_object('noteId',note->>'id','subjectType','company')) then raise exception 'Dexter read missing'; end if;
 if not public.multideck_lifecycle_note_target_authorised(actor,account_id) then raise exception 'Watch target denied'; end if;
 perform public.multideck_update_lifecycle_note((note->>'id')::uuid,'Updated company note transaction test');
 perform public.multideck_delete_lifecycle_note((note->>'id')::uuid);
 begin perform public.multideck_add_lifecycle_note('company',account_id,'','[]'); raise exception 'Blank note accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.multideck_lifecycle_notes('company',gen_random_uuid(),30,null); raise exception 'Unknown account accepted'; exception when no_data_found or insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin perform public.multideck_lifecycle_notes('company',account_id,30,null); raise exception 'Foreign actor accepted'; exception when insufficient_privilege then null; end;
end $test$;
rollback;
