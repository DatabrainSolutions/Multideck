-- Dexter parity exception: abandoned draft deletion remains a direct register
-- action with inline confirmation. It is intentionally not an agent action or
-- Watching for you event because it destroys unsent operator work.
create or replace function public.delete_customs_draft(
  p_declaration_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reference text;
  v_status text;
  v_is_deleted boolean;
  v_changed_at timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to delete a Customs draft.';
  end if;

  select
    declaration."CUST_LocalReferenceNumber",
    declaration."CUST_Status",
    declaration."CUST_IsDeleted"
  into v_reference, v_status, v_is_deleted
  from public."Customs_Declarations" as declaration
  where declaration."CUST_id" = p_declaration_id
    and declaration."CUST_CreatedBy" = v_user_id
  for update;

  if not found or v_is_deleted or v_status <> 'draft' then
    raise exception using errcode = '42501', message = 'This Customs draft is unavailable or can no longer be deleted.';
  end if;

  update public."Customs_Declarations"
  set
    "CUST_IsDeleted" = true,
    "CUST_UpdatedAt" = v_changed_at,
    "CUST_UpdatedBy" = v_user_id
  where "CUST_id" = p_declaration_id;

  insert into public."Customs_AuditLog" (
    "CUSTAU_CustomsID",
    "CUSTAU_Action",
    "CUSTAU_TableName",
    "CUSTAU_RecordID",
    "CUSTAU_ChangedBy",
    "CUSTAU_ChangedAt",
    "CUSTAU_OldValues",
    "CUSTAU_NewValues",
    "CUSTAU_Source",
    "CUSTAU_Notes"
  ) values (
    p_declaration_id,
    'draft_deleted',
    'Customs_Declarations',
    p_declaration_id,
    v_user_id,
    v_changed_at,
    jsonb_build_object('isDeleted', false, 'status', v_status),
    jsonb_build_object('isDeleted', true, 'status', v_status),
    'multideck_app',
    coalesce(v_reference, p_declaration_id::text)
  );

  return true;
end;
$$;

revoke all on function public.delete_customs_draft(uuid) from public, anon;
grant execute on function public.delete_customs_draft(uuid) to authenticated;
grant execute on function public.delete_customs_draft(uuid) to service_role;

comment on function public.delete_customs_draft(uuid) is
  'Soft-deletes one authenticated user-owned Customs declaration while it is still a draft and records the action in the Customs audit log.';
