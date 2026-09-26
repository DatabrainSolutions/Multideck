begin;
set local lock_timeout='5s';

-- Staged editor access, to be released only with the complete reviewed sequence.
-- Verified caller identity is supplied by bookings-workflow, never the browser.
create function booking_api.planning_charge_workspace(caller_auth_user_id uuid, requested_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 job public."Job_Header"%rowtype; company uuid; base text; currencies jsonb;
 plan jsonb; reason text;
begin
 if not coalesce(booking_api.has_permission(caller_auth_user_id,'Bookings.Read'),false) then
   raise exception 'Booking access is not authorised.' using errcode='42501';end if;
 select j.* into job from public."Job_Header" j
 join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
 join public."cmp_Users" u on u."Company_ID"=o."Company_ID" and u."Auth_User_ID"=caller_auth_user_id and u."User_AccessStatus"='active'
 where j."Job_ID"=requested_job_id and not j."Job_IsDeleted" for share of j;
 if not found then raise exception 'That booking is outside this workspace.' using errcode='42501';end if;
 select "Company_ID" into company from public."cmp_Offices" where "Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID");
 select upper("LegalEntity_BaseCurrencyCodeSnapshot") into base from public."cmp_LegalEntities"
 where "LegalEntity_ID"=job."Job_LegalEntityID" and "Company_ID"=company and "LegalEntity_IsActive";
 -- An entity-specific disabled setting overrides an active global setting.
 select coalesce(jsonb_agg(jsonb_build_object('code',c.code,'name',c.name,'symbol',c.code,'decimalPlaces',c.decimals) order by c.code),'[]') into currencies
 from (select distinct on (s."FINCurSet_CurrencyCode") s."FINCurSet_CurrencyCode" code,
   s."FINCurSet_Name" name,s."FINCurSet_DecimalPlaces" decimals,s."FINCurSet_IsActive" active,
   s."FINCurSet_IsPermittedForQuote" permitted
   from public."FIN_CurrencySettings" s
   join public."sys_Currency" catalogue on catalogue."Currency_Code"=s."FINCurSet_CurrencyCode"
   where s."FINCurSet_LegalEntityID"=job."Job_LegalEntityID" or s."FINCurSet_LegalEntityID" is null
   order by s."FINCurSet_CurrencyCode",s."FINCurSet_LegalEntityID" nulls last) c
 where c.active and c.permitted;
 select to_jsonb(p) into plan from booking_api.planning_charge_sets p where p.job_id=requested_job_id;
 if not coalesce(booking_api.has_permission(caller_auth_user_id,'Bookings.Write'),false) then reason:='You have read-only access to this Booking.';
 elsif job."Job_ProvisionalCancelled" then reason:='Reopen this Booking before changing planning charges.';
 elsif coalesce(lower(job."Job_Status"),'') not in ('draft','provisional') then reason:='Planning charges are only editable while Provisional.';
 elsif base is null or base !~ '^[A-Z]{3}$' then reason:='Choose an active Booking legal entity with a base currency before adding planning charges.';
 elsif not exists(select 1 from jsonb_array_elements(currencies) c where c->>'code'=base) then reason:='Enable the legal entity base currency for planning before adding charges.';
 elsif plan is not null and plan->>'base_currency'<>base then reason:='The legal entity base currency changed. Review the existing plan before editing.';
 end if;
 if plan is null and base ~ '^[A-Z]{3}$' then
   plan:=jsonb_build_object('job_id',requested_job_id,'revision',0,'base_currency',base,'rows','[]'::jsonb);
 end if;
 return jsonb_build_object('supported',true,'editable',reason is null,'blockedReason',reason,
   'chargeSet',plan,'currencies',currencies,'bookingUpdatedAt',job."Job_UpdatedAt");
end $$;

create function booking_api.save_planning_charges(caller_auth_user_id uuid,requested_job_id uuid,
 expected_revision bigint,requested_base_currency text,requested_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare context jsonb; charge jsonb; field text;
begin
 if not coalesce(booking_api.has_permission(caller_auth_user_id,'Bookings.Write'),false) then
   raise exception 'Booking changes are not authorised.' using errcode='42501';end if;
 -- Take the exclusive job lock first, avoiding share-to-exclusive upgrade deadlocks.
 perform 1 from public."Job_Header" j
 join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
 join public."cmp_Users" u on u."Company_ID"=o."Company_ID" and u."Auth_User_ID"=caller_auth_user_id and u."User_AccessStatus"='active'
 where j."Job_ID"=requested_job_id and not j."Job_IsDeleted" for update of j;
 if not found then raise exception 'That booking is outside this workspace.' using errcode='42501';end if;
 context:=booking_api.planning_charge_workspace(caller_auth_user_id,requested_job_id);
 if not (context->>'editable')::boolean then raise exception '%',context->>'blockedReason' using errcode='22023';end if;
 if requested_base_currency is distinct from context#>>'{chargeSet,base_currency}' then
   raise exception 'Use the Booking legal entity base currency.' using errcode='22023';end if;
 if jsonb_typeof(requested_rows) is distinct from 'array' then raise exception 'Choose valid planning charge rows.' using errcode='22023';end if;
 if jsonb_array_length(requested_rows)>200 or octet_length(requested_rows::text)>262144 then
   raise exception 'Too many planning charges.' using errcode='22023';end if;
 -- Validate catalogues on every save, not just when populating the dropdown.
 for charge in select * from jsonb_array_elements(requested_rows) loop
   foreach field in array array['costCurrency','sellCurrency'] loop
     if not exists(select 1 from jsonb_array_elements(context->'currencies') c where c->>'code'=charge->>field) then
       raise exception 'Choose an active planning currency for each charge.' using errcode='22023';end if;
   end loop;
   foreach field in array array['costRoe','sellRoe'] loop
     if jsonb_typeof(charge->field) is distinct from 'number' then
       raise exception 'Enter numeric exchange rates for each charge.' using errcode='22023';end if;
   end loop;
   if ((charge->>'costCurrency')=requested_base_currency and (charge->>'costRoe')::numeric<>1)
     or ((charge->>'sellCurrency')=requested_base_currency and (charge->>'sellRoe')::numeric<>1) then
     raise exception 'The base-currency exchange rate must be 1.' using errcode='22023';end if;
 end loop;
 perform booking_api.save_planning_charge_foundation(caller_auth_user_id,requested_job_id,expected_revision,requested_base_currency,requested_rows);
 return booking_api.planning_charge_workspace(caller_auth_user_id,requested_job_id);
end $$;

create function public.booking_planning_charge_workspace(caller_auth_user_id uuid,requested_job_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select booking_api.planning_charge_workspace(caller_auth_user_id,requested_job_id);
$$;
create function public.booking_planning_charges_save(caller_auth_user_id uuid,requested_job_id uuid,
 expected_revision bigint,requested_base_currency text,requested_rows jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select booking_api.save_planning_charges(caller_auth_user_id,requested_job_id,expected_revision,requested_base_currency,requested_rows);
$$;
revoke all on function booking_api.planning_charge_workspace(uuid,uuid),booking_api.save_planning_charges(uuid,uuid,bigint,text,jsonb),
 public.booking_planning_charge_workspace(uuid,uuid),public.booking_planning_charges_save(uuid,uuid,bigint,text,jsonb) from public,anon,authenticated,service_role;
grant usage on schema booking_api to service_role;
grant execute on function booking_api.planning_charge_workspace(uuid,uuid),booking_api.save_planning_charges(uuid,uuid,bigint,text,jsonb),
 public.booking_planning_charge_workspace(uuid,uuid),public.booking_planning_charges_save(uuid,uuid,bigint,text,jsonb) to service_role;
-- No table access and no grant to the unvalidated foundation writer.

update public."sys_AIDexterDataDomains" set "AIDexterDomain_Description"=coalesce("AIDexterDomain_Description",'')||
 ' Manual Provisional planning-charge details and edits are not supported in Dexter. Do not infer these from operational costing or quote snapshots; direct the user to the Booking planning-charge editor.'
 where "AIDexterDomain_Code" in ('bookings','booking_summary');
update public."sys_AIDexterWatchCapabilities" set "AIDexterWatchCapability_Description"=coalesce("AIDexterWatchCapability_Description",'')||
 ' Detailed manual planning-charge watches are unsupported. Explain this limitation; do not substitute financial-costing or quote-change watches.'
 where "AIDexterWatchCapability_Code"='bookings';
commit;
