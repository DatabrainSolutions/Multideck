begin;

-- Preserve the evaluator's other capability adapters while closing the deal
-- access boundary and evaluating every distinct stage change independently.
do $patch$
declare definition text; marker text;
begin
  definition := pg_get_functiondef('public._multideck_dexter_evaluate_watch_signal()'::regprocedure);
  marker := E'      and watch_row."AIDexterWatch_StatusCode" = ''active''';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker) <> 1 then
    raise exception 'Review deal watch access guard before applying';
  end if;
  definition := replace(definition,marker,marker || $guard$
      and (watch_row."AIDexterWatch_CapabilityCode" <> 'deals' or (
        public._multideck_crm_deal_is_operator_visible(
          new."AIDexterWatchSignal_SourceID", watch_row."AIDexterWatch_CompanyID")
        and exists (
          select 1 from public."cmp_Users" owner_user
          where owner_user."User_ID" = watch_row."AIDexterWatch_OwnerUserID"
            and owner_user."Company_ID" = watch_row."AIDexterWatch_CompanyID"
            and owner_user."User_AccessStatus" = 'active'
            and public._multideck_crm_has_permission(owner_user."User_ID", 'CRM.Read')
        )
      ))$guard$);
  marker := 'if v_matches and (';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker) <> 1 then
    raise exception 'Review deal watch repeat guard before applying';
  end if;
  definition := replace(definition,marker,marker || $repeat$
        (watch."AIDexterWatch_CapabilityCode" = 'deals'
          and watch."AIDexterWatch_RuleJSON"->>'operator' = 'changed') or $repeat$);
  execute definition;
end $patch$;

commit;
