-- Usage watch adapters run only as database triggers. They are not browser RPCs.
-- Preserve event-driven evaluation while removing default callable privileges.
begin;

revoke all on function public._multideck_model_egress_usage_watch()
  from public, anon, authenticated;
revoke all on function public._multideck_document_usage_watch()
  from public, anon, authenticated;
revoke all on function public._multideck_customs_usage_watch()
  from public, anon, authenticated;

commit;
