begin;
-- Tenant default privileges must not expose calculation evidence to anonymous
-- callers or permit direct writes. All writes use the service-only audited RPC.
revoke all on public."Customs_CalculationAudit" from public, anon, authenticated, service_role;
grant select on public."Customs_CalculationAudit" to authenticated, service_role;
commit;
