"""Summarise the retained, sanitised browser measurements (standard library only).

Usage: python3 docs/performance/summarise-benchmarks.py /absolute/path/to/evidence
Does not run browser tests, change application state, or estimate missing samples.
"""
import collections
import csv
import gzip
import hashlib
import json
import math
from pathlib import Path
import statistics
import sys

EVIDENCE = Path(sys.argv[1]).resolve()
OUTPUT = Path(__file__).resolve().parent
SCENARIOS = [
    ("quote-customer-autofill", "Quotes", "Customer autofill", "usableMs"),
    ("quote-supplier-autofill", "Quotes", "Supplier autofill", "usableMs"),
    ("quote-edit-save", "Quotes", "Edit through Saved confirmation", "savedMs"),
    ("home-cold-load", "Home / shell", "Cold load", "usableMs"),
    ("bookings-cold-load", "Bookings", "Register cold load", "usableMs"),
    ("crm-companies-cold-load", "CRM", "Company directory cold load", "usableMs"),
    ("inbox-cold-load", "Inbox", "Mailbox list cold load", "usableMs"),
    ("calendar-cold-load", "Calendar", "Week view cold load", "usableMs"),
    ("calendar-meeting-composer", "Calendar", "Open meeting composer", "usableMs"),
    ("warehouse-inventory-cold-load", "Warehouse", "Inventory cold load", "usableMs"),
    ("documents-with-previews-cold-load", "Documents", "Cold load including previews", "usableMs"),
    ("customs-export-register-cold-load", "Customs", "Export register cold load", "usableMs"),
    ("rates-overview-cold-load", "Rates", "Empty library cold load", "usableMs"),
    ("finance-currencies-cold-load", "Finance", "Currencies and FX cold load", "usableMs"),
    ("dexter-home-cold-load", "Dexter", "Home and watch summary cold load", "usableMs"),
    ("admin-activity-cold-load", "Admin", "Activity cold load", "usableMs"),
    ("profile-settings-cold-load", "Settings", "Profile including images cold load", "usableMs"),
    ("public-booking-availability-cold-load", "Public booking", "Brand and availability cold load", "usableMs"),
    ("quotes-register-cold-load", "Quotes", "Register cold load", "usableMs"),
    ("quote-details-cold-load-fresh-tab", "Quotes", "Details and directory cold load", "usableMs"),
]
BACKGROUND = {"/functions/v1/admin-audit/presence", "/rest/v1/Comm_Notifications"}


def read(name):
    return [json.loads(line) for line in (EVIDENCE / name).read_text().splitlines() if line]


def stats(values):
    values = sorted(v for v in values if v is not None)
    return {"median": round(statistics.median(values), 3),
            "p95": round(values[math.ceil(len(values) * .95) - 1], 3)} if values else None


def metrics(record):
    network = record["network"]
    api = [n for n in network if n["kind"] == "api"]
    bg = [n for n in api if n["endpoint"] in BACKGROUND]
    foreground = [n for n in api if n["endpoint"] not in BACKGROUND]
    return {
        **{k: record.get(k) for k in ["usableMs", "savedMs", "apiRequests", "duplicateApiRequests", "apiBytes", "assetRequests", "preflightRequests"]},
        "foregroundApiRequests": len(foreground),
        "foregroundApiBytes": sum(n["bytes"] for n in foreground),
        "backgroundApiRequests": len(bg),
        "backgroundApiBytes": sum(n["bytes"] for n in bg),
        "assetBytes": sum(n["bytes"] for n in network if n["kind"] == "asset"),
        "preflightBytes": sum(n["bytes"] for n in network if n["kind"] == "preflight"),
        "totalBytes": sum(n["bytes"] for n in network),
        "unfinishedRequests": sum(not n["failed"] and "durationMs" not in n for n in network),
        "failedRequests": sum(n["failed"] or (n["status"] or 0) >= 400 for n in network),
        "longTaskCount": len(record.get("longTasks", [])),
        "longTaskMs": sum(n["duration"] for n in record.get("longTasks", [])),
        "frameIntervalP95Ms": stats(record.get("frames", []))["p95"] if record.get("frames") else None,
    }


raw = {"before": read("baseline-browser.jsonl"), "after": read("after-browser-matched.jsonl")}
summary, selected = {}, []
for scenario, page, action, primary in SCENARIOS:
    summary[scenario] = {"page": page, "scenario": action, "primaryMetric": primary}
    for phase, records in raw.items():
        rows = [r for r in records if r.get("scenario") == scenario and not r.get("warmup") and not r.get("error")]
        assert len(rows) == 20, (phase, scenario, len(rows))
        assert sorted(r["iteration"] for r in rows) == list(range(1, 21)), (phase, scenario)
        assert not any(r["truncated"] for r in rows), (phase, scenario, "truncated")
        values = [metrics(r) for r in rows]
        summary[scenario][phase] = {key: stats([r[key] for r in values]) for key in values[0]}
        for row in rows:
            # Network signatures hash full URLs; query strings, credentials and payloads were never stored.
            cleaned = json.loads(json.dumps(row))
            cleaned["phase"] = phase
            for request in cleaned["network"]:
                if request["endpoint"].startswith("/book/"):
                    request["endpoint"] = "/book/:host/:link"
            selected.append(cleaned)

with gzip.open(EVIDENCE / "browser-evidence.jsonl.gz", "wt") as f:
    for record in selected:
        f.write(json.dumps(record, separators=(",", ":")) + "\n")

(OUTPUT / "2026-09-03-benchmark-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
csv_rows = []
for scenario, page, action, primary in SCENARIOS:
    result = summary[scenario]
    row = {"page": page, "scenario": action, "scenario_id": scenario, "repetitions_per_build": 20,
           "primary_metric": primary}
    for phase in ["before", "after"]:
        for metric, aggregate in result[phase].items():
            for quantile in ["median", "p95"]:
                row[f"{phase}_{metric}_{quantile}"] = aggregate[quantile] if aggregate else ""
    before = result["before"][primary]["median"]
    after = result["after"][primary]["median"]
    row["primary_median_improvement_percent"] = round(100 * (before - after) / before, 2)
    csv_rows.append(row)
with (OUTPUT / "2026-09-03-benchmarks.csv").open("w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=list(csv_rows[0]))
    writer.writeheader()
    writer.writerows(csv_rows)

timings = ["| Page / feature | Scenario | Before median / p95 | After median / p95 | Median change |",
           "|---|---|---:|---:|---:|"]
traffic = ["| Page / feature | Scenario | API calls | Duplicates | API bytes | Asset bytes |",
           "|---|---|---:|---:|---:|---:|"]
separate = ["| Page / feature | Scenario | Preflight calls | Background API calls | Long-task ms, median | Frame interval p95, median |",
            "|---|---|---:|---:|---:|---:|"]
for scenario, page, action, primary in SCENARIOS:
    result = summary[scenario]
    b, a = result["before"], result["after"]
    change = 100 * (b[primary]["median"] - a[primary]["median"]) / b[primary]["median"]
    timings.append(f'| {page} | {action} | {b[primary]["median"]:.1f} / {b[primary]["p95"]:.1f} ms | {a[primary]["median"]:.1f} / {a[primary]["p95"]:.1f} ms | {abs(change):.1f}% {"faster" if change >= 0 else "slower"} |')
    pairs = [f'{b[m]["median"]:,.0f} → {a[m]["median"]:,.0f}' for m in ["apiRequests", "duplicateApiRequests", "apiBytes", "assetBytes"]]
    traffic.append(f'| {page} | {action} | ' + " | ".join(pairs) + " |")
    pairs = [f'{b[m]["median"]:,.1f} → {a[m]["median"]:,.1f}' for m in ["preflightRequests", "backgroundApiRequests", "longTaskMs", "frameIntervalP95Ms"]]
    separate.append(f'| {page} | {action} | ' + " | ".join(pairs) + " |")

(EVIDENCE / "timing-table.md").write_text("\n".join(timings) + "\n")
(EVIDENCE / "traffic-table.md").write_text("\n".join(traffic) + "\n")
(EVIDENCE / "separate-metrics-table.md").write_text("\n".join(separate) + "\n")
totals = {phase: {"samples": len([r for r in selected if r["phase"] == phase]),
                  "unfinishedRequests": sum(metrics(r)["unfinishedRequests"] for r in selected if r["phase"] == phase),
                  "failedRequests": sum(metrics(r)["failedRequests"] for r in selected if r["phase"] == phase)}
          for phase in ["before", "after"]}
(EVIDENCE / "measurement-validation.json").write_text(json.dumps(totals, indent=2) + "\n")
print(json.dumps(totals, indent=2))
print("Wrote summary CSV, JSON, Markdown tables and 800 sanitised browser records.")
