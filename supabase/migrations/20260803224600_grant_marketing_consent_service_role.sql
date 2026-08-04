-- Customer and contact Edge Functions use the private consent helper after their own
-- permission checks. Browser roles continue to use only the narrow authenticated RPC.

begin;

grant execute on function public._multideck_set_marketing_consent(
  text, uuid, boolean, text, text, uuid, jsonb
) to service_role;

commit;
