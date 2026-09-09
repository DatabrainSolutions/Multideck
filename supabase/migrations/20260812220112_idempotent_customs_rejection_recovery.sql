-- Retrying a correction after the initial save must not fail simply because the
-- declaration has already moved from rejected back to draft.
create or replace function public.reopen_rejected_customs_declaration(
  p_declaration_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required to correct a Customs declaration.';
  end if;

  select declaration."CUST_Status"
  into v_status
  from public."Customs_Declarations" declaration
  where declaration."CUST_id" = p_declaration_id
    and declaration."CUST_CreatedBy" = v_user_id
    and declaration."CUST_DeclarationKind" in ('cds_export', 'cds_import')
    and declaration."CUST_Status" in ('rejected', 'draft')
    and not declaration."CUST_IsDeleted"
  for update;

  if v_status is null then
    raise exception using errcode = '42501', message = 'This rejected Customs declaration is unavailable or cannot be corrected.';
  end if;

  if v_status = 'draft' then
    return v_status;
  end if;

  update public."Customs_Declarations"
  set
    "CUST_Status" = 'draft',
    "CUST_UpdatedAt" = clock_timestamp(),
    "CUST_UpdatedBy" = v_user_id
  where "CUST_id" = p_declaration_id;

  insert into public."Customs_AuditLog" (
    "CUSTAU_CustomsID", "CUSTAU_Action", "CUSTAU_TableName", "CUSTAU_RecordID",
    "CUSTAU_ChangedBy", "CUSTAU_OldValues", "CUSTAU_NewValues", "CUSTAU_Source", "CUSTAU_Notes"
  ) values (
    p_declaration_id, 'customs_rejection_correction_started', 'Customs_Declarations', p_declaration_id,
    v_user_id, jsonb_build_object('status', 'rejected'), jsonb_build_object('status', 'draft'),
    'multideck_app', 'The operator started a corrected declaration after a Customs rejection.'
  );

  return 'draft';
end;
$$;

revoke all on function public.reopen_rejected_customs_declaration(uuid) from public;
grant execute on function public.reopen_rejected_customs_declaration(uuid) to authenticated;

comment on function public.reopen_rejected_customs_declaration(uuid) is
  'Idempotently reopens an operator-owned rejected CDS declaration for correction. Submitted and accepted declarations remain immutable.';
