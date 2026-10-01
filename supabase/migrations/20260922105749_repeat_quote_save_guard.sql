-- Repeat-copy provenance survives normal draft saves. The creation-only guard
-- previously rejected its own persisted reason on every subsequent save.
-- Patch the current inner wrapper, preserving later version/access guards and
-- all creation/audit behaviour. Abort rather than replacing an unknown body.
begin;
do $migration$
declare
  signature regprocedure := 'public.quote_workflow_save_before_discard_20260909(uuid,uuid,jsonb)'::regprocedure;
  definition text;
  old_clause text := $old$  elsif copy_reason is not null and copy_reason <> 'customer_changed' then$old$;
  new_clause text := $new$  elsif requested_quote_id is not null and copy_reason = 'repeat_quote' then
    -- Only retain provenance already recorded on this quote, not a newly
    -- supplied or substituted source. Normal write authorisation still runs
    -- through the outer version guard and the delegated save function.
    if not exists (
      select 1 from public."CusQuote_Header" existing_quote
      where existing_quote."CusQuoteHeader_ID" = requested_quote_id
        and existing_quote."CusQuoteHeader_ShipmentFactsJSON"->>'copyReason' = 'repeat_quote'
        and existing_quote."CusQuoteHeader_ShipmentFactsJSON"->>'copiedFromQuoteId'
          = payload #>> '{shipmentFacts,copiedFromQuoteId}'
        and (existing_quote."CusQuoteHeader_ShipmentFactsJSON"->>'copiedFromQuoteReference')
          is not distinct from (payload #>> '{shipmentFacts,copiedFromQuoteReference}')
    ) then
      raise exception 'The repeat quote source cannot be changed.' using errcode = '22023';
    end if;
  elsif copy_reason is not null and copy_reason <> 'customer_changed' then$new$;
begin
  definition := pg_get_functiondef(signature);
  if (length(definition) - length(replace(definition, old_clause, ''))) / length(old_clause) <> 1 then
    raise exception 'Repeat quote save guard differs from the reviewed definition.';
  end if;
  execute replace(definition, old_clause, new_clause);
end;
$migration$;
commit;
