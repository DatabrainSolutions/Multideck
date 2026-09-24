import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
const bin = process.env.PG_TEST_BIN || "/opt/homebrew/opt/postgresql@17/bin";
const migration = readFileSync(
  new URL(
    "../migrations/20260915154425_accounting_party_lifecycle.sql",
    import.meta.url,
  ),
  "utf8",
);
const baseline = readFileSync(
  new URL("../baseline/public-schema.sql", import.meta.url),
  "utf8",
);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const quote = (v) => `'${v.replaceAll("'", "''")}'`;
const table = (name) => {
  const match = new RegExp(
    `create table(?: if not exists)? (?:"public"|public)\\."${name}"\\s*\\(`,
    "i",
  ).exec(baseline);
  assert.ok(match, name);
  const i = match.index;
  return baseline.slice(i, baseline.indexOf("\n);", i) + 3);
};
test("account lifecycle: atomic intent, scope, leases, readback evidence, retry and Dexter signals", async () => {
  assert.ok(
    baseline.includes(migration.trim()),
    "Provisioning snapshot must contain the exact tested migration",
  );
  const dir = mkdtempSync(join(tmpdir(), "party-lifecycle-"));
  let started = false;
  const run = (cmd, args, input) => {
    const r = spawnSync(join(bin, cmd), args, {
      input,
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });
    assert.equal(r.status, 0, `${cmd}\n${r.stderr}\n${r.stdout}`);
    return r.stdout.trim();
  };
  const args = [
    "-X",
    "-qAt",
    "-h",
    dir,
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ];
  const sql = (input) => run("psql", args, input);
  const denied = (input) => {
    const r = spawnSync(join(bin, "psql"), args, { input, encoding: "utf8" });
    assert.notEqual(r.status, 0, r.stdout);
    assert.match(r.stderr, /permission denied/);
  };
  try {
    run("initdb", [
      "-D",
      join(dir, "data"),
      "-A",
      "trust",
      "-U",
      "postgres",
      "--no-locale",
      "--no-sync",
      "-E",
      "UTF8",
    ]);
    run("pg_ctl", [
      "-D",
      join(dir, "data"),
      "-l",
      join(dir, "log"),
      "-o",
      `-k ${dir} -c listen_addresses=''`,
      "-w",
      "start",
    ]);
    started = true;
    sql(
      `create role anon;create role authenticated;create role service_role bypassrls;
   create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);
   create table public."cmp_LegalEntities"("LegalEntity_ID" uuid primary key,"Company_ID" uuid,"LegalEntity_IsActive" boolean);
   ${
        [
          "Org_Master",
          "Org_Types",
          "Org_Master_Type",
          "CRM_AccountProfiles",
          "Org_Addresses",
          "Org_AddressTypes",
          "ACCI_Connections",
          "ACCI_PartyMappings",
          "ACCI_SyncRuns",
          "ACCI_SyncEvents",
        ].map(table).join("\n")
      }
   create table public."CRM_AccountOperationalProfiles"("CRMAccountOps_OrgID" uuid,"CRMAccountOps_InvoicePreferencesJSON" jsonb);
   alter table public."Org_Master" add primary key("Org_id");
   alter table public."ACCI_Connections" add primary key("ACCIC_ID");
   alter table public."ACCI_PartyMappings" add unique("ACCIPM_ConnectionID","ACCIPM_OrgID","ACCIPM_PartyType"),add unique("ACCIPM_ConnectionID","ACCIPM_ProviderPartyID","ACCIPM_PartyType");
   grant all on all tables in schema public to service_role;
   create table public."AI_DexterWatches"("AIDexterWatch_CompanyID" uuid,"AIDexterWatch_CapabilityCode" text,"AIDexterWatch_StatusCode" text,"AIDexterWatch_TargetID" uuid);
   create table public."AI_DexterWatchSignals"("AIDexterWatchSignal_CompanyID" uuid,"AIDexterWatchSignal_CapabilityCode" text,"AIDexterWatchSignal_SourceTable" text,"AIDexterWatchSignal_SourceID" uuid,"AIDexterWatchSignal_OldJSON" jsonb,"AIDexterWatchSignal_NewJSON" jsonb);
   ${table("sys_AIDexterDataDomains")}
   ${table("sys_AIDexterWatchCapabilities")}
   create function public.multideck_dexter_domain_finance(uuid,text,integer) returns jsonb language sql as $$select '[]'::jsonb$$;
  `,
    );
    sql(
      readFileSync(
        new URL(
          "../migrations/20260902113000_provider_party_bulk_sync.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    sql(migration);
    for (const role of ["anon", "authenticated"]) {
      denied(`set role ${role};select * from public."ACCI_PartySyncQueue";`);
      denied(
        `set role ${role};select public.multideck_accounting_claim_parties();`,
      );
      denied(
        `set role ${role};select public.multideck_accounting_enqueue_parties(null);`,
      );
      denied(
        `set role ${role};select public.multideck_accounting_party_health('${
          id(10)
        }');`,
      );
      denied(
        `set role ${role};select public.multideck_accounting_worker_secret();`,
      );
      denied(
        `set role ${role};select public.multideck_dexter_domain_finance('${
          id(1)
        }',null,10);`,
      );
    }
    sql(
      `insert into public."cmp_LegalEntities" values('${id(1)}','${
        id(100)
      }',true),('${id(2)}','${id(200)}',true),('${id(3)}','${id(100)}',false);
   insert into public."ACCI_Connections"("ACCIC_ID","ACCIC_ProviderCode","ACCIC_Name","ACCIC_AuthType","ACCIC_LegalEntityID","ACCIC_StatusCode") values
   ('${id(10)}','erpnext','ERP','api_token','${id(1)}','active'),('${
        id(20)
      }','erpnext','Foreign','api_token','${id(2)}','active'),('${
        id(30)
      }','erpnext','Inactive','api_token','${id(3)}','active'),('${
        id(40)
      }','sage_50','Sage','local_agent','${id(1)}','draft');
   insert into public."Org_Types"("OrgType_ID","OrgType_Name") values('${
        id(501)
      }','Customer'),('${id(502)}','Supplier');
   insert into public."Org_Master"("Org_id","Org_Name","Org_BaseCurrency","Org_AccCode") values('${
        id(1000)
      }','Acme Freight','${id(999)}','ACME');
   insert into public."Org_Master_Type"("Org_ID","OrgType_ID") values('${
        id(1000)
      }','${id(501)}'),('${id(1000)}','${id(502)}');
   insert into public."CRM_AccountProfiles"("CRMAccount_OrgID","CRMAccount_CompanyID") values('${
        id(1000)
      }','${id(100)}');`,
    );
    assert.equal(sql('select count(*) from public."ACCI_PartySyncQueue"'), "2");
    assert.equal(
      sql(
        'select count(*) from public."ACCI_PartySyncQueue" where connection_id<>\'' +
          id(10) + "'",
      ),
      "0",
    );
    // CRM rollback must roll back both record and sync intent.
    sql(
      `begin;update public."Org_Master" set "Org_Name"='Rolled back' where "Org_id"='${
        id(1000)
      }';rollback;`,
    );
    assert.equal(
      sql(
        `select "Org_Name" from public."Org_Master" where "Org_id"='${
          id(1000)
        }'`,
      ),
      "Acme Freight",
    );
    const claim = () =>
      JSON.parse(
        sql(
          `set role service_role;select coalesce(jsonb_agg(q),'[]') from public.multideck_accounting_claim_parties(1) q;`,
        ),
      )[0];
    let job = claim();
    assert.ok(job);
    const finish = (j, result, token = j.lease_token) =>
      sql(
        `set role service_role;select public.multideck_accounting_finish_party('${j.id}','${token}',${j.revision},${
          quote(JSON.stringify(result))
        }::jsonb);`,
      );
    const result = {
      status: "synced",
      providerId: "ERP-ACME",
      providerName: "Acme Freight",
      verifiedPayload: { party: { customer_name: "Acme Freight" } },
      message: "Verified account",
      evidence: { scope: "party_master" },
    };
    assert.equal(finish(job, result, id(9999)), "f");
    sql(
      `update public."Org_Master" set "Org_Name"='Acme Updated' where "Org_id"='${
        id(1000)
      }';`,
    );
    assert.equal(finish(job, result), "f", "Old revision cannot turn green");
    assert.equal(sql('select count(*) from public."ACCI_PartyMappings"'), "0");
    sql(
      `insert into public."AI_DexterWatches" values('${
        id(100)
      }','finance','active','${id(10)}'),('${
        id(200)
      }','finance','active',null);`,
    );
    job = claim();
    assert.equal(finish(job, result), "t");
    // A repeated exact mapping upsert is allowed; overlapping combined roles
    // are rejected at the database boundary, including legacy/manual writers.
    sql(`set role service_role;insert into public."ACCI_PartyMappings"("ACCIPM_ConnectionID","ACCIPM_OrgID","ACCIPM_PartyType","ACCIPM_ProviderPartyID")
      select "ACCIPM_ConnectionID","ACCIPM_OrgID","ACCIPM_PartyType","ACCIPM_ProviderPartyID" from public."ACCI_PartyMappings"
      on conflict("ACCIPM_ConnectionID","ACCIPM_OrgID","ACCIPM_PartyType") do update set "ACCIPM_ProviderPartyID"=excluded."ACCIPM_ProviderPartyID";`);
    const conflicting = spawnSync(join(bin,"psql"),args,{encoding:"utf8",input:`set role service_role;
      insert into public."ACCI_PartyMappings"("ACCIPM_ConnectionID","ACCIPM_OrgID","ACCIPM_PartyType","ACCIPM_ProviderPartyID")
      values('${id(10)}','${id(1000)}','both','ERP-ACME');`});
    assert.notEqual(conflicting.status,0);
    assert.match(conflicting.stderr,/Conflicting active customer/);

    assert.equal(
      finish(job, result),
      "f",
      "Duplicate finish emits no duplicate audit/watch",
    );
    assert.equal(
      sql('select count(*) from public."AI_DexterWatchSignals"'),
      "1",
    );
    assert.equal(
      sql(
        `select count(*) from public."AI_DexterWatchSignals" where "AIDexterWatchSignal_CompanyID"='${
          id(200)
        }'`,
      ),
      "0",
    );
    const finance = JSON.parse(
      sql(
        `set role service_role;select public.multideck_dexter_domain_finance('${
          id(100)
        }',null,10);`,
      ),
    );
    assert.equal(finance.length, 1);
    assert.equal(finance[0].accountResults[0].organisationId, id(1000));
    assert.deepEqual(
      JSON.parse(
        sql(
          `set role service_role;select public.multideck_dexter_domain_finance('${
            id(200)
          }',null,10);`,
        ),
      ),
      [],
    );
    // Pausing watches suppresses events; resuming restores them.
    sql(
      `update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='paused' where "AIDexterWatch_CompanyID"='${
        id(100)
      }';`,
    );
    job = claim();
    assert.equal(
      finish(job, { status: "blocked", message: "Missing defaults" }),
      "t",
    );
    assert.equal(
      sql('select count(*) from public."AI_DexterWatchSignals"'),
      "1",
    );
    assert.equal(
      sql(`select count(*) from public.multideck_accounting_claim_parties()`),
      "0",
      "Blocked requires reviewed retry",
    );
    sql(
      `update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active' where "AIDexterWatch_CompanyID"='${
        id(100)
      }';select public.multideck_accounting_recheck_parties('${id(10)}');`,
    );
    job = claim();
    assert.equal(
      finish(job, { status: "failed", message: "Provider unavailable" }),
      "t",
    );
    assert.equal(
      sql('select count(*) from public."AI_DexterWatchSignals"'),
      "2",
    );
    assert.equal(
      sql(
        `select (next_attempt_at>now())::text from public."ACCI_PartySyncQueue" where id='${job.id}'`,
      ),
      "true",
    );
    // Activating a later connection backfills existing parties, scoped to its entity.
    sql(
      `update public."ACCI_Connections" set "ACCIC_StatusCode"='active' where "ACCIC_ID"='${
        id(40)
      }';`,
    );
    assert.equal(
      sql(
        `select count(*) from public."ACCI_PartySyncQueue" where connection_id='${
          id(40)
        }'`,
      ),
      "2",
    );
    // Independent concurrent claims must not acquire the same job.
    const concurrent = () =>
      new Promise((resolve, reject) => {
        const p = spawn(join(bin, "psql"), args);
        let out = "", err = "";
        p.stdout.on("data", (d) => out += d);
        p.stderr.on("data", (d) => err += d);
        p.on("close", (code) =>
          code === 0
            ? resolve(JSON.parse(out.trim()))
            : reject(new Error(err)));
        p.stdin.end(
          `set role service_role;select coalesce(jsonb_agg(id),'[]') from public.multideck_accounting_claim_parties(1);`,
        );
      });
    const claims = (await Promise.all(Array.from({ length: 6 }, concurrent)))
      .flat();
    assert.equal(new Set(claims).size, claims.length);
    assert.ok(claims.length > 0);
    sql(
      `update public."ACCI_PartySyncQueue" set lease_until=now()-interval '1 second' where status='processing';`,
    );
    job = claim();
    assert.ok(job, "Expired leases recover");
    // Daily catch-up must not reset a worker lease or starve its pending backlog.
    sql(`insert into public."ACCI_PartyWorkerSettings"(endpoint,enabled) values('https://tenant.supabase.co/functions/v1/accounting-party-worker',true);
      select public.multideck_accounting_party_catchup();`);
    assert.equal(sql(`select lease_token::text from public."ACCI_PartySyncQueue" where id='${job.id}'`),job.lease_token);
    // Revoking a connection invalidates earlier green evidence too.
    sql(`update public."ACCI_Connections" set "ACCIC_StatusCode"='inactive' where "ACCIC_ID"='${id(10)}';`);
    assert.equal(sql(`select count(*) from public."ACCI_PartySyncQueue" where connection_id='${id(10)}' and status='synced'`),'0');
    sql(`delete from public."Org_Master_Type" where "Org_ID"='${id(1000)}' and "OrgType_ID"='${id(501)}';`);

    const health = JSON.parse(
      sql(
        `set role service_role;select public.multideck_accounting_party_health('${
          id(10)
        }');`,
      ),
    );
    assert.equal(health.scope, "party_master");
    assert.equal(health.fullLedgerReconciled, false);
  } finally {
    if (started) {
      spawnSync(join(bin, "pg_ctl"), [
        "-D",
        join(dir, "data"),
        "-m",
        "immediate",
        "-w",
        "stop",
      ]);
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
