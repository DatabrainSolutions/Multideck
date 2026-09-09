-- The compatibility shipment label must never hide typed line safety flags.
-- Keep manually selected handling separate so a removed line does not leave
-- an automatically copied hazard flag behind. Existing history is not updated.
begin;

create function quote_api.cargo_handling_summary(facts jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare
  lines jsonb := quote_api.normalise_cargo_lines(facts->'cargoLines', false);
  manual text := coalesce(nullif(btrim(facts->>'cargoCharacteristics'), ''), nullif(btrim(facts->>'knownCargo'), ''), 'General cargo');
  labels text[] := '{}'; seen text[] := '{}'; token text; key text;
begin
  if exists(select 1 from jsonb_array_elements(lines) line where (line->>'isHazardous')::boolean) then
    labels := array_append(labels, 'Hazardous'); seen := array_append(seen, 'hazardous');
  end if;
  if exists(select 1 from jsonb_array_elements(lines) line where (line->>'isTemperatureControlled')::boolean) then
    labels := array_append(labels, 'Temperature controlled'); seen := array_append(seen, 'temperature controlled');
  end if;
  foreach token in array regexp_split_to_array(manual, '[;,|]') loop
    token := btrim(token); key := lower(token);
    if key <> '' and key not in ('general cargo', 'general merchandise') and not key = any(seen) then
      labels := array_append(labels, token); seen := array_append(seen, key);
    end if;
  end loop;
  return coalesce(nullif(array_to_string(labels, '; '), ''), 'General merchandise');
end $$;

alter function quote_api.save_quote(uuid, uuid, jsonb) rename to save_quote_before_cargo_safety_20260905;
create function quote_api.save_quote(caller_auth_user_id uuid, requested_quote_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare facts jsonb := payload->'shipmentFacts';
begin
  if facts ? 'cargoLines' then
    facts := jsonb_set(facts, '{cargoCharacteristics}', to_jsonb(coalesce(
      nullif(btrim(facts->>'cargoCharacteristics'), ''), nullif(btrim(facts->>'knownCargo'), ''), 'General cargo'
    )));
    facts := jsonb_set(facts, '{knownCargo}', to_jsonb(quote_api.cargo_handling_summary(facts)));
    payload := jsonb_set(payload, '{shipmentFacts}', facts);
  end if;
  return quote_api.save_quote_before_cargo_safety_20260905(caller_auth_user_id, requested_quote_id, payload);
end $$;

revoke all on function quote_api.cargo_handling_summary(jsonb) from public, anon, authenticated, service_role;
revoke all on function quote_api.save_quote_before_cargo_safety_20260905(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function quote_api.save_quote(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function quote_api.save_quote(uuid, uuid, jsonb) to service_role;

commit;
