-- Cloud may deliver a contracted seat count only to the project already bound
-- to the exact customer identity. Confirmed revisions are idempotent.
begin;

create table private.cloud_paid_seat_contract_receipt (
  singleton boolean primary key default true check (singleton),
  tenant_id uuid not null,
  revision bigint not null check (revision > 0),
  payload jsonb not null,
  confirmed_at timestamptz not null default now()
);
alter table private.cloud_paid_seat_contract_receipt enable row level security;
revoke all on private.cloud_paid_seat_contract_receipt from public,anon,authenticated,service_role;
grant select,insert,update on private.cloud_paid_seat_contract_receipt to service_role;
create policy cloud_paid_seat_receipt_server on private.cloud_paid_seat_contract_receipt
  to service_role using (true) with check (true);

create function public.multideck_cloud_apply_paid_seats(
  p_tenant_id uuid,p_revision bigint,p_paid_seats integer,p_plan_code text,
  p_ai_override_gbp numeric default null,p_document_override integer default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare identity private.cloud_product_state%rowtype;
  receipt private.cloud_paid_seat_contract_receipt%rowtype;
  expected_code text; body jsonb; subscription jsonb;
begin
  if p_tenant_id is null or p_revision is null or p_revision < 1 or p_revision > 9007199254740991
    or p_paid_seats is null or p_paid_seats < 1 or p_paid_seats > 100000 then
    raise exception 'Invalid paid-seat contract' using errcode='22023';
  end if;
  expected_code := case when p_paid_seats <= 10 then '10' when p_paid_seats <= 25 then '25'
    when p_paid_seats <= 50 then '50' else 'enterprise' end;
  if p_plan_code is distinct from expected_code
    or (expected_code <> 'enterprise' and (p_ai_override_gbp is not null or p_document_override is not null))
    or (expected_code = 'enterprise' and (p_ai_override_gbp is null or p_document_override is null))
    or coalesce(p_ai_override_gbp,0) < 0 or coalesce(p_document_override,0) < 0 then
    raise exception 'Paid-seat plan and agreed allowances do not match' using errcode='22023';
  end if;
  select * into identity from private.cloud_product_state where singleton;
  if not found or identity.tenant_id is distinct from p_tenant_id then
    raise exception 'Customer identity is not configured or does not match' using errcode='42501';
  end if;
  if not exists(select 1 from public."cmp_Company" where "Company_ID"=p_tenant_id) then
    raise exception 'Customer company has not been prepared' using errcode='22023';
  end if;
  body := jsonb_build_object('tenantId',p_tenant_id,'revision',p_revision,'paidSeats',p_paid_seats,
    'planCode',p_plan_code,'aiOverrideGbp',p_ai_override_gbp,'documentOverride',p_document_override);
  select * into receipt from private.cloud_paid_seat_contract_receipt where singleton for update;
  if found and p_revision <= receipt.revision then
    if p_revision = receipt.revision and body = receipt.payload then
      subscription := public._multideck_subscription(p_tenant_id);
      if (subscription->>'paidSeats')::integer is distinct from p_paid_seats then
        raise exception 'Confirmed paid-seat receipt differs from the current App policy' using errcode='40001';
      end if;
      return body || jsonb_build_object('confirmed',true);
    end if;
    raise exception 'Paid-seat revision conflict' using errcode='40001';
  end if;
  insert into public."AI_DexterUsagePolicies"("AIUsagePolicy_CompanyID","AIUsagePolicy_PlanCode",
    "AIUsagePolicy_PaidSeats","AIUsagePolicy_AiOverrideGbp","AIUsagePolicy_DocumentOverride")
  values(p_tenant_id,p_plan_code,p_paid_seats,p_ai_override_gbp,p_document_override)
  on conflict("AIUsagePolicy_CompanyID") do update set
    "AIUsagePolicy_PlanCode"=excluded."AIUsagePolicy_PlanCode",
    "AIUsagePolicy_PaidSeats"=excluded."AIUsagePolicy_PaidSeats",
    "AIUsagePolicy_AiOverrideGbp"=excluded."AIUsagePolicy_AiOverrideGbp",
    "AIUsagePolicy_DocumentOverride"=excluded."AIUsagePolicy_DocumentOverride";
  subscription := public._multideck_subscription(p_tenant_id);
  if (subscription->>'paidSeats')::integer is distinct from p_paid_seats
    or subscription->>'planCode' is distinct from p_plan_code then
    raise exception 'App did not confirm the agreed paid-seat contract' using errcode='40001';
  end if;
  insert into private.cloud_paid_seat_contract_receipt(singleton,tenant_id,revision,payload)
    values(true,p_tenant_id,p_revision,body)
    on conflict(singleton) do update set tenant_id=excluded.tenant_id,revision=excluded.revision,
      payload=excluded.payload,confirmed_at=now();
  return body || jsonb_build_object('confirmed',true);
end;
$$;
revoke all on function public.multideck_cloud_apply_paid_seats(uuid,bigint,integer,text,numeric,integer)
  from public,anon,authenticated;
grant execute on function public.multideck_cloud_apply_paid_seats(uuid,bigint,integer,text,numeric,integer)
  to service_role;

commit;
