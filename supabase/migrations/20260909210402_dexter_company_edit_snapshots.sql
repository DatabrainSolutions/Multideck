begin;
-- Full-replacement actions must be able to read every value they will retain.
do $patch$
declare definition text; marker text; replacement text; changes jsonb;
begin
  definition:=pg_get_functiondef('public.multideck_dexter_domain_customers(uuid,text,integer)'::regprocedure);
  changes:=jsonb_build_array(
    jsonb_build_array($old$'recordId', organisation."Org_id", 'recordType', 'company',$old$,
      $new$'recordId', organisation."Org_id", 'recordType', 'company',
        'sourceTable', 'Org_Master', 'editVersion', profile."CRMAccount_EditVersion",$new$),
    jsonb_build_array($old$'townCity', address."OrgAdd_TownCity", 'postcode', address."OrgAdd_PostZipCode",$old$,
      $new$'line2', address."OrgAdd_Line2", 'countyState', address."OrgAdd_CountyState",
        'email', address."OrgAdd_MainEmail", 'phone', address."OrgAdd_MainPhone",
        'townCity', address."OrgAdd_TownCity", 'postcode', address."OrgAdd_PostZipCode",
        'postZipCode', address."OrgAdd_PostZipCode", 'updatedAt', address."OrgAdd_UpdatedAt",$new$),
    jsonb_build_array($old$'weeklyHours', hours.values, 'upcomingOverrideCount', overrides.value$old$,
      $new$'weeklyHours', hours.values, 'upcomingOverrideCount', overrides.value,
        'openingOverrides', overrides.details$new$),
    jsonb_build_array($old$'dayOfWeek', hour."OrgAddHours_DayOfWeek", 'opensAt', hour."OrgAddHours_OpensAt", 'closesAt', hour."OrgAddHours_ClosesAt"$old$,
      $new$'dayOfWeek', hour."OrgAddHours_DayOfWeek", 'opensAt', hour."OrgAddHours_OpensAt", 'closesAt', hour."OrgAddHours_ClosesAt",
          'sortOrder', hour."OrgAddHours_SortOrder"$new$),
    jsonb_build_array($old$select count(*)::integer value from public."Org_AddressOpeningOverrides" override
        where override."OrgAddOverride_OrgAddID" = address."OrgAdd_ID" and override."OrgAddOverride_Date" >= current_date$old$,
      $new$select count(*) filter (where override."OrgAddOverride_Date" >= current_date)::integer value,
          coalesce(jsonb_agg(jsonb_build_object('date', override."OrgAddOverride_Date",
            'isClosed', override."OrgAddOverride_IsClosed", 'opensAt', override."OrgAddOverride_OpensAt",
            'closesAt', override."OrgAddOverride_ClosesAt", 'note', override."OrgAddOverride_Note")
            order by override."OrgAddOverride_Date", override."OrgAddOverride_OpensAt"), '[]'::jsonb) details
        from public."Org_AddressOpeningOverrides" override
        where override."OrgAddOverride_OrgAddID" = address."OrgAdd_ID"$new$)
  );
  for marker,replacement in select value->>0,value->>1 from jsonb_array_elements(changes) loop
    if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then
      raise exception 'Review current company snapshot before applying: %',left(marker,70);
    end if;
    definition:=replace(definition,marker,replacement);
  end loop;
  execute definition;
end $patch$;
commit;
