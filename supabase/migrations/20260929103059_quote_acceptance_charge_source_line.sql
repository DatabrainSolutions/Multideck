-- A submitted Quote can contain several charges. The source uniqueness index
-- identifies each copied Booking charge by both version and Quote line.
-- Keep this repair limited to future inserts; accepted Quote snapshots and
-- existing Booking charges are not rewritten.
begin;
set local lock_timeout = '5s';

do $$
declare
  definition text;
  signature text;
  old_columns text := '"JobCostingLine_SourceID", "JobCostingLine_SourceMetadataJSON"';
  new_columns text := '"JobCostingLine_SourceID", "JobCostingLine_SourceLineID", "JobCostingLine_SourceMetadataJSON"';
  old_values text;
  new_values text;
begin
  foreach signature in array array[
    'booking_api.convert_accepted_quote_before_sync_review_20260904(uuid,uuid,uuid)',
    'booking_api.release_provisional_quote_charges()'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    if signature like '%convert_accepted%' then
      old_values := 'version_row."CusQuoteVersion_ID", jsonb_build_object(''quoteCharge'',charge)';
      new_values := 'version_row."CusQuoteVersion_ID", nullif(charge->>''id'', '''')::uuid, jsonb_build_object(''quoteCharge'',charge)';
    else
      old_values := 'new."Job_SourceQuoteVersionID", jsonb_build_object(''quoteCharge'',charge)';
      new_values := 'new."Job_SourceQuoteVersionID", nullif(charge->>''id'', '''')::uuid, jsonb_build_object(''quoteCharge'',charge)';
    end if;
    if (length(definition) - length(replace(definition, new_columns, ''))) / length(new_columns) = 1
      and (length(definition) - length(replace(definition, new_values, ''))) / length(new_values) = 1 then
      continue; -- The live function may already have the repair; still record this migration.
    end if;
    if definition like '%' || new_columns || '%' or definition like '%' || new_values || '%' then
      raise exception 'Quote charge source identity is only partly repaired in %', signature;
    end if;
    if (length(definition) - length(replace(definition, old_columns, ''))) / length(old_columns) <> 1 then
      raise exception 'Review Quote charge insert columns before applying %', signature;
    end if;
    if (length(definition) - length(replace(definition, old_values, ''))) / length(old_values) <> 1 then
      raise exception 'Review Quote charge insert values before applying %', signature;
    end if;
    execute replace(replace(definition, old_columns, new_columns), old_values, new_values);
  end loop;
end $$;

commit;
