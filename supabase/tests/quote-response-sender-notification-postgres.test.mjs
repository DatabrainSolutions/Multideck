import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const migration = readFileSync(new URL('../migrations/20260928155945_quote_response_notify_sender.sql', import.meta.url), 'utf8')

test('PostgreSQL: sender receives a private response notice once without replacing the owner', { skip: spawnSync(join(bin, 'initdb'), ['--version']).status !== 0 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'multideck-quote-sender-'))
  const data = join(dir, 'data')
  let started = false
  function run(command, args, input) {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30_000 })
    assert.equal(result.status, 0, `${command}: ${result.stderr}\n${result.stdout}`)
    return result.stdout
  }
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run('pg_ctl', ['-D', data, '-l', join(dir, 'postgres.log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start'])
    started = true
    run('psql', ['-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], `
      create role anon; create role authenticated;
      create schema quote_api;
      create table public."cmp_Users" ("User_ID" uuid primary key, "Company_ID" uuid, "User_AccessStatus" text);
      create table public."CusQuote_Header" (
        "CusQuoteHeader_ID" uuid primary key, "CusQuoteHeader_SalesOwnerID" uuid,
        "CusQuoteHeader_CreatedBy" uuid, "CusQuoteHeader_CustomerReference" text,
        "CusQuoteHeader_Number" integer, "CusQuoteHeader_IsDeleted" boolean default false);
      create table public."Comm_Notifications" (
        "CommNotif_UserID" uuid, "CommNotif_Title" text, "CommNotif_Body" text,
        "CommNotif_TargetTable" text, "CommNotif_TargetID" uuid,
        "CommNotif_LinkTypeCode" text, "CommNotif_MetadataJSON" jsonb, "CommNotif_CreatedBy" uuid);
      create table quote_api.customer_response_links (
        response_link_id uuid primary key, company_id uuid, quote_id uuid,
        created_by uuid, delivery_status_code text);
      create table quote_api.customer_responses (
        response_id uuid primary key, company_id uuid, response_link_id uuid,
        quote_id uuid, decision_code text, decline_reason_code text);
      ${migration}
      do $test$
      declare company uuid := gen_random_uuid(); foreign_company uuid := gen_random_uuid();
        sender uuid := gen_random_uuid(); owner uuid := gen_random_uuid();
        quote_id uuid := gen_random_uuid(); link_id uuid := gen_random_uuid();
      begin
        insert into public."cmp_Users" values (sender, company, 'active'), (owner, company, 'active');
        insert into public."CusQuote_Header" values (quote_id, null, owner, 'JQ-TEST', 1, false);
        insert into quote_api.customer_response_links values (link_id, company, quote_id, sender, 'sent');
        insert into quote_api.customer_responses values (gen_random_uuid(), company, link_id, quote_id, 'accepted', null);
        if (select count(*) from public."Comm_Notifications") <> 1
          or (select "CommNotif_UserID" from public."Comm_Notifications") <> sender
          or (select "CommNotif_MetadataJSON"->>'action_url' from public."Comm_Notifications") <> '/quotes/JQ-TEST'
          then raise exception 'Sender was not notified exactly once'; end if;
        delete from public."Comm_Notifications";
        update public."CusQuote_Header" set "CusQuoteHeader_SalesOwnerID" = sender where "CusQuoteHeader_ID" = quote_id;
        insert into quote_api.customer_responses values (gen_random_uuid(), company, link_id, quote_id, 'declined', 'other');
        if exists (select 1 from public."Comm_Notifications") then raise exception 'Owner/sender duplicate'; end if;
        update public."CusQuote_Header" set "CusQuoteHeader_SalesOwnerID" = null where "CusQuoteHeader_ID" = quote_id;
        update quote_api.customer_response_links set company_id = foreign_company where response_link_id = link_id;
        insert into quote_api.customer_responses values (gen_random_uuid(), foreign_company, link_id, quote_id, 'challenged', null);
        if exists (select 1 from public."Comm_Notifications") then raise exception 'Foreign-company sender notified'; end if;
        update quote_api.customer_response_links set company_id = company, delivery_status_code = 'failed' where response_link_id = link_id;
        insert into quote_api.customer_responses values (gen_random_uuid(), company, link_id, quote_id, 'accepted', null);
        if exists (select 1 from public."Comm_Notifications") then raise exception 'Failed delivery notified'; end if;
        update quote_api.customer_response_links set delivery_status_code = 'sent' where response_link_id = link_id;
        update public."cmp_Users" set "User_AccessStatus" = 'inactive' where "User_ID" = sender;
        insert into quote_api.customer_responses values (gen_random_uuid(), company, link_id, quote_id, 'accepted', null);
        if exists (select 1 from public."Comm_Notifications") then raise exception 'Inactive sender notified'; end if;
        if has_function_privilege('anon', 'quote_api.notify_quote_response_sender()', 'execute')
          or has_function_privilege('authenticated', 'quote_api.notify_quote_response_sender()', 'execute')
          then raise exception 'Trigger function is publicly executable'; end if;
      end $test$;
    `)
  } finally {
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
