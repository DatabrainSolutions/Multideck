begin;

create index "IX_FIN_IndirectTaxEvidence_source_document"
  on public."FIN_IndirectTaxEvidence"(source_document_id)
  where source_document_id is not null;
create index "IX_FIN_IndirectTaxEvidence_source_batch"
  on public."FIN_IndirectTaxEvidence"(source_posting_batch_id)
  where source_posting_batch_id is not null;

-- A VAT sign-off freezes the posted transaction and its source journal. Cash
-- settlement and provider delivery still update their own operational fields.
-- Corrections must be separate posted credits, reversals or tax adjustments.
create function public._multideck_vat_signed_document(p_document uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if p_document is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('vat-source-document:'||p_document::text,0));
  return exists (
    select 1 from public."FIN_IndirectTaxReconciliations" signed
    join public."FIN_IndirectTaxEvidence" evidence on evidence.id=signed.evidence_id
    where evidence.source_document_id=p_document
  );
end; $$;
revoke all on function public._multideck_vat_signed_document(uuid) from public,anon,authenticated;

create function public._multideck_vat_signed_document_line(p_line uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_document uuid;
begin
  if p_line is null then return false; end if;
  select "FINDocLine_DocumentID" into v_document
  from public."FIN_DocumentLines" where "FINDocLine_ID"=p_line;
  return public._multideck_vat_signed_document(v_document);
end; $$;
revoke all on function public._multideck_vat_signed_document_line(uuid) from public,anon,authenticated;

create function public._multideck_vat_signed_batch(p_batch uuid)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_document uuid;
begin
  if p_batch is null then return false; end if;
  for v_document in select distinct source_document_id
    from public."FIN_IndirectTaxEvidence"
    where source_posting_batch_id=p_batch and source_document_id is not null
    order by source_document_id loop
    if public._multideck_vat_signed_document(v_document) then return true; end if;
  end loop;
  return exists (
    select 1 from public."FIN_IndirectTaxReconciliations" signed
    join public."FIN_IndirectTaxEvidence" evidence on evidence.id=signed.evidence_id
    where evidence.source_posting_batch_id=p_batch
  );
end; $$;
revoke all on function public._multideck_vat_signed_batch(uuid) from public,anon,authenticated;

create function public._multideck_vat_lock_document()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_old jsonb; v_new jsonb;
  v_delivery_fields text[]:=array[
    'FINDoc_OutstandingAmount','FINDoc_LocalOutstandingAmount',
    'FINDoc_StatusCode','FINDoc_PostingStatusCode',
    'FINDoc_ExportStatusCode','FINDoc_ExportBatchID',
    'FINDoc_UpdatedAt','FINDoc_UpdatedBy'
  ];
begin
  if not public._multideck_vat_signed_document(old."FINDoc_ID") then
    if tg_op='UPDATE' and new."FINDoc_ID" is distinct from old."FINDoc_ID"
      and public._multideck_vat_signed_document(new."FINDoc_ID") then
      raise exception 'A VAT-reconciled transaction cannot be changed; post a separate correction.' using errcode='22023';
    end if;
    return case when tg_op='DELETE' then old else new end;
  end if;
  if tg_op='DELETE' then
    raise exception 'A VAT-reconciled transaction cannot be deleted; post a separate correction.' using errcode='22023';
  end if;
  v_old:=to_jsonb(old); v_new:=to_jsonb(new);
  if v_new-v_delivery_fields is distinct from v_old-v_delivery_fields
    or coalesce((v_new->>'FINDoc_IsLocked')::boolean,true) is false
    or (v_new->>'FINDoc_StatusCode') is distinct from (v_old->>'FINDoc_StatusCode')
      and not ((v_old->>'FINDoc_StatusCode')='approved' and (v_new->>'FINDoc_StatusCode')='submitted') then
    raise exception 'A VAT-reconciled transaction cannot be changed; post a separate correction.' using errcode='22023';
  end if;
  return new;
end; $$;
revoke all on function public._multideck_vat_lock_document() from public,anon,authenticated;
create trigger vat_signed_document_lock before update or delete on public."FIN_Documents"
  for each row execute function public._multideck_vat_lock_document();

create function public._multideck_vat_lock_document_line()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op<>'INSERT' and public._multideck_vat_signed_document(old."FINDocLine_DocumentID") then
    raise exception 'A VAT-reconciled transaction line cannot be changed; post a separate correction.' using errcode='22023';
  end if;
  if tg_op<>'DELETE' and public._multideck_vat_signed_document(new."FINDocLine_DocumentID") then
    raise exception 'A VAT-reconciled transaction line cannot be changed; post a separate correction.' using errcode='22023';
  end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
revoke all on function public._multideck_vat_lock_document_line() from public,anon,authenticated;
create trigger vat_signed_document_line_lock before insert or update or delete on public."FIN_DocumentLines"
  for each row execute function public._multideck_vat_lock_document_line();

create function public._multideck_vat_lock_document_job_link()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op<>'INSERT' and (public._multideck_vat_signed_document(old."FINDocLineJob_DocumentID")
    or public._multideck_vat_signed_document_line(old."FINDocLineJob_DocumentLineID")) then
    raise exception 'A VAT-reconciled transaction job link cannot be changed; post a separate correction.' using errcode='22023';
  end if;
  if tg_op<>'DELETE' and (public._multideck_vat_signed_document(new."FINDocLineJob_DocumentID")
    or public._multideck_vat_signed_document_line(new."FINDocLineJob_DocumentLineID")) then
    raise exception 'A VAT-reconciled transaction job link cannot be changed; post a separate correction.' using errcode='22023';
  end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
revoke all on function public._multideck_vat_lock_document_job_link() from public,anon,authenticated;
create trigger vat_signed_document_job_link_lock before insert or update or delete on public."FIN_DocumentLineJobLinks"
  for each row execute function public._multideck_vat_lock_document_job_link();

create function public._multideck_vat_lock_posting_line()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if tg_op<>'INSERT' and (public._multideck_vat_signed_batch(old."FINPostLine_BatchID")
    or public._multideck_vat_signed_document(old."FINPostLine_DocumentID")
    or public._multideck_vat_signed_document_line(old."FINPostLine_DocumentLineID")) then
    raise exception 'A VAT-reconciled source posting cannot be changed; post a separate correction.' using errcode='22023';
  end if;
  if tg_op<>'DELETE' and (public._multideck_vat_signed_batch(new."FINPostLine_BatchID")
    or public._multideck_vat_signed_document(new."FINPostLine_DocumentID")
    or public._multideck_vat_signed_document_line(new."FINPostLine_DocumentLineID")) then
    raise exception 'A VAT-reconciled source posting cannot be changed; post a separate correction.' using errcode='22023';
  end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
revoke all on function public._multideck_vat_lock_posting_line() from public,anon,authenticated;
create trigger vat_signed_posting_line_lock before insert or update or delete on public."FIN_PostingLines"
  for each row execute function public._multideck_vat_lock_posting_line();

create function public._multideck_vat_lock_posting_batch()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if public._multideck_vat_signed_batch(old."FINPostBatch_ID") then
    raise exception 'A VAT-reconciled posting batch cannot be changed; post a separate correction.' using errcode='22023';
  end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
revoke all on function public._multideck_vat_lock_posting_batch() from public,anon,authenticated;
create trigger vat_signed_posting_batch_lock before update or delete on public."FIN_PostingBatches"
  for each row execute function public._multideck_vat_lock_posting_batch();

commit;
