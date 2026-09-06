-- The follow-up wrapper recreated this function after a rename. New functions
-- inherit PUBLIC EXECUTE even when the renamed implementation was restricted.
-- Only the trusted sending service may certify provider delivery and issue a
-- response link. Customer acceptance continues through quote-response.
begin;
set local lock_timeout = '5s';
revoke all on function public.quote_workflow_finalize_customer_response_v4(uuid, text)
  from public, anon, authenticated;
grant execute on function public.quote_workflow_finalize_customer_response_v4(uuid, text)
  to service_role;
commit;
