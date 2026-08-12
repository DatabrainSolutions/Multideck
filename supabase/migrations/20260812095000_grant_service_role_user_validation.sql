begin;

-- Edge Functions use the service role for reviewed workspace-user changes.
-- These validators are referenced by cmp_Users check constraints, so Postgres
-- must be able to execute them whenever the service role updates that row.
grant execute on function private.is_valid_sidebar_layout(jsonb) to service_role;
grant execute on function private.is_valid_table_pinned_columns(jsonb) to service_role;

commit;
