import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { currentFunction } from './operational-access-source.mjs';

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin';
const migration = readFileSync(new URL('../migrations/20260922170200_warehouse_item_import_reserved_skus.sql', import.meta.url), 'utf8');
test('item import preview finds reserved deleted SKUs within one customer; atomic inserts create default assignments', () => {
  const dir = mkdtempSync(join(tmpdir(), 'warehouse-item-import-')), data = join(dir, 'data');
  let started = false;
  const run = (command, args, input) => {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.status, 0, `${result.error || ''}\n${result.stderr}\n${result.stdout}`);
  };
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(dir, 'postgres.log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start']); started = true;
    run('psql', ['-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], `
      create role anon; create role authenticated; create role service_role;
      create table public."WMS_Items" (
        "WMSItem_ID" uuid primary key default gen_random_uuid(),"WMSItem_CustomerOrgID" uuid not null,
        "WMSItem_SKU" text not null,"WMSItem_IsDeleted" boolean not null default false,
        "WMSItem_DefaultFacilityID" uuid,"WMSItem_CreatedBy" uuid,
        unique("WMSItem_CustomerOrgID","WMSItem_SKU")
      );
      create table public."WMS_ItemFacilityAssignments" (
        "WMSItemFacility_ItemID" uuid references public."WMS_Items"("WMSItem_ID"),
        "WMSItemFacility_FacilityID" uuid,"WMSItemFacility_IsDefault" boolean,"WMSItemFacility_IsActive" boolean,
        "WMSItemFacility_CreatedBy" uuid,"WMSItemFacility_UpdatedAt" timestamptz,
        unique("WMSItemFacility_ItemID","WMSItemFacility_FacilityID")
      );
      ${currentFunction('public', '_warehouse_item_default_assignment').sql}
      create trigger default_assignment after insert on public."WMS_Items" for each row execute function public._warehouse_item_default_assignment();
      ${migration}
      do $$declare customer uuid:=gen_random_uuid();other_customer uuid:=gen_random_uuid();facility uuid:=gen_random_uuid();actor uuid:=gen_random_uuid();matches text[];begin
        insert into public."WMS_Items"("WMSItem_CustomerOrgID","WMSItem_SKU","WMSItem_IsDeleted","WMSItem_DefaultFacilityID","WMSItem_CreatedBy") values
          (customer,'Live',false,facility,actor),(customer,'Reserved',true,facility,actor),(other_customer,'Foreign',false,facility,actor);
        matches:=public.warehouse_edge_existing_item_skus(customer,array['live','reserved','foreign','new']);
        if matches<>array['live','reserved'] then raise exception 'Customer-scoped duplicate lookup failed: %',matches;end if;
        if public.warehouse_edge_existing_item_skus(customer,array['unknown'])<>array[]::text[] or public.warehouse_edge_existing_item_skus(customer,null)<>array[]::text[] then raise exception 'Unrequested SKUs leaked';end if;
        if has_function_privilege('anon','public.warehouse_edge_existing_item_skus(uuid,text[])','execute') or has_function_privilege('authenticated','public.warehouse_edge_existing_item_skus(uuid,text[])','execute') or not has_function_privilege('service_role','public.warehouse_edge_existing_item_skus(uuid,text[])','execute') then raise exception 'Lookup execution privilege boundary changed';end if;
        if (select count(*) from public."WMS_ItemFacilityAssignments" where "WMSItemFacility_FacilityID"=facility and "WMSItemFacility_CreatedBy"=actor and "WMSItemFacility_IsActive" and "WMSItemFacility_IsDefault")<>3 then raise exception 'Default item assignment missing';end if;
        begin
          insert into public."WMS_Items"("WMSItem_CustomerOrgID","WMSItem_SKU","WMSItem_DefaultFacilityID","WMSItem_CreatedBy") values
            (customer,'New',facility,actor),(customer,'Reserved',facility,actor);
          raise exception 'Reserved SKU unexpectedly inserted';
        exception when unique_violation then null;end;
        if exists(select 1 from public."WMS_Items" where "WMSItem_SKU"='New') or (select count(*) from public."WMS_ItemFacilityAssignments")<>3 then raise exception 'Failed import left partial rows or assignments';end if;
      end$$;
    `);
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop']);
    rmSync(dir, { recursive: true, force: true });
  }
});
