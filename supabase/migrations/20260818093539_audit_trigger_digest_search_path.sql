begin;

-- Audited writes can originate inside hardened security-definer functions that
-- deliberately use an empty search path. Give the shared audit trigger its own
-- fixed lookup path so pgcrypto.digest remains available without depending on
-- whichever function happened to perform the write.
alter function public."Audit_RowChangeTrigger"()
  set search_path = pg_catalog, public, extensions;

commit;
