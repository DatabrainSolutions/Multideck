begin;

-- Exact-target, read-only evidence adapter. No independent Dexter arithmetic.
create function public.multideck_dexter_domain_customs_calculations(
  p_company_id uuid, p_search text, p_take integer
) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(entry.payload order by entry.created_at desc, entry.id desc), '[]'::jsonb)
  from (
    select audit.id, audit.created_at, jsonb_build_object(
      'recordId', audit.id, 'declarationId', audit.declaration_id,
      'sourceType', case when declaration."CUST_JobID" is null then 'standalone' else 'job_related' end,
      'direction', 'import', 'kind', audit.kind, 'createdAt', audit.created_at,
      'actorAuthId', audit.actor_auth_id, 'parentCalculationId', audit.parent_id,
      'outOfDate', audit.draft_snapshot is distinct from declaration."CUST_GenericPayloadJSON",
      'result', audit.evidence->'result', 'itemId', audit.evidence->'itemId',
      'original', audit.evidence->'original', 'replacement', audit.evidence->'replacement',
      'reason', audit.evidence->'reason', 'sourceKind', audit.evidence->'sourceKind',
      'submissionFieldsChanged', false
    ) as payload
    from public."Customs_CalculationAudit" audit
    join public."Customs_Declarations" declaration on declaration."CUST_id" = audit.declaration_id
    where audit.declaration_id::text = btrim(coalesce(p_search, ''))
      and public.customs_declaration_current_user_authorised(audit.declaration_id, false)
      and exists (select 1 from public."cmp_Users" actor
        where actor."Auth_User_ID" = auth.uid() and actor."Company_ID" = p_company_id)
    order by audit.created_at desc, audit.id desc
    limit greatest(1, least(coalesce(p_take, 10), 25))
  ) entry;
$$;
revoke all on function public.multideck_dexter_domain_customs_calculations(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.multideck_dexter_domain_customs_calculations(uuid,text,integer) to service_role;

insert into public."sys_AIDexterDataDomains" (
  "AIDexterDomain_Code", "AIDexterDomain_Name", "AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction", "AIDexterDomain_SortOrder", "AIDexterDomain_IsActive",
  "AIDexterDomain_RequiredPermissionsJSON", "AIDexterDomain_UpdatedAt"
) values (
  'customs_calculations', 'Customs calculation evidence',
  'Recorded duty/VAT estimates and audited overrides. Search must be the exact authorised declaration UUID obtained from customs_declarations. Includes source record IDs, saved workings, rule version and stale state. This reads evidence only: no calculation, override, filing or watch action is provided by this domain.',
  'multideck_dexter_domain_customs_calculations', 26, true, '["Customs.Read"]'::jsonb, now()
) on conflict ("AIDexterDomain_Code") do update set
  "AIDexterDomain_Name" = excluded."AIDexterDomain_Name",
  "AIDexterDomain_Description" = excluded."AIDexterDomain_Description",
  "AIDexterDomain_QueryFunction" = excluded."AIDexterDomain_QueryFunction",
  "AIDexterDomain_RequiredPermissionsJSON" = excluded."AIDexterDomain_RequiredPermissionsJSON",
  "AIDexterDomain_IsActive" = true, "AIDexterDomain_UpdatedAt" = now();

commit;
