begin;

-- Imports emit the normal warehouse record signals. Re-check the watch owner's
-- current access at evaluation time so revocation takes effect immediately.
do $patch$
declare definition text; marker text;
begin
  definition := pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
  marker := E'      and watch_row."AIDexterWatch_StatusCode" = ''active''';
  if (length(definition) - length(replace(definition, marker, ''))) / length(marker) <> 1 then
    raise exception 'Review warehouse watch access guard before applying';
  end if;
  definition := replace(definition, marker, marker || $guard$
      and (watch_row."AIDexterWatch_CapabilityCode" <> 'warehouse' or exists (
        select 1 from public."cmp_Users" owner_user
        where owner_user."User_ID" = watch_row."AIDexterWatch_OwnerUserID"
          and owner_user."Company_ID" = watch_row."AIDexterWatch_CompanyID"
          and owner_user."User_AccessStatus" = 'active'
          and owner_user."Auth_User_ID" is not null
          and booking_api.has_permission(owner_user."Auth_User_ID", 'Warehouse.Read')
      ))$guard$);
  marker := 'if v_matches and (';
  if (length(definition) - length(replace(definition, marker, ''))) / length(marker) <> 1 then
    raise exception 'Review warehouse watch change evaluation before applying';
  end if;
  definition := replace(definition, marker, marker || $repeat$
        (watch."AIDexterWatch_CapabilityCode" = 'warehouse'
          and watch."AIDexterWatch_RuleJSON"->>'operator' = 'changed') or $repeat$);
  execute definition;
end $patch$;

commit;
