begin;

-- Preserve the original bounded, permissioned snapshot, then attach current
-- linked-credit evidence to each source line. A separate credit note may alter
-- the price even when no cash was allocated to that credit note itself.
alter function public.multideck_uk_vat_cash_source_snapshot(uuid,uuid,date,date)
  rename to _multideck_uk_vat_cash_source_snapshot_before_credit_guard;
revoke all on function public._multideck_uk_vat_cash_source_snapshot_before_credit_guard(uuid,uuid,date,date)
  from public,anon,authenticated,service_role;

create function public.multideck_uk_vat_cash_source_snapshot(
  p_actor uuid,p_entity uuid,p_start date,p_end date
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public as $$
declare v_snapshot jsonb; v_allocations jsonb;
begin
  v_snapshot:=public._multideck_uk_vat_cash_source_snapshot_before_credit_guard(
    p_actor,p_entity,p_start,p_end);
  if v_snapshot->>'truncated'='true' then return v_snapshot; end if;
  select coalesce(jsonb_agg(
    allocation.value||jsonb_build_object('lines',coalesce((
      select jsonb_agg(line.value||jsonb_build_object(
        'linkedCreditCount',(
          select count(*)::integer from public."FIN_IndirectTaxCreditLinks" linked
          where linked.legal_entity_id=p_entity
            and linked.original_evidence_id=(line.value->>'evidenceId')::uuid
        )) order by line.ordinality)
      from jsonb_array_elements(allocation.value->'lines') with ordinality line(value,ordinality)
    ),'[]'::jsonb)) order by allocation.ordinality),'[]'::jsonb)
    into v_allocations
  from jsonb_array_elements(v_snapshot->'allocations') with ordinality allocation(value,ordinality);
  return jsonb_set(v_snapshot,'{allocations}',v_allocations);
end; $$;
revoke all on function public.multideck_uk_vat_cash_source_snapshot(uuid,uuid,date,date)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_cash_source_snapshot(uuid,uuid,date,date)
  to service_role;

commit;
