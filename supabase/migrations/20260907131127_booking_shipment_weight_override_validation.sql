begin;
set local lock_timeout='5s';
-- Reuse the line decimal validator, but keep the shipment override independent.
-- Validation runs inside the existing authorised, locked detail-save boundary.
do $$declare definition text;
  anchor text:='  details := coalesce(job_row."Job_EditableDetailsJSON", ''{}''::jsonb)';
  validation text:=$validation$
  if (payload->'editableDetails') ? 'chargeableWeightKg' then
    begin
      payload:=jsonb_set(payload,'{editableDetails,chargeableWeightKg}',
        booking_api.normalise_cargo_numbers(jsonb_build_array(jsonb_build_object(
          'chargeableWeightKg',payload#>'{editableDetails,chargeableWeightKg}')))#>'{0,chargeableWeightKg}');
    exception when invalid_parameter_value then
      raise exception 'Shipment override (kg) must be a non-negative decimal up to 999999999999, or blank to clear.' using errcode='22023';
    end;
  end if;
$validation$;
begin
  definition:=pg_get_functiondef('booking_api.save_booking_detail_fields(uuid,uuid,jsonb)'::regprocedure);
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'Review Booking detail save before validating shipment weight'; end if;
  execute replace(definition,anchor,validation||anchor);
end $$;
commit;
