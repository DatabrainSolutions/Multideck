-- Repair the existing handover without changing actor, tenant or grant rules.
do $fix$
declare
  definition text := pg_get_functiondef('booking_api.send_to_customs(uuid,uuid,uuid)'::regprocedure);
  old_target text := 'on conflict (declaration_id, user_id) do update';
  new_target text := 'on conflict on constraint customs_declaration_grants_pkey do update';
begin
  if (length(definition) - length(replace(definition, old_target, ''))) / length(old_target) <> 3 then
    raise exception 'Unexpected Customs handoff definition; review before applying.';
  end if;
  execute replace(definition, old_target, new_target);
end;
$fix$;

insert into public."sys_CommLinkTypes" ("CommLinkType_Code","CommLinkType_Name","CommLinkType_Description","CommLinkType_SortOrder","CommLinkType_IsActive")
values ('customs_handoff','Customs handoff','Booking handover to an internal Customs declaration.',81,true)
on conflict ("CommLinkType_Code") do nothing;
