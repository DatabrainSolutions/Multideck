begin;

-- A Cash calculation needs a payment-event key. The invoice evidence key used
-- by Standard calculation lines cannot identify two part payments of the same
-- invoice in one period. These lines remain preparation until a Cash period
-- calculator, event reconciliation and review lock consume them.
create table public."FIN_IndirectTaxCashCalculationEventLines" (
  calculation_id uuid not null,
  period_id uuid not null,
  event_line_id uuid not null references public."FIN_IndirectTaxCashEventLines"(id) on delete restrict,
  box_number smallint not null check (box_number in (1,4,6,7)),
  signed_amount numeric(18,4) not null check (signed_amount>=0),
  primary key (calculation_id,event_line_id,box_number),
  foreign key (calculation_id,period_id)
    references public."FIN_IndirectTaxCalculations"(id,period_id) on delete restrict,
  foreign key (period_id)
    references public."FIN_IndirectTaxPeriods"(id) on delete restrict
);
create index "IX_FIN_IndirectTaxCashCalculationEventLines_period"
  on public."FIN_IndirectTaxCashCalculationEventLines"(period_id,event_line_id);

create function public._multideck_uk_vat_cash_calculation_event_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_period public."FIN_IndirectTaxPeriods"%rowtype;
  v_event public."FIN_IndirectTaxCashEventLines"%rowtype;
  v_projection public."FIN_IndirectTaxCashEventProjections"%rowtype;
  v_cash_type text; v_expected numeric(18,4);
begin
  select * into v_period from public."FIN_IndirectTaxPeriods"
    where id=new.period_id;
  select * into v_event from public."FIN_IndirectTaxCashEventLines"
    where id=new.event_line_id;
  if v_period.id is null or v_event.id is null
    or v_period.jurisdiction_code<>'GB' or v_period.scheme_code<>'cash'
    or v_period.reporting_currency<>'GBP' or v_period.status<>'draft'
    or v_event.legal_entity_id<>v_period.legal_entity_id
    or v_event.payment_date not between v_period.start_date and v_period.end_date then
    raise exception 'A draft UK Cash VAT period and matching payment event are required.' using errcode='22023';
  end if;
  select * into v_projection from public."FIN_IndirectTaxCashEventProjections"
    where id=v_event.projection_id;
  if v_projection.id is null or v_projection.legal_entity_id<>v_period.legal_entity_id
    or v_projection.start_date<>v_period.start_date
    or v_projection.end_date<>v_period.end_date then
    raise exception 'The payment event projection must match the exact Cash VAT period.' using errcode='22023';
  end if;
  select "FINCash_TypeCode" into v_cash_type from public."FIN_CashTransactions"
    where "FINCash_ID"=v_event.cash_id
      and "FINCash_LegalEntityID"=v_period.legal_entity_id
      and "FINCash_NativePostingStatusCode"='posted';
  v_expected:=case
    when v_cash_type='customer_receipt' and new.box_number=6
      and v_event.treatment_code in ('domestic_sale','zero_rated_sale','exempt_sale')
      then v_event.net_gbp
    when v_cash_type='customer_receipt' and new.box_number=1
      and v_event.treatment_code='domestic_sale' then v_event.vat_gbp
    when v_cash_type='supplier_payment' and new.box_number=7
      and v_event.treatment_code in ('domestic_purchase','nonrecoverable_purchase',
        'zero_rated_purchase','exempt_purchase') then v_event.net_gbp
    when v_cash_type='supplier_payment' and new.box_number=4
      and v_event.treatment_code='domestic_purchase' then v_event.vat_gbp
    else null end;
  if v_expected is null or new.signed_amount<>v_expected then
    raise exception 'Cash VAT box line does not match its reviewed payment event.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_uk_vat_cash_calculation_event_guard()
  from public,anon,authenticated,service_role;
create trigger indirect_tax_cash_calculation_event_guard before insert
  on public."FIN_IndirectTaxCashCalculationEventLines"
  for each row execute function public._multideck_uk_vat_cash_calculation_event_guard();
create trigger indirect_tax_cash_calculation_event_immutable before update or delete
  on public."FIN_IndirectTaxCashCalculationEventLines"
  for each row execute function public._multideck_indirect_tax_immutable();
alter table public."FIN_IndirectTaxCashCalculationEventLines" enable row level security;
revoke all on public."FIN_IndirectTaxCashCalculationEventLines"
  from public,anon,authenticated,service_role;
grant select on public."FIN_IndirectTaxCashCalculationEventLines" to service_role;

commit;
