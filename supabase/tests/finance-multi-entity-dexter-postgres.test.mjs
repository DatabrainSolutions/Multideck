import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { withProductPostgres } from './local-product-postgres.mjs'

const migration = readFileSync(new URL('../migrations/20260925102000_finance_multi_entity_dexter_drafts.sql', import.meta.url), 'utf8')

test('Dexter finance draft metadata requires an entity, retains exact job charges and fails on a missing action', () => {
  withProductPostgres((sql, ok) => {
    ok(sql(`create table public."sys_AIDexterActions" (
      "AIDexterAction_Code" text primary key,
      "AIDexterAction_Description" text not null,
      "AIDexterAction_ParametersJSON" jsonb not null,
      "AIDexterAction_UpdatedAt" timestamptz not null default now()
    );
    create table public."sys_AIDexterWatchCapabilities" (
      "AIDexterWatchCapability_Code" text primary key,
      "AIDexterWatchCapability_Description" text not null,
      "AIDexterWatchCapability_UpdatedAt" timestamptz not null default now()
    );
    insert into public."sys_AIDexterActions" values
      ('create_finance_document_draft','old','{"properties":{"lines":{"items":{"properties":{}}}},"required":["type"]}'::jsonb,now()),
      ('create_finance_cash_draft','old','{"properties":{},"required":["type"]}'::jsonb,now());
    insert into public."sys_AIDexterWatchCapabilities" values ('finance','old',now());`))

    ok(sql(migration))
    ok(sql(migration))
    const result = sql(`select
      (select count(*) from public."sys_AIDexterActions"
        where ("AIDexterAction_ParametersJSON"->'required') ? 'legalEntityId') = 2
      and (select count(*) from public."sys_AIDexterActions"
        where jsonb_array_length("AIDexterAction_ParametersJSON"->'required') = 2) = 2
      and (select "AIDexterAction_ParametersJSON" #> '{properties,lines,items,properties,jobCostingLineId}'
        from public."sys_AIDexterActions" where "AIDexterAction_Code"='create_finance_document_draft')
        = '{"type":["string","null"]}'::jsonb
      and (select "AIDexterWatchCapability_Description" like '%legal entity%'
        from public."sys_AIDexterWatchCapabilities" where "AIDexterWatchCapability_Code"='finance')
      as installed;`)
    ok(result)
    assert.match(result.stdout, /installed\s*\n[-+ ]+\n t\s*\n/)

    ok(sql(`delete from public."sys_AIDexterActions" where "AIDexterAction_Code"='create_finance_cash_draft'`))
    const incomplete = sql(migration)
    assert.notEqual(incomplete.status, 0)
    assert.match(incomplete.stderr, /Both Finance draft actions must require a selected legal entity/)
  })
})
