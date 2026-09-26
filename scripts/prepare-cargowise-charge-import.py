#!/usr/bin/env python3
"""Prepare a tenant-scoped, transactional CargoWise charge import SQL file.

The SQL creates catalogue codes only. A code becomes active only when its exact
CargoWise actual/accrued account pairs already exist in approved Multideck
nominal groups for the chosen legal entity. It never creates or changes nominals.
"""

import argparse
import json
import uuid
from pathlib import Path


BLOCKING_REASONS = {
    "source_group_conflict", "source_name_conflict", "source_nominal_conflict", "source_status_conflict",
    "incomplete_cost_pair", "incomplete_revenue_pair", "no_posting_nominal",
    "non_job_nominal", "overhead_not_operational", "pass_through_or_nonposting_review",
    "cross_side_accrual_account",
}


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def prepare(manifest, actor, entity, entity_name, apply):
    if len(manifest["codes"]) != len({code["code"] for code in manifest["codes"]}):
        raise ValueError("Duplicate catalogue code in manifest")
    payload = []
    for code in manifest["codes"]:
        payload.append({
            "code": code["code"], "name": code["name"],
            "category": code["category"], "side": code["side"],
            "candidate": code["sourceActive"] and code["operational"] and
                         not bool(BLOCKING_REASONS.intersection(code["reviewReasons"])),
            "applicability": code["applicability"], "nominals": code["nominals"],
            "source": {
                "system": "CargoWise", "retrievedAt": manifest["retrievedAt"],
                "modules": code["modules"], "reviewReasons": code["reviewReasons"],
                "chargeGroups": sorted({v["chargeGroup"] for v in code["sourceVariants"]}),
                "departments": sorted({d for v in code["sourceVariants"] for d in v["departments"]}),
                "sourceIds": [v["sourceId"] for v in code["sourceVariants"]],
                "sourceActive": code["sourceActive"],
                "sourceNominals": code["nominals"],
                "sourceSettings": [{key: v[key] for key in
                    ("sourceId", "active", "chargeType", "rateCalculator", "taxRate",
                     "inputTaxRecoverable")} for v in code["sourceVariants"]],
            },
        })
    data = json.dumps(payload, separators=(",", ":"))
    if "$cargowise_data$" in data:
        raise ValueError("Unsafe SQL delimiter in manifest")
    sql = f"""-- CargoWise charge catalogue import, {manifest['retrievedAt']} gateway snapshot.
-- Generated for one legal entity. Inspect the source manifest and use the
-- preview transaction first. All existing code collisions abort the import.
-- Only RATE_ChargeCodes, RATE_ChargeApplicability, RATE_ChargeCatalogueAudit,
-- and mappings for newly created codes are written. Existing finance records
-- and nominal definitions are never updated.
begin;

do $cargowise_import$
declare
  v_actor uuid := {literal(str(actor))}::uuid;
  v_entity uuid := {literal(str(entity))}::uuid;
  v_entity_name text := {literal(entity_name)};
  v_payload jsonb := $cargowise_data${data}$cargowise_data$::jsonb;
  v_entry jsonb;
  v_result jsonb;
  v_charge uuid;
  v_cost_group uuid;
  v_revenue_group uuid;
  v_cost_actual text;
  v_cost_accrued text;
  v_revenue_actual text;
  v_revenue_accrued text;
  v_candidate boolean;
  v_before jsonb;
  v_created integer := 0;
  v_activated integer := 0;
  v_held integer := 0;
begin
  if not exists (select 1 from public."cmp_LegalEntities"
      where "LegalEntity_ID"=v_entity and "LegalEntity_Name"=v_entity_name
      and "LegalEntity_IsActive") then
    raise exception 'Target legal entity identity mismatch or inactive.' using errcode='22023';
  end if;
  if (select count(*) from public."cmp_LegalEntities" sibling
      where sibling."Company_ID"=(select target."Company_ID" from public."cmp_LegalEntities" target
        where target."LegalEntity_ID"=v_entity)
        and sibling."LegalEntity_IsActive")<>1 then
    raise exception 'Review charge mappings for every legal entity before importing shared active codes.' using errcode='22023';
  end if;
  perform public._multideck_journal_access(v_actor,v_entity,'Finance.Configuration.Manage');
  if jsonb_array_length(v_payload) <> {len(payload)} then
    raise exception 'CargoWise charge manifest count changed.' using errcode='22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_payload) e
      left join public."sys_RateChargeCategories" c on c."RATECCAT_Code"=e->>'category'
      where c."RATECCAT_Code" is null) then
    raise exception 'A CargoWise category is missing from the target tenant.' using errcode='22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_payload) e
      join public."RATE_ChargeCodes" c on upper(c."RATECharge_Code")=e->>'code') then
    raise exception 'An imported code already exists. Review the collision before importing.' using errcode='22023';
  end if;
  for v_entry in select value from jsonb_array_elements(v_payload) loop
    v_cost_actual := v_entry->'nominals'->>'costActual';
    v_cost_accrued := v_entry->'nominals'->>'costAccrued';
    v_revenue_actual := v_entry->'nominals'->>'revenueActual';
    v_revenue_accrued := v_entry->'nominals'->>'revenueAccrued';
    v_cost_group := null;
    v_revenue_group := null;
    if v_cost_actual is not null and v_cost_accrued is not null then
      select g.id into v_cost_group from public."FIN_NominalGroups" g
        join public."FIN_NominalGroupMembers" actual on actual.group_id=g.id and actual.role='actual'
        join public."FIN_NominalAccounts" a on a."FINNom_ID"=actual.account_id
        join public."FIN_NominalGroupMembers" accrued on accrued.group_id=g.id and accrued.role='accrued'
        join public."FIN_NominalAccounts" b on b."FINNom_ID"=accrued.account_id
        where g.legal_entity_id=v_entity and g.kind='cost'
          and a."FINNom_Code"=v_cost_actual and b."FINNom_Code"=v_cost_accrued
          and a."FINNom_LegalEntityID"=v_entity and b."FINNom_LegalEntityID"=v_entity;
    end if;
    if v_revenue_actual is not null and v_revenue_accrued is not null then
      select g.id into v_revenue_group from public."FIN_NominalGroups" g
        join public."FIN_NominalGroupMembers" actual on actual.group_id=g.id and actual.role='actual'
        join public."FIN_NominalAccounts" a on a."FINNom_ID"=actual.account_id
        join public."FIN_NominalGroupMembers" accrued on accrued.group_id=g.id and accrued.role='accrued'
        join public."FIN_NominalAccounts" b on b."FINNom_ID"=accrued.account_id
        where g.legal_entity_id=v_entity and g.kind='revenue'
          and a."FINNom_Code"=v_revenue_actual and b."FINNom_Code"=v_revenue_accrued
          and a."FINNom_LegalEntityID"=v_entity and b."FINNom_LegalEntityID"=v_entity;
    end if;
    v_candidate := (v_entry->>'candidate')::boolean
      and (v_cost_actual is null or v_cost_group is not null)
      and (v_revenue_actual is null or v_revenue_group is not null)
      and (v_cost_group is not null or v_revenue_group is not null);
    if v_candidate then
      if v_cost_group is not null then perform public._multideck_validate_nominal_group(v_entity,v_cost_group,'cost'); end if;
      if v_revenue_group is not null then perform public._multideck_validate_nominal_group(v_entity,v_revenue_group,'revenue'); end if;
    end if;
    v_result := public.multideck_manage_charge_catalogue(v_actor,v_entity,jsonb_build_object(
      'code',v_entry->>'code','name',v_entry->>'name','category',v_entry->>'category',
      'side',v_entry->>'side','active',v_candidate,'version',0,
      'applicability',v_entry->'applicability'));
    v_charge := (v_result->>'RATECharge_ID')::uuid;
    -- Store the original module and department evidence alongside the catalogue
    -- code, with an additional before/after audit entry for the metadata edit.
    select to_jsonb(c) into v_before from public."RATE_ChargeCodes" c where c."RATECharge_ID"=v_charge;
    update public."RATE_ChargeCodes" set
      "RATECharge_MetadataJSON"=jsonb_build_object('cargowise',v_entry->'source')
      where "RATECharge_ID"=v_charge;
    insert into public."RATE_ChargeCatalogueAudit"
      (charge_id,actor_id,legal_entity_id,before_snapshot,after_snapshot)
      select v_charge,v_actor,v_entity,v_before,to_jsonb(c)
      from public."RATE_ChargeCodes" c where c."RATECharge_ID"=v_charge;
    if v_candidate then
      perform public.multideck_finance_nominal_structure(v_actor,v_entity,'map_charge',jsonb_build_object(
        'chargeId',v_charge,'costGroupId',v_cost_group,'revenueGroupId',v_revenue_group,'version',0));
      v_activated := v_activated+1;
    else
      v_held := v_held+1;
    end if;
    v_created := v_created+1;
  end loop;
  raise notice 'CargoWise import: % codes created, % active with exact nominal mappings, % inactive for review.',
    v_created,v_activated,v_held;
end $cargowise_import$;

{'commit;' if apply else 'rollback; -- Preview only: no data retained.'}
"""
    return sql


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--actor-id", required=True, type=uuid.UUID)
    parser.add_argument("--entity-id", required=True, type=uuid.UUID)
    parser.add_argument("--entity-name", required=True)
    parser.add_argument("--apply", action="store_true", help="Generate committing SQL; default rolls back")
    args = parser.parse_args()
    sql = prepare(json.loads(args.manifest.read_text()), args.actor_id, args.entity_id,
                  args.entity_name, args.apply)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(sql)
    print(f"Wrote {'committing' if args.apply else 'preview'} SQL to {args.output}")


if __name__ == "__main__":
    main()
