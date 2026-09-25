begin;

-- The period key is software-only. A backend readback may obtain it only for
-- an already claimed, unresolved attempt in this physical tenant. The token
-- is separately scoped and audited by multideck_hmrc_vat_access_for_period.
create function public.multideck_uk_vat_readback_context(
  p_actor uuid,p_entity uuid,p_project_ref text,p_period uuid,
  p_connection uuid,p_attempt uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_attempt public."FIN_HmrcVatSubmissionAttempts"%rowtype;
  v_connection public."FIN_HmrcVatConnections"%rowtype;
begin
  perform public._multideck_uk_vat_access(p_actor,p_entity);
  if p_project_ref is null or length(p_project_ref) not between 4 and 120
    or p_period is null or p_connection is null or p_attempt is null then
    raise exception 'Choose a scoped HMRC VAT readback.' using errcode='22023';
  end if;
  select attempt.* into v_attempt
  from public."FIN_HmrcVatSubmissionAttempts" attempt
  join public."FIN_IndirectTaxPeriods" period on period.id=attempt.period_id
  where attempt.id=p_attempt and attempt.period_id=p_period
    and attempt.tenant_project_ref=p_project_ref
    and period.legal_entity_id=p_entity and period.jurisdiction_code='GB';
  if not found or v_attempt.status not in ('dispatching','reconciliation_required')
    or v_attempt.period_key !~ '^(?:[A-Za-z0-9]{4}|#[A-Za-z0-9]{3})$'
    or v_attempt.payload_body::jsonb->>'periodKey' is distinct from v_attempt.period_key then
    raise exception 'A claimed, unresolved VAT return is required for readback.' using errcode='22023';
  end if;
  select * into v_connection from public."FIN_HmrcVatConnections"
    where id=p_connection and tenant_project_ref=p_project_ref
      and legal_entity_id=p_entity and registration_id=v_attempt.registration_id
      and vrn=v_attempt.vrn and environment=v_attempt.environment
      and status='connected' and granted_scope='read:vat write:vat'
      and authority_expires_at>now() and access_expires_at>now()+interval '1 minute'
      and refresh_lease_id is null;
  if not found then raise exception 'Current HMRC VAT authority is required for readback.' using errcode='42501'; end if;
  perform public._multideck_uk_vat_access(v_connection.granted_by_actor_id,p_entity);
  return jsonb_build_object('attemptId',v_attempt.id,'periodId',v_attempt.period_id,
    'connectionId',v_connection.id,'environment',v_attempt.environment,
    'vrn',v_attempt.vrn,'periodKey',v_attempt.period_key);
end; $$;
revoke all on function public.multideck_uk_vat_readback_context(uuid,uuid,text,uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.multideck_uk_vat_readback_context(uuid,uuid,text,uuid,uuid,uuid)
  to service_role;

commit;
