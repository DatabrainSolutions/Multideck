begin;
set local lock_timeout='5s';

-- Same account-access boundary as Quote lookups. Customer choice remains the
-- Booking customer; a charge must not silently change who the Booking belongs to.
create function booking_api.planning_charge_parties(company_id uuid,customer_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'code',p.code,'roles',p.roles) order by p.name,p.id),'[]')
 from (
   select o."Org_id" id,o."Org_Name" name,o."Org_AccCode" code,
     to_jsonb(array_remove(array[
       case when o."Org_id"=customer_id then 'customer' end,
       case when exists(select 1 from public."Org_Master_Type" m join public."Org_Types" t on t."OrgType_ID"=m."OrgType_ID"
         where m."Org_ID"=o."Org_id" and t."OrgType_Name" ~* '(supplier|carrier|shipping line|haulier|freight forwarder|\magent(s)?\M)') then 'supplier' end
     ],null)) roles
   from public."Org_Master" o
   where public.multideck_crm_company_can_access_account(company_id,o."Org_id")
     and not exists(select 1 from public."CRM_AccountProfiles" p where p."CRMAccount_OrgID"=o."Org_id" and p."CRMAccount_IsDeleted")
 ) p where jsonb_array_length(p.roles)>0;
$$;
revoke all on function booking_api.planning_charge_parties(uuid,uuid) from public,anon,authenticated,service_role;

create function booking_api.validate_planning_charge_parties(rows jsonb,parties jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare charge jsonb; field text; role_name text;
begin
 for charge in select * from jsonb_array_elements(rows) loop
   foreach field in array array['supplierId','customerId'] loop
     if charge->>field is null then continue;end if;
     role_name:=case when field='supplierId' then 'supplier' else 'customer' end;
     if jsonb_typeof(charge->field)<>'string' or not exists(
       select 1 from jsonb_array_elements(parties) p
       where lower(p->>'id')=lower(charge->>field) and p->'roles' ? role_name
     ) then raise exception 'Choose an accessible % for each planning charge.',role_name using errcode='22023';end if;
   end loop;
 end loop;
end $$;
revoke all on function booking_api.validate_planning_charge_parties(jsonb,jsonb) from public,anon,authenticated,service_role;

-- Guarded edits to our staged functions; abort if their contracts have drifted.
do $$declare definition text;anchor text;begin
 definition:=pg_get_functiondef('booking_api.planning_charge_workspace(uuid,uuid)'::regprocedure);
 anchor:='''chargeSet'',plan,''currencies'',currencies,''bookingUpdatedAt'',job."Job_UpdatedAt"';
 if position(anchor in definition)=0 then raise exception 'Planning read contract changed';end if;
 execute replace(definition,anchor,anchor||',''parties'',booking_api.planning_charge_parties(company,job."Job_Customer")');

 definition:=pg_get_functiondef('booking_api.save_planning_charges(uuid,uuid,bigint,text,jsonb)'::regprocedure);
 anchor:='perform booking_api.save_planning_charge_foundation';
 if position(anchor in definition)=0 then raise exception 'Planning writer changed';end if;
 execute replace(definition,anchor,'perform booking_api.validate_planning_charge_parties(requested_rows,context->''parties''); '||anchor);

 definition:=pg_get_functiondef('booking_api.save_planning_charge_foundation(uuid,uuid,bigint,text,jsonb)'::regprocedure);
 anchor:='''quantity'',''calculationBasis''))';
 if position(anchor in definition)=0 then raise exception 'Planning row fields changed';end if;
 execute replace(definition,anchor,'''quantity'',''calculationBasis'',''supplierId'',''customerId''))');

 definition:=pg_get_functiondef('booking_api.release_manual_planning_charges()'::regprocedure);
 anchor:='for charge in select * from jsonb_array_elements(plan.rows) loop';
 if position(anchor in definition)=0 then raise exception 'Planning release changed';end if;
 definition:=replace(definition,anchor,'perform booking_api.validate_planning_charge_parties(plan.rows,booking_api.planning_charge_parties(company,new."Job_Customer")); '||anchor);
 anchor:='charge->>''description'',null,null,';
 if position(anchor in definition)=0 then raise exception 'Finance release arguments changed';end if;
 execute replace(definition,anchor,'charge->>''description'',(charge->>''supplierId'')::uuid,null,');

 -- Advertise the editor only when the complete read/save + party contract exists.
 definition:=pg_get_functiondef('public.booking_provisional_state(uuid,uuid)'::regprocedure);
 anchor:='''supported'',true';
 if position(anchor in definition)=0 then raise exception 'Provisional state capability changed';end if;
 execute replace(definition,anchor,anchor||',''planningEditorSupported'',true');
end $$;
commit;
