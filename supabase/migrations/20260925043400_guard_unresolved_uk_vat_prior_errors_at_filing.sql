begin;

-- Method 1 is not yet posted into the VAT account or nine boxes. Until that
-- workflow exists, a recorded prior-return error must be linked to evidence
-- of a separate Method 2 notification before this period can be declared.
-- HMRC permits choosing Method 2 even when an error is below its threshold.
create function public._multideck_uk_vat_require_resolved_prior_errors(p_period uuid)
returns void language plpgsql stable set search_path=pg_catalog,public as $$
declare v_unresolved integer;
begin
  select count(*)::integer into v_unresolved
  from public."FIN_IndirectTaxPriorPeriodErrorIntake" intake
  where intake.discovery_period_id=p_period
    and not exists (
      select 1 from public."FIN_IndirectTaxPriorErrorNotificationItems" linked
      join public."FIN_IndirectTaxPriorErrorNotifications" notice
        on notice.id=linked.notification_id
        and notice.legal_entity_id=intake.legal_entity_id
        and notice.discovery_period_id=intake.discovery_period_id
      where linked.intake_id=intake.id
        and linked.legal_entity_id=intake.legal_entity_id);
  if v_unresolved>0 then
    raise exception '% previous-return VAT error(s) lack a completed correction route. Record separate HMRC notification evidence or wait for reviewed Method 1 adjustment support before approving this return.',v_unresolved
      using errcode='22023';
  end if;
end; $$;
revoke all on function public._multideck_uk_vat_require_resolved_prior_errors(uuid)
  from public,anon,authenticated,service_role;

create function public._multideck_uk_vat_prior_error_filing_gate()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if tg_table_name='FIN_IndirectTaxFilingApprovals' or tg_op='INSERT' then
    perform public._multideck_uk_vat_require_resolved_prior_errors(new.period_id);
  elsif old.status='reserved' and new.status='dispatching' then
    perform public._multideck_uk_vat_require_resolved_prior_errors(new.period_id);
  end if;
  return new;
end; $$;
revoke all on function public._multideck_uk_vat_prior_error_filing_gate()
  from public,anon,authenticated,service_role;
create trigger vat_prior_errors_block_filing_approval before insert
  on public."FIN_IndirectTaxFilingApprovals"
  for each row execute function public._multideck_uk_vat_prior_error_filing_gate();
create trigger vat_prior_errors_block_submission_reservation before insert or update
  on public."FIN_HmrcVatSubmissionAttempts"
  for each row execute function public._multideck_uk_vat_prior_error_filing_gate();

commit;
