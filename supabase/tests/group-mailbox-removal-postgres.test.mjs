import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const bin = process.env.PG_TEST_BIN || '/opt/homebrew/opt/postgresql@17/bin'
const migration = readFileSync(new URL('../migrations/20260926163000_remove_google_group_mailbox.sql', import.meta.url), 'utf8')

test('group mailbox removal is atomic, owner-scoped and service-only', () => {
  assert.equal(spawnSync(join(bin, 'initdb'), ['--version']).status, 0, 'PostgreSQL is required')
  const dir = mkdtempSync(join(tmpdir(), 'group-mailbox-removal-'))
  const data = join(dir, 'data')
  let started = false
  const run = (command, args, input) => {
    const result = spawnSync(join(bin, command), args, { input, encoding: 'utf8', timeout: 30_000 })
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`)
  }

  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8'])
    run('pg_ctl', ['-D', data, '-l', join(dir, 'log'), '-o', `-k ${dir} -c listen_addresses=''`, '-w', 'start'])
    started = true
    run('psql', ['-h', dir, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], `
      create role anon; create role authenticated; create role service_role;
      create table public."Comm_ProviderConnections" (
        "CommConn_ID" uuid primary key, "CommConn_UserID" uuid not null,
        "CommConn_ProviderTypeCode" text not null, "CommConn_IsDeleted" boolean not null default false
      );
      create table public."Comm_Mailboxes" (
        "CommMailbox_ID" uuid primary key, "CommMailbox_ConnectionID" uuid not null,
        "CommMailbox_TypeCode" text not null, "CommMailbox_InboundEnabled" boolean not null default true,
        "CommMailbox_OutboundEnabled" boolean not null default false, "CommMailbox_IsDeleted" boolean not null default false,
        "CommMailbox_UpdatedAt" timestamptz, "CommMailbox_UpdatedBy" uuid
      );
      create table public."Comm_MailboxAccess" (
        "CommMailboxAccess_ID" uuid primary key, "CommMailboxAccess_MailboxID" uuid not null,
        "CommMailboxAccess_RevokedAt" timestamptz, "CommMailboxAccess_UpdatedAt" timestamptz
      );
      ${migration}
      grant usage on schema public to service_role;
      grant select, update on public."Comm_ProviderConnections", public."Comm_Mailboxes", public."Comm_MailboxAccess" to service_role;
      insert into public."Comm_ProviderConnections" values
        ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'google_workspace', false),
        ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000002', 'google_workspace', false),
        ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 'microsoft_365', false);
      insert into public."Comm_Mailboxes" ("CommMailbox_ID", "CommMailbox_ConnectionID", "CommMailbox_TypeCode") values
        ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'group'),
        ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000101', 'group'),
        ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000102', 'group'),
        ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000103', 'group'),
        ('00000000-0000-0000-0000-000000000205', '00000000-0000-0000-0000-000000000101', 'personal');
      insert into public."Comm_MailboxAccess" ("CommMailboxAccess_ID", "CommMailboxAccess_MailboxID") values
        ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201'),
        ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000201'),
        ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000202');
      do $$ begin
        if has_function_privilege('anon', 'public.comm_remove_group_mailbox(uuid,uuid,uuid)', 'execute')
          or has_function_privilege('authenticated', 'public.comm_remove_group_mailbox(uuid,uuid,uuid)', 'execute')
          or not has_function_privilege('service_role', 'public.comm_remove_group_mailbox(uuid,uuid,uuid)', 'execute')
        then raise exception 'Group removal function privileges are wrong'; end if;
      end $$;
      set role service_role;
      do $$ begin
        if public.comm_remove_group_mailbox('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000002')
        then raise exception 'Foreign user removed group'; end if;
        if public.comm_remove_group_mailbox('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001')
        then raise exception 'Foreign connection removed group'; end if;
        if public.comm_remove_group_mailbox('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001')
        then raise exception 'Outlook group was removed'; end if;
        if public.comm_remove_group_mailbox('00000000-0000-0000-0000-000000000205', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001')
        then raise exception 'Personal mailbox was removed'; end if;
        if not public.comm_remove_group_mailbox('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001')
        then raise exception 'Owned group was not removed'; end if;
        if (select count(*) from public."Comm_MailboxAccess" where "CommMailboxAccess_MailboxID" = '00000000-0000-0000-0000-000000000201' and "CommMailboxAccess_RevokedAt" is not null) <> 2
        then raise exception 'Not all group access was revoked'; end if;
        if not (select "CommMailbox_IsDeleted" from public."Comm_Mailboxes" where "CommMailbox_ID" = '00000000-0000-0000-0000-000000000201')
        then raise exception 'Owned group was not retired'; end if;
        if (select count(*) from public."Comm_Mailboxes" where "CommMailbox_IsDeleted") <> 1
        then raise exception 'Unrelated mailbox was changed'; end if;
      end $$;
      reset role;
      alter table public."Comm_MailboxAccess" add constraint prevent_second_revoke check (
        "CommMailboxAccess_MailboxID" <> '00000000-0000-0000-0000-000000000202' or "CommMailboxAccess_RevokedAt" is null
      );
      set role service_role;
      do $$ begin
        begin
          perform public.comm_remove_group_mailbox('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001');
          raise exception 'Expected the access update to fail';
        exception when check_violation then null;
        end;
        if (select "CommMailbox_IsDeleted" from public."Comm_Mailboxes" where "CommMailbox_ID" = '00000000-0000-0000-0000-000000000202')
        then raise exception 'Mailbox retirement was not rolled back'; end if;
      end $$;
    `)
  } finally {
    if (started) spawnSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'])
    rmSync(dir, { recursive: true, force: true })
  }
})
