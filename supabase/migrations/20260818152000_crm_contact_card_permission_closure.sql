-- Bind every authenticated Contact Card read and mutation to the same CRM
-- permission model as the rest of the product. Public QR-card reads, scans and
-- exchanges remain intentionally public and are not widened by this migration.

begin;

create or replace function public._crm_contact_card_require_permission(p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
begin
  select * into v_context from public._multideck_crm_context();
  if not public._multideck_crm_has_permission(v_context.user_id, p_permission) then
    raise exception 'You do not have permission to use Contact Cards.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public._crm_contact_card_require_permission(text) from public, anon, authenticated;
grant execute on function public._crm_contact_card_require_permission(text) to service_role;

-- Keep the already-reviewed implementations intact, but make them private.
-- The public names below become small permission-checked entry points.
alter function public.multideck_contact_cards_workspace()
  rename to _cc_workspace_unchecked_20260818;
alter function public.multideck_contact_card_save_atomic(jsonb)
  rename to _cc_save_atomic_unchecked_20260818;
alter function public.multideck_contact_card_delete(uuid)
  rename to _cc_delete_unchecked_20260818;
alter function public.multideck_contact_card_preview(text)
  rename to _cc_preview_unchecked_20260818;
alter function public.multideck_contact_card_test_automation(uuid)
  rename to _cc_test_automation_unchecked_20260818;
alter function public.multideck_contact_card_rerun(uuid)
  rename to _cc_rerun_unchecked_20260818;

revoke all on function public._cc_workspace_unchecked_20260818() from public, anon, authenticated;
revoke all on function public._cc_save_atomic_unchecked_20260818(jsonb) from public, anon, authenticated;
revoke all on function public._cc_delete_unchecked_20260818(uuid) from public, anon, authenticated;
revoke all on function public._cc_preview_unchecked_20260818(text) from public, anon, authenticated;
revoke all on function public._cc_test_automation_unchecked_20260818(uuid) from public, anon, authenticated;
revoke all on function public._cc_rerun_unchecked_20260818(uuid) from public, anon, authenticated;

create function public.multideck_contact_cards_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  perform public._crm_contact_card_require_permission('CRM.Read');
  return public._cc_workspace_unchecked_20260818();
end;
$$;

create function public.multideck_contact_card_save_atomic(p_card jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  perform public._crm_contact_card_require_permission('CRM.Write');
  return public._cc_save_atomic_unchecked_20260818(p_card);
end;
$$;

create function public.multideck_contact_card_delete(p_card_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  perform public._crm_contact_card_require_permission('CRM.Write');
  perform public._cc_delete_unchecked_20260818(p_card_id);
end;
$$;

create function public.multideck_contact_card_preview(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  perform public._crm_contact_card_require_permission('CRM.Read');
  return public._cc_preview_unchecked_20260818(p_slug);
end;
$$;

create function public.multideck_contact_card_test_automation(p_card_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  perform public._crm_contact_card_require_permission('CRM.Write');
  return public._cc_test_automation_unchecked_20260818(p_card_id);
end;
$$;

create function public.multideck_contact_card_rerun(p_run_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  perform public._crm_contact_card_require_permission('CRM.Write');
  return public._cc_rerun_unchecked_20260818(p_run_id);
end;
$$;

revoke all on function public.multideck_contact_cards_workspace() from public, anon;
revoke all on function public.multideck_contact_card_save_atomic(jsonb) from public, anon;
revoke all on function public.multideck_contact_card_delete(uuid) from public, anon;
revoke all on function public.multideck_contact_card_preview(text) from public, anon;
revoke all on function public.multideck_contact_card_test_automation(uuid) from public, anon;
revoke all on function public.multideck_contact_card_rerun(uuid) from public, anon;

grant execute on function public.multideck_contact_cards_workspace() to authenticated, service_role;
grant execute on function public.multideck_contact_card_save_atomic(jsonb) to authenticated, service_role;
grant execute on function public.multideck_contact_card_delete(uuid) to authenticated, service_role;
grant execute on function public.multideck_contact_card_preview(text) to authenticated, service_role;
grant execute on function public.multideck_contact_card_test_automation(uuid) to authenticated, service_role;
grant execute on function public.multideck_contact_card_rerun(uuid) to authenticated, service_role;

-- Legacy implementation entry points must not bypass the wrappers.
revoke all on function public.multideck_contact_card_save(jsonb) from authenticated;
revoke all on function public.multideck_contact_card_create(jsonb) from authenticated;
revoke all on function public.multideck_contact_card_set_tenant_name_visibility(uuid, boolean) from authenticated;

-- Dexter exception: this closes permissions around an existing CRM domain. It
-- adds no new data, action or event, so the existing Contact Cards domain and
-- event-driven watch adapter remain the correct capability surfaces.

commit;
