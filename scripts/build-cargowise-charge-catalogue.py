#!/usr/bin/env python3
"""Turn a read-only CargoWise gateway snapshot into a reviewable charge catalogue.

The input is the AccChargeCode, AccGLHeader and GlbDepartment JSON snapshot.
This script never connects to a database or changes finance configuration.
"""

import argparse
import collections
import json
import re
from pathlib import Path


CATEGORIES = {
    "FRT": "freight", "ORG": "origin", "DST": "destination",
    "TRN": "haulage", "TBC": "haulage", "CLL": "customs",
    "BRK": "customs", "CDS": "customs", "CSH": "customs",
    "WOU": "warehouse", "WIN": "warehouse", "WAH": "warehouse",
    "WST": "storage", "INS": "insurance", "NJR": "other",
}
MODES = {"GE_Air": "air", "GE_Sea": "sea", "GE_Road": "road",
         "GE_Rail": "other", "GE_Post": "other", "GE_NonTransport": "other"}
DIRECTIONS = {"GE_Import": "import", "GE_Export": "export",
              "GE_Domestic": "other", "GE_NonDirectional": "other"}
MODULES = {"GE_InternationalFreight": "forwarding", "GE_CustomsBrokerage": "customs",
           "GE_LocalTransport": "transport", "GE_LineHaul": "transport",
           "GE_DepotCFS": "depot", "GE_Warehouse": "warehouse"}


def truth(value):
    return value is True or value == "true"


def account(gl, key):
    if not key:
        return None
    if key not in gl:
        raise ValueError(f"Missing CargoWise GL account {key}")
    return gl[key]["AG_AccountNum"]


def scope(filter_list, departments):
    tokens = [token.strip() for token in filter_list.split(",") if token.strip()]
    if "ALL" in tokens:
        return ([(direction, mode) for direction in
                 ("import", "export", "cross_trade", "other") for mode in
                 ("air", "sea", "road", "mix", "other")], ["all"])
    pairs = set()
    modules = set()
    for token in tokens:
        if token not in departments:
            raise ValueError(f"Unknown CargoWise department {token}")
        department = departments[token]
        modes = {value for flag, value in MODES.items() if truth(department[flag])} or {"other"}
        directions = {value for flag, value in DIRECTIONS.items() if truth(department[flag])} or {"other"}
        pairs.update((direction, mode) for direction in directions for mode in modes)
        modules.update(value for flag, value in MODULES.items() if truth(department[flag]))
        if token == "BRN":
            modules.add("overhead")
        elif token in ("SID", "SED"):
            modules.add("ships_agency")
        elif not any(truth(department[flag]) for flag in MODULES):
            modules.add("other")
    return sorted(pairs), sorted(modules)


def build(snapshot, tax_rates=()):
    gl = {row["AG_PK"]: row for row in snapshot["glRows"]}
    departments = {row["GE_Code"]: row for row in snapshot["depRows"]}
    taxes = {row["id"]: row for row in tax_rates}
    by_code = collections.defaultdict(list)
    for row in snapshot["chargeRows"]:
        code = row["AC_Code"].strip().upper()
        if not re.fullmatch(r"[A-Z0-9][A-Z0-9._-]{0,79}", code):
            raise ValueError(f"Invalid charge code {code!r}")
        by_code[code].append(row)
    entries = []
    for code, rows in sorted(by_code.items()):
        variants = []
        pairs = set()
        modules = set()
        reasons = set()
        for row in rows:
            matrix, variant_modules = scope(row["AC_DepartmentFilterList"], departments)
            pairs.update(map(tuple, matrix))
            modules.update(variant_modules)
            tax_id = row["AC_AT_GSTRate"] or None
            if tax_id and tax_id not in taxes:
                raise ValueError(f"Missing CargoWise tax-rate reference {tax_id}")
            variants.append({
                "sourceId": row["AC_PK"], "name": row["AC_Desc"].strip(),
                "active": truth(row["AC_IsActive"]), "chargeType": row["AC_ChargeType"],
                "chargeGroup": row["AC_ChargeGroup"],
                "chargeSubGroup": row["AC_ChargeSubGroup"],
                "departments": [t.strip() for t in row["AC_DepartmentFilterList"].split(",") if t.strip()],
                "rateCalculator": row["AC_RateCalculator"] or None,
                "goodsServiceType": row["AC_GoodsServiceType"] or None,
                "taxRateSourceId": tax_id,
                "taxRate": {key: taxes[tax_id][key] for key in ("code", "country", "type", "description")}
                           if tax_id else None,
                "inputTaxRecoverable": truth(row["AC_InputGSTVATRecoverable"]),
                "nominals": {
                    "revenueActual": account(gl, row["AC_AG_RevenueAccount"]),
                    "revenueAccrued": account(gl, row["AC_AG_WIPAccount"]),
                    "costActual": account(gl, row["AC_AG_CostAccount"]),
                    "costAccrued": account(gl, row["AC_AG_AccrualAccount"]),
                },
            })
        groups = {v["chargeGroup"] for v in variants}
        if len(groups) != 1:
            reasons.add("source_group_conflict")
        if len({v["name"] for v in variants}) != 1:
            reasons.add("source_name_conflict")
        if len({v["active"] for v in variants}) != 1:
            reasons.add("source_status_conflict")
        if len({v["chargeType"] for v in variants}) != 1:
            reasons.add("source_type_conflict")
        nominal_sets = {key: sorted({v["nominals"][key] for v in variants if v["nominals"][key]})
                        for key in ("revenueActual", "revenueAccrued", "costActual", "costAccrued")}
        if any(len({v["nominals"][key] for v in variants}) > 1 for key in nominal_sets):
            reasons.add("source_nominal_conflict")
        nominals = {key: values[0] if len(values) == 1 else None for key, values in nominal_sets.items()}
        if bool(nominals["costActual"]) != bool(nominals["costAccrued"]):
            reasons.add("incomplete_cost_pair")
        if bool(nominals["revenueActual"]) != bool(nominals["revenueAccrued"]):
            reasons.add("incomplete_revenue_pair")
        if nominals["revenueAccrued"] and nominals["revenueAccrued"] == nominals["costAccrued"]:
            reasons.add("cross_side_accrual_account")
        if not nominals["costActual"] and not nominals["revenueActual"]:
            reasons.add("no_posting_nominal")
        if any(v["chargeType"] in ("DSB", "NON") for v in variants):
            reasons.add("pass_through_or_nonposting_review")
        if any(number and not number[:1] == "1" for number in nominals.values()):
            reasons.add("non_job_nominal")
        if "overhead" in modules or groups == {"NJR"}:
            reasons.add("overhead_not_operational")
        if "all" in modules:
            modules.remove("all")
            modules.add("all_departments")
        category = CATEGORIES.get(next(iter(groups))) if len(groups) == 1 else "other"
        if category is None:
            raise ValueError(f"Unknown charge group for {code}: {groups}")
        cost = bool(nominals["costActual"])
        revenue = bool(nominals["revenueActual"])
        side = "both" if cost and revenue else "buy" if cost else "sell"
        entries.append({
            "code": code, "name": variants[0]["name"], "category": category,
            "side": side, "sourceActive": any(v["active"] for v in variants),
            "operational": "overhead_not_operational" not in reasons,
            "modules": sorted(modules), "nominals": nominals,
            "applicability": [{"recordKind": kind, "direction": direction, "mode": mode}
                              for kind in ("quote", "booking") for direction, mode in sorted(pairs)],
            "reviewReasons": sorted(reasons), "sourceVariants": variants,
        })
    return {"source": snapshot["source"], "retrievedAt": snapshot["retrievedAt"],
            "sourceRecordCount": len(snapshot["chargeRows"]), "codes": entries}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--tax-rates", type=Path, required=True)
    args = parser.parse_args()
    manifest = build(json.loads(args.snapshot.read_text()), json.loads(args.tax_rates.read_text()))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {len(manifest['codes'])} distinct codes from {manifest['sourceRecordCount']} source records to {args.output}")


if __name__ == "__main__":
    main()
