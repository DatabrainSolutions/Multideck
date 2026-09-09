begin;

alter view public."Comm_CallLogSummary" set (security_invoker = true);

revoke all on table public."Comm_CallLogSummary" from public, anon, authenticated;
grant select on table public."Comm_CallLogSummary" to service_role;

commit;
