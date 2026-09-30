begin;

-- A full CargoWise cutover retains the independent source open-item extract
-- alongside the one closing trial-balance journal. The staged source links
-- reserve operational IDs; source amounts never change after review.
alter table public."FIN_OpeningBalancePackages"
  add column package_kind text not null default 'gl_only'
    check(package_kind in ('gl_only','full_open_items')),
  add column source_items_file_name text,
  add column source_items_sha256 text,
  add column source_items_sheet_name text,
  add column source_items_count integer not null default 0,
  add constraint opening_full_source_manifest check(
    (package_kind='gl_only' and source_items_file_name is null and source_items_sha256 is null and source_items_count=0)
    or (package_kind='full_open_items' and coalesce(length(btrim(source_items_file_name)),0) between 1 and 240
      and coalesce(source_items_sha256,'') ~ '^[a-f0-9]{64}$' and source_items_count between 1 and 50000)
  );
-- A changed party mapping or reviewed evidence must be restaged against the
-- same unchanged source file. The single-posted-package and empty-ledger gates
-- still prevent duplicate cutover posting.
alter table public."FIN_OpeningBalancePackages"
  drop constraint if exists "FIN_OpeningBalancePackages_legal_entity_id_source_sha256_key";
create index on public."FIN_OpeningBalancePackages"(legal_entity_id,source_sha256);

create table public."FIN_OpeningSourceItems" (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public."FIN_OpeningBalancePackages"(id) on delete restrict,
  source_row_number integer not null check(source_row_number>0),
  source_id text not null check(length(btrim(source_id)) between 1 and 180),
  source_party_code text not null check(length(btrim(source_party_code)) between 1 and 80),
  party_org_id uuid not null references public."Org_Master"("Org_id") on delete restrict,
  source_reference text not null check(length(btrim(source_reference)) between 1 and 180),
  control_nominal_id uuid not null references public."FIN_NominalAccounts"("FINNom_ID") on delete restrict,
  kind text not null check(kind in ('customer_invoice','customer_credit','customer_receipt',
    'supplier_invoice','supplier_credit','supplier_payment')),
  document_date date not null,
  due_date date,
  currency_code text not null check(currency_code ~ '^[A-Z]{3}$'),
  original_amount numeric(18,4) not null check(original_amount>0),
  original_base_amount numeric(18,4) not null check(original_base_amount>0),
  outstanding_amount numeric(18,4) not null check(outstanding_amount>0 and outstanding_amount<=original_amount),
  outstanding_base_amount numeric(18,4) not null check(outstanding_base_amount>0),
  historical_vat_evidence_ref text,
  operational_document_id uuid unique,
  operational_cash_id uuid unique,
  check((operational_document_id is not null) <> (operational_cash_id is not null)),
  unique(package_id,source_row_number),
  unique(package_id,source_id)
);
create index on public."FIN_OpeningSourceItems"(package_id,control_nominal_id);
alter table public."FIN_OpeningSourceItems" enable row level security;
revoke all on public."FIN_OpeningSourceItems" from public,anon,authenticated;
grant select,insert on public."FIN_OpeningSourceItems" to service_role;
create function public._multideck_opening_source_item_immutable() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_op='INSERT' then
    perform 1 from public."FIN_OpeningBalancePackages" where id=new.package_id
      and package_kind='full_open_items' and status='staged' for update;
    if not found then raise exception 'Opening source items can only be staged in a full package.' using errcode='22023'; end if;
    return new;
  end if;
  raise exception 'Reviewed CargoWise source items are immutable.' using errcode='22023';
end; $$;
create trigger opening_source_item_immutable before insert or update or delete on public."FIN_OpeningSourceItems"
for each row execute function public._multideck_opening_source_item_immutable();
revoke all on function public._multideck_opening_source_item_immutable() from public,anon,authenticated;

alter table public."FIN_Documents"
  add column "FINDoc_OpeningBalancePackageID" uuid references public."FIN_OpeningBalancePackages"(id) on delete restrict;
alter table public."FIN_CashTransactions"
  add column "FINCash_OpeningBalancePackageID" uuid references public."FIN_OpeningBalancePackages"(id) on delete restrict;
create index on public."FIN_Documents"("FINDoc_OpeningBalancePackageID") where "FINDoc_OpeningBalancePackageID" is not null;
create index on public."FIN_CashTransactions"("FINCash_OpeningBalancePackageID") where "FINCash_OpeningBalancePackageID" is not null;

create function public._multideck_opening_operational_source_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op='DELETE' then
    if (tg_table_name='FIN_Documents' and old."FINDoc_OpeningBalancePackageID" is not null)
      or (tg_table_name='FIN_CashTransactions' and old."FINCash_OpeningBalancePackageID" is not null) then
      raise exception 'CargoWise opening transactions cannot be deleted; record a dated correction.' using errcode='22023';
    end if;
    return old;
  end if;
  if tg_table_name='FIN_Documents' then
    if old."FINDoc_OpeningBalancePackageID" is not null and (
      row(new."FINDoc_OpeningBalancePackageID",new."FINDoc_TypeCode",new."FINDoc_Number",
        new."FINDoc_LegalEntityID",new."FINDoc_PartyOrgID",new."FINDoc_DocumentDate",new."FINDoc_AccountingDate",
        new."FINDoc_DueDate",new."FINDoc_CurrencyCodeSnapshot",new."FINDoc_ExchangeRate",
        new."FINDoc_NetAmount",new."FINDoc_TaxAmount",new."FINDoc_GrossAmount",new."FINDoc_LocalNetAmount",
        new."FINDoc_LocalTaxAmount",new."FINDoc_LocalGrossAmount",new."FINDoc_NativePostingBatchID")
      is distinct from row(old."FINDoc_OpeningBalancePackageID",old."FINDoc_TypeCode",old."FINDoc_Number",
        old."FINDoc_LegalEntityID",old."FINDoc_PartyOrgID",old."FINDoc_DocumentDate",old."FINDoc_AccountingDate",
        old."FINDoc_DueDate",old."FINDoc_CurrencyCodeSnapshot",old."FINDoc_ExchangeRate",
        old."FINDoc_NetAmount",old."FINDoc_TaxAmount",old."FINDoc_GrossAmount",old."FINDoc_LocalNetAmount",
        old."FINDoc_LocalTaxAmount",old."FINDoc_LocalGrossAmount",old."FINDoc_NativePostingBatchID")
      or new."FINDoc_OutstandingAmount">old."FINDoc_OutstandingAmount"
      or new."FINDoc_LocalOutstandingAmount">old."FINDoc_LocalOutstandingAmount") then
      raise exception 'CargoWise opening document source and carrying amount are immutable.' using errcode='22023';
    end if;
  else
    if old."FINCash_OpeningBalancePackageID" is not null and (
      row(new."FINCash_OpeningBalancePackageID",new."FINCash_TypeCode",new."FINCash_Number",
        new."FINCash_LegalEntityID",new."FINCash_BankAccountID",new."FINCash_PartyOrgID",
        new."FINCash_TransactionDate",new."FINCash_AccountingDate",new."FINCash_CurrencyCodeSnapshot",
        new."FINCash_ExchangeRate",new."FINCash_Amount",new."FINCash_LocalAmount",
        new."FINCash_Reference",new."FINCash_NativePostingBatchID")
      is distinct from row(old."FINCash_OpeningBalancePackageID",old."FINCash_TypeCode",old."FINCash_Number",
        old."FINCash_LegalEntityID",old."FINCash_BankAccountID",old."FINCash_PartyOrgID",
        old."FINCash_TransactionDate",old."FINCash_AccountingDate",old."FINCash_CurrencyCodeSnapshot",
        old."FINCash_ExchangeRate",old."FINCash_Amount",old."FINCash_LocalAmount",
        old."FINCash_Reference",old."FINCash_NativePostingBatchID")
      or new."FINCash_UnallocatedAmount">old."FINCash_UnallocatedAmount"
      or new."FINCash_LocalUnallocatedAmount">old."FINCash_LocalUnallocatedAmount") then
      raise exception 'CargoWise unapplied cash source and carrying amount are immutable.' using errcode='22023';
    end if;
  end if;
  return new;
end; $$;
create trigger opening_document_source_guard before update or delete on public."FIN_Documents"
for each row execute function public._multideck_opening_operational_source_guard();
create trigger opening_cash_source_guard before update or delete on public."FIN_CashTransactions"
for each row execute function public._multideck_opening_operational_source_guard();
revoke all on function public._multideck_opening_operational_source_guard() from public,anon,authenticated;

commit;
