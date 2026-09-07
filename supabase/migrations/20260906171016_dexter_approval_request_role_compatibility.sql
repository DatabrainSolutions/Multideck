-- PostgREST supplies request.jwt.claims; older runtimes used individual claim
-- settings. Supabase's role resolver supports both. Keep approval server-only
-- and preserve the exact owner, company, conversation, state and expiry checks.
create or replace function public.multideck_dexter_approve_prepared_action(
  p_prepared_action_id uuid,
  p_company_id uuid,
  p_user_id uuid,
  p_conversation_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'server_only' using errcode = '42501';
  end if;
  update public."AI_DexterPreparedActions"
  set "AIDexterPrepared_ApprovedAt" = now()
  where "AIDexterPrepared_ID" = p_prepared_action_id
    and "AIDexterPrepared_CompanyID" = p_company_id
    and "AIDexterPrepared_UserID" = p_user_id
    and "AIDexterPrepared_ConversationID" is not distinct from p_conversation_id
    and "AIDexterPrepared_Status" = 'prepared'
    and "AIDexterPrepared_ExpiresAt" > now();
  return found;
end;
$$;

revoke all on function public.multideck_dexter_approve_prepared_action(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.multideck_dexter_approve_prepared_action(uuid, uuid, uuid, uuid) to service_role;
