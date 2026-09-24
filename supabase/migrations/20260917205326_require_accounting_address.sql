-- One resolver for accounting delivery and the native CRM invariant. Existing
-- single-address accounts remain usable; an explicit accounting selection or a
-- role-specific/default billing purpose wins when there is more than one.
create function public.multideck_accounting_address(p_org uuid, p_role text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare selected public."Org_Addresses"%rowtype; explicit_id text; candidates uuid[]; purpose_codes text[];
begin
 if p_role not in ('customer','supplier') then raise exception 'Choose customer or supplier.' using errcode='22023'; end if;
 select nullif("CRMAccountOps_InvoicePreferencesJSON"->>'accountingAddressId','') into explicit_id
 from public."CRM_AccountOperationalProfiles" where "CRMAccountOps_OrgID"=p_org;
 if explicit_id is not null then
  select * into selected from public."Org_Addresses" where "Org_ID"=p_org and "OrgAdd_IsActive" and "OrgAdd_ID"::text=explicit_id;
  if not found then raise exception 'The selected accounting address is missing or inactive.' using errcode='22023'; end if;
 else
  purpose_codes:=case when p_role='customer' then array['accounts_receivable','sales_ledger','legacy-6'] else array['accounts_payable','purchase_ledger','legacy-5'] end;
  select array_agg(id) into candidates from (
   select a."OrgAdd_ID" id, dense_rank() over(order by
    case when t."sys_AddressType_Code"=any(purpose_codes) then 0 else 1 end,
    case when x."OrgAddType_IsDefault" then 0 else 1 end) priority
   from public."Org_Addresses" a join public."Org_AddressTypes" x on x."OrgAdd_ID"=a."OrgAdd_ID"
   join public."sys_AddressTypes" t on t."sys_AddressType_ID"=x."OrgAddType_Type" and t."sys_AddressType_IsActive"
   where a."Org_ID"=p_org and a."OrgAdd_IsActive" and (t."sys_AddressType_Code"=any(purpose_codes) or t."sys_AddressType_Code"='billing')
  ) ranked where priority=1;
  select array_agg(distinct id) into candidates from unnest(candidates) id;
  if coalesce(cardinality(candidates),0)=0 then
   select array_agg("OrgAdd_ID") into candidates from public."Org_Addresses" where "Org_ID"=p_org and "OrgAdd_IsActive";
  end if;
  if coalesce(cardinality(candidates),0)<>1 then
   raise exception 'Choose one accounting address for this customer or supplier.' using errcode='22023';
  end if;
  select * into selected from public."Org_Addresses" where "OrgAdd_ID"=candidates[1] and "Org_ID"=p_org and "OrgAdd_IsActive";
 end if;
 if nullif(btrim(selected."OrgAdd_Line1"),'') is null or nullif(btrim(selected."OrgAdd_TownCity"),'') is null
 or not exists(select 1 from public."RefCountry" where "RN_Code"=selected."OrgAdd_Country") then
  raise exception 'An accounting address with address line 1, town/city and a valid country is required for customers and suppliers.' using errcode='22023';
 end if;
 return to_jsonb(selected);
end $$;
revoke all on function public.multideck_accounting_address(uuid,text) from public,anon,authenticated;
grant execute on function public.multideck_accounting_address(uuid,text) to service_role;

create function public._multideck_require_accounting_address() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare row_data jsonb; org_id uuid; role_name text; changed_orgs uuid[]:='{}'::uuid[];
begin
 -- Check both organisations if an address or purpose is moved. Deferred checks
 -- allow the ordinary atomic CRM flow to create roles and addresses together.
 for row_data in select value from jsonb_array_elements(jsonb_build_array(
  case when tg_op<>'DELETE' then to_jsonb(new) else null end,
  case when tg_op<>'INSERT' then to_jsonb(old) else null end)) where value<>'null'::jsonb loop
  org_id:=coalesce(row_data->>'Org_id',row_data->>'Org_ID',row_data->>'OrgAddType_OrgID',row_data->>'CRMAccount_OrgID',row_data->>'CRMAccountOps_OrgID')::uuid;
  if org_id is null and row_data ? 'OrgAdd_ID' then
   select "Org_ID" into org_id from public."Org_Addresses" where "OrgAdd_ID"=(row_data->>'OrgAdd_ID')::uuid;
  end if;
  if org_id is not null then changed_orgs:=array_append(changed_orgs,org_id); end if;
 end loop;
 for org_id in select distinct id from unnest(changed_orgs) id order by id loop
  perform pg_advisory_xact_lock(hashtextextended(org_id::text,190917));
  if not exists(select 1 from public."CRM_AccountProfiles" where "CRMAccount_OrgID"=org_id and not "CRMAccount_IsDeleted") then continue; end if;
  for role_name in select distinct lower(t."OrgType_Name") from public."Org_Master_Type" x join public."Org_Types" t on t."OrgType_ID"=x."OrgType_ID"
   where x."Org_ID"=org_id and lower(t."OrgType_Name") in ('customer','supplier') loop
   perform public.multideck_accounting_address(org_id,role_name);
  end loop;
 end loop;
 return null;
end $$;
revoke all on function public._multideck_require_accounting_address() from public,anon,authenticated;

create constraint trigger "TRG_AccountingAddress_Organisation" after insert or update on public."Org_Master" deferrable initially deferred for each row execute function public._multideck_require_accounting_address();
create constraint trigger "TRG_AccountingAddress_Role" after insert or update or delete on public."Org_Master_Type" deferrable initially deferred for each row execute function public._multideck_require_accounting_address();
create constraint trigger "TRG_AccountingAddress_Address" after insert or update or delete on public."Org_Addresses" deferrable initially deferred for each row execute function public._multideck_require_accounting_address();
create constraint trigger "TRG_AccountingAddress_Purpose" after insert or update or delete on public."Org_AddressTypes" deferrable initially deferred for each row execute function public._multideck_require_accounting_address();
create constraint trigger "TRG_AccountingAddress_Profile" after insert or update on public."CRM_AccountProfiles" deferrable initially deferred for each row execute function public._multideck_require_accounting_address();
create constraint trigger "TRG_AccountingAddress_Preferences" after insert or update on public."CRM_AccountOperationalProfiles" deferrable initially deferred for each row execute function public._multideck_require_accounting_address();
