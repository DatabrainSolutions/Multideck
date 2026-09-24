begin;
alter function public.multideck_finance_cost_review(uuid,uuid,integer,text) rename to _multideck_cost_review_before_controls;
revoke all on function public._multideck_cost_review_before_controls(uuid,uuid,integer,text) from public,anon,authenticated;
create function public.multideck_finance_cost_review(p_actor uuid,p_entity uuid,p_offset integer default 0,p_search text default '')
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare result jsonb; rows jsonb:='[]'; row jsonb; final public."FIN_CostFinalisations"; evidence public."FIN_CostEvidence";
begin
  result:=public._multideck_cost_review_before_controls(p_actor,p_entity,p_offset,p_search);
  for row in select value from jsonb_array_elements(result->'rows') loop
    select * into final from public."FIN_CostFinalisations" where legal_entity_id=p_entity and charge_id=(row->>'id')::uuid order by evaluated_at desc,id desc limit 1;
    select * into evidence from public."FIN_CostEvidence" where legal_entity_id=p_entity and charge_id=(row->>'id')::uuid order by recorded_at desc,id desc limit 1;
    if final.status in ('posted','settled') then
      if final.evidence_id=evidence.id and evidence.source_revision=md5(public._multideck_cost_source(p_entity,(row->>'id')::uuid)::text) then
        row:=row||jsonb_build_object('remainingEstimate','0.0000','reasons',jsonb_build_array('Final invoice confirmed; residual settled'));
      else
        row:=row||jsonb_build_object('remainingEstimate',null,'reasons',(row->'reasons')||jsonb_build_array('Finalised charge changed; review late invoice or estimate'));
      end if;
    elsif final.status='review' then
      row:=row||jsonb_build_object('reasons',(row->'reasons')||jsonb_build_array(final.reason));
    elsif evidence.is_final and evidence.source_revision=md5(public._multideck_cost_source(p_entity,(row->>'id')::uuid)::text) then
      row:=jsonb_set(row,'{reasons}',coalesce((select jsonb_agg(value) from jsonb_array_elements(row->'reasons') where value<>'"Confirm partial or final invoice"'::jsonb),'[]'::jsonb)||jsonb_build_array('Final invoice confirmed; awaiting controlled evaluation'));
    end if;
    rows:=rows||jsonb_build_array(row);
  end loop;
  return result||jsonb_build_object('mode','controlled','rows',rows);
end; $$;
revoke all on function public.multideck_finance_cost_review(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.multideck_finance_cost_review(uuid,uuid,integer,text) to service_role;
comment on function public.multideck_finance_cost_review(uuid,uuid,integer,text) is 'Lifetime cost review with persisted finalisation evidence. Stale finals require review; settled residuals are not presented as remaining liabilities.';
commit;
