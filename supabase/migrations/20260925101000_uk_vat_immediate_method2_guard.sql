begin;

-- Notice 700/45 section 4.8 requires immediate Method 2 notification when
-- one discovered error alone breaches the 1% or £50,000 limit. Netting that
-- error against another must not make a Method 1 plan postable.
create function public._multideck_uk_vat_assert_method1_individual_limits(
  p_items jsonb,p_filed_box6 numeric
) returns void language plpgsql immutable set search_path=pg_catalog,public as $$
declare v_item jsonb; v_amount numeric;
begin
  if p_items is null or jsonb_typeof(p_items)<>'array'
    or jsonb_array_length(p_items)=0 or p_filed_box6 is null
    or p_filed_box6<0 then
    raise exception 'Method 1 needs complete errors and a valid final Box 6.' using errcode='22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(v_item->>'signedVatErrorGbp','')
      !~ '^-?(0|[1-9][0-9]*)([.][0-9]{1,2})?$' then
      raise exception 'A Method 1 error has no valid individual VAT amount.' using errcode='22023';
    end if;
    v_amount:=abs((v_item->>'signedVatErrorGbp')::numeric);
    if v_amount>50000 or (v_amount>10000 and v_amount*100>p_filed_box6) then
      raise exception 'An individual prior-return error requires immediate separate HMRC notification; it cannot be included in Method 1.' using errcode='22023';
    end if;
  end loop;
end; $$;
revoke all on function public._multideck_uk_vat_assert_method1_individual_limits(jsonb,numeric)
  from public,anon,authenticated,service_role;

create function public._multideck_uk_vat_guard_method1_individual_limits()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_plan public."FIN_IndirectTaxPriorErrorMethod1Plans"%rowtype;
begin
  if tg_table_name='FIN_IndirectTaxPriorErrorMethod1Plans' then
    perform public._multideck_uk_vat_assert_method1_individual_limits(
      new.planned_items,new.planned_filed_box6_gbp);
  elsif tg_table_name='FIN_IndirectTaxPriorErrorMethod1Postings' then
    select * into v_plan from public."FIN_IndirectTaxPriorErrorMethod1Plans"
      where id=new.plan_id and legal_entity_id=new.legal_entity_id
        and discovery_period_id=new.discovery_period_id;
    if not found then
      raise exception 'The reviewed Method 1 plan is unavailable.' using errcode='42501';
    end if;
    perform public._multideck_uk_vat_assert_method1_individual_limits(
      v_plan.planned_items,v_plan.planned_filed_box6_gbp);
  end if;
  return new;
end; $$;
revoke all on function public._multideck_uk_vat_guard_method1_individual_limits()
  from public,anon,authenticated,service_role;

create trigger indirect_tax_method1_plan_individual_limit before insert
  on public."FIN_IndirectTaxPriorErrorMethod1Plans"
  for each row execute function public._multideck_uk_vat_guard_method1_individual_limits();
create trigger indirect_tax_method1_posting_individual_limit before insert
  on public."FIN_IndirectTaxPriorErrorMethod1Postings"
  for each row execute function public._multideck_uk_vat_guard_method1_individual_limits();

commit;
