import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const migration = readFileSync(new URL('../migrations/20260929132713_quote_party_contact_handoff.sql', import.meta.url), 'utf8')

test('accepted Quote contact details reach initial Booking parties and reviewed sync', () => {
  const directory = mkdtempSync(join(tmpdir(), 'quote-party-handoff-'))
  const data = join(directory, 'data')
  let started = false
  const run = (command, args, input) => {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30000 })
    assert.equal(result.status, 0, `${command}: ${result.stderr}\n${result.stdout}`)
    return result.stdout
  }
  const sql = input => run('psql', ['-h', directory, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], input)
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-k ${directory} -c listen_addresses=''`, '-w', 'start'])
    started = true
    sql(`
      create role anon; create role authenticated; create role service_role;
      create schema booking_api;
      create table public."Job_Header" (
        "Job_ID" uuid primary key, "Job_SourceQuoteID" uuid, "Job_SourceSnapshotJSON" jsonb
      );
      create table public."Job_Parties" (
        "JobParty_JobID" uuid, "JobParty_Role" text,
        "JobParty_RawSnapshot" jsonb default '{}'::jsonb,
        "JobParty_EmailSnapshot" text, "JobParty_ContactNameSnapshot" text
      );
      create function public.booking_workflow_apply_quote_sync_before_payer_20260904(uuid,uuid,uuid,jsonb)
      returns jsonb language plpgsql as $func$
      declare proposed jsonb := $4; current_parties jsonb;
      begin
        current_parties := jsonb_build_array(jsonb_build_object(
          'role','shipper','contactName',proposed#>>'{shipper,contact}','sequence',1));
        current_parties := current_parties || jsonb_build_array(jsonb_build_object(
          'role','consignee','contactName',proposed#>>'{consignee,contact}','sequence',1));
        return current_parties;
      end $func$;
      ${migration}
      do $check$
      declare job uuid := gen_random_uuid(); result jsonb;
      begin
        insert into public."Job_Header" values (
          job, gen_random_uuid(),
          '{"acceptedSnapshot":{"quote":{"shipmentFacts":{"shipperEmail":"old-shipper@example.test","consigneeEmail":"old-consignee@example.test","consigneeContact":"Old recipient"}}}}'
        );
        insert into public."Job_Parties" ("JobParty_JobID","JobParty_Role","JobParty_RawSnapshot") values
          (job,'shipper','{"contact":"Sender","email":"new-shipper@example.test"}'),
          (job,'consignee','{"name":"Recipient"}');
        if (select "JobParty_EmailSnapshot" from public."Job_Parties" where "JobParty_Role"='shipper') <> 'new-shipper@example.test'
          or (select "JobParty_EmailSnapshot" from public."Job_Parties" where "JobParty_Role"='consignee') <> 'old-consignee@example.test'
          or (select "JobParty_ContactNameSnapshot" from public."Job_Parties" where "JobParty_Role"='consignee') <> 'Old recipient' then
          raise exception 'Initial Quote contact handoff failed';
        end if;
        -- A later Booking edit may deliberately clear an email. Do not refill it.
        insert into public."Job_Parties" ("JobParty_JobID","JobParty_Role","JobParty_RawSnapshot")
          values (job,'shipper','{"role":"shipper","email":""}');
        if (select "JobParty_EmailSnapshot" from public."Job_Parties" where "JobParty_RawSnapshot" ? 'role') is not null then
          raise exception 'Booking override was overwritten';
        end if;
        result := public.booking_workflow_apply_quote_sync_before_payer_20260904(null,null,null,
          '{"shipper":{"contact":"Sender","email":"sender@example.test"},"consignee":{"contact":"Recipient","email":"recipient@example.test"}}');
        if result#>>'{0,email}' <> 'sender@example.test' or result#>>'{1,email}' <> 'recipient@example.test' then
          raise exception 'Reviewed Quote sync dropped party email';
        end if;
      end $check$;
    `)
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'])
    rmSync(directory, { recursive: true, force: true })
  }
})
