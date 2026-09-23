-- The response-state constraint trigger runs at transaction end. Charge
-- provenance must see the accepted version before header conversion runs.
-- Preserve the current deployed function and all link/access/decision checks.
do $migration$
declare
  target regprocedure := 'quote_api.submit_customer_response(text,text,text,text,uuid,text,text,text)'::regprocedure;
  definition text := pg_get_functiondef(target);
  anchor text := E'  lifecycle_value := case decision_value\n';
  replacement text := $replacement$  if decision_value = 'accepted' then
    update public."CusQuote_Versions"
    set "CusQuoteVersion_StatusCode" = 'accepted'
    where "CusQuoteVersion_ID" = link_row.quote_version_id
      and "CusQuoteHeader_ID" = link_row.quote_id
      and "CusQuoteVersion_IsSubmitted";
    if not found then
      raise exception 'Only a submitted quote version can be accepted.' using errcode = '22023';
    end if;
  end if;

  lifecycle_value := case decision_value
$replacement$;
begin
  if (length(definition) - length(replace(definition, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'Unexpected customer response function; review before applying acceptance-order fix.';
  end if;
  execute replace(definition, anchor, replacement);
end;
$migration$;
