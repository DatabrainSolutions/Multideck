-- Keep mandatory approval fail-closed even when a deployment has not yet
-- registered every high-impact Dexter action in sys_AIDexterActions.

create or replace function private.multideck_dexter_guard_prepared_action()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_intent record;
  v_always_approve boolean := false;
  v_target uuid;
begin
  select coalesce(action."AIDexterAction_AlwaysRequiresApproval", false)
  into v_always_approve
  from public."sys_AIDexterActions" action
  where action."AIDexterAction_Code" = new."AIDexterPrepared_ActionCode";
  v_always_approve := coalesce(v_always_approve, false)
    or new."AIDexterPrepared_ActionCode" in ('create_purchase_order', 'create_support_ticket');

  select * into v_intent
  from public."AI_DexterIntentPlans" intent
  where intent."AIDexterIntent_ID" = new."AIDexterPrepared_IntentID"
    and intent."AIDexterIntent_CompanyID" = new."AIDexterPrepared_CompanyID"
    and intent."AIDexterIntent_UserID" = new."AIDexterPrepared_UserID"
    and intent."AIDexterIntent_AccessMode" = new."AIDexterPrepared_AccessMode"
    and intent."AIDexterIntent_ExpiresAt" > now()
    and intent."AIDexterIntent_AllowedActionsJSON" ? new."AIDexterPrepared_ActionCode";
  if not found then
    raise exception 'Dexter action is outside the current operator intent.' using errcode = '42501';
  end if;

  if new."AIDexterPrepared_AccessMode" = 'full'
     and not v_always_approve
     and new."AIDexterPrepared_ActionCode" not in ('create_email_draft', 'send_email') then
    for v_target in
      select distinct target_id
      from private.multideck_dexter_action_target_ids(new."AIDexterPrepared_ArgumentsJSON") as targets(target_id)
    loop
      if not (coalesce(v_intent."AIDexterIntent_TargetConstraintsJSON", '[]'::jsonb) ? v_target::text) then
        raise exception 'Dexter action target is outside the current operator intent.' using errcode = '42501';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function private.multideck_dexter_guard_prepared_action() from public, anon, authenticated;

create or replace function private.multideck_dexter_guard_mandatory_approval()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if old."AIDexterPrepared_Status" = 'prepared'
     and new."AIDexterPrepared_Status" = 'executing'
     and new."AIDexterPrepared_ApprovedAt" is null
     and (
       new."AIDexterPrepared_ActionCode" in ('create_purchase_order', 'create_support_ticket')
       or exists (
         select 1
         from public."sys_AIDexterActions" action
         where action."AIDexterAction_Code" = new."AIDexterPrepared_ActionCode"
           and action."AIDexterAction_AlwaysRequiresApproval"
       )
     ) then
    raise exception 'This Dexter action requires explicit operator approval.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.multideck_dexter_guard_mandatory_approval() from public, anon, authenticated;
