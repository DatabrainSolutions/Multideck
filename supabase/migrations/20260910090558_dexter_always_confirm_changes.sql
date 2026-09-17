begin;
create or replace function private.multideck_dexter_guard_mandatory_approval()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, private as $$
begin
  if new."AIDexterPrepared_Status" = 'executing' and new."AIDexterPrepared_ApprovedAt" is null then
    raise exception 'This Dexter action requires explicit operator approval.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.multideck_dexter_guard_mandatory_approval() from public, anon, authenticated;
update public."AI_DexterConversationGrants" set "AIDexterGrant_Status"='revoked', "AIDexterGrant_RevokedAt"=now() where "AIDexterGrant_Status"='active';
commit;
