-- Address purposes are independent: one physical location may serve several
-- workflows, with a different default address selected for each purpose.
do $$
begin
  if exists (
    select 1 from public."sys_AddressTypes"
    where "sys_AddressType_Code" = 'sales_ledger'
  ) and not exists (
    select 1 from public."sys_AddressTypes"
    where "sys_AddressType_Code" = 'accounts_receivable'
  ) then
    update public."sys_AddressTypes"
    set "sys_AddressType_Code" = 'accounts_receivable',
        "sys_AddressType_Description" = 'Accounts receivable',
        "sys_AddressType_SortOrder" = 70,
        "sys_AddressType_IsActive" = true
    where "sys_AddressType_Code" = 'sales_ledger';
  end if;
end;
$$;

insert into public."sys_AddressTypes"(
  "sys_AddressType_Code",
  "sys_AddressType_Description",
  "sys_AddressType_SortOrder"
)
values
  ('accounts_receivable', 'Accounts receivable', 70),
  ('operations', 'Operations', 80)
on conflict ("sys_AddressType_Code") do update
set "sys_AddressType_Description" = excluded."sys_AddressType_Description",
    "sys_AddressType_IsActive" = true,
    "sys_AddressType_SortOrder" = excluded."sys_AddressType_SortOrder";

create or replace function public.multideck_crm_require_address_purpose()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_address_id uuid;
begin
  v_address_id := coalesce(new."OrgAdd_ID", old."OrgAdd_ID");

  if exists (
    select 1 from public."Org_Addresses" address
    where address."OrgAdd_ID" = v_address_id and address."OrgAdd_IsActive"
  ) and not exists (
    select 1 from public."Org_AddressTypes" purpose
    where purpose."OrgAdd_ID" = v_address_id
  ) then
    raise exception 'Choose at least one purpose for this address.' using errcode = '22023';
  end if;
  return null;
end;
$$;

drop trigger if exists "TRG_OrgAddresses_require_purpose" on public."Org_Addresses";
create constraint trigger "TRG_OrgAddresses_require_purpose"
after insert or update on public."Org_Addresses"
deferrable initially deferred
for each row execute function public.multideck_crm_require_address_purpose();

drop trigger if exists "TRG_OrgAddressTypes_require_purpose" on public."Org_AddressTypes";
create constraint trigger "TRG_OrgAddressTypes_require_purpose"
after delete or update on public."Org_AddressTypes"
deferrable initially deferred
for each row execute function public.multideck_crm_require_address_purpose();

revoke all on function public.multideck_crm_require_address_purpose() from public, anon, authenticated;
