import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
const read = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), "utf8")
const fn = (source, name) => {
  const start = source.indexOf(`create or replace function ${name}(`)
  assert.ok(start >= 0, name)
  const end = source.indexOf("$$;", source.indexOf("as $$", start))
  assert.ok(end > start, name)
  return source.slice(start, end + 3)
}
export function reportingDexterFixture() {
  const baseline = readFileSync(new URL("../baseline/public-schema.sql", import.meta.url), "utf8")
  const table = name => {
    const start = baseline.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${name}" (`)
    assert.ok(start >= 0, name)
    return baseline.slice(start, baseline.indexOf("\n);", start) + 3)
  }
  const watches = read("20260802140000_dexter_watching_for_you")
  const security = read("20260816120000_dexter_security_hardening")
  return `
    create role service_role;
    ${watches.slice(0, watches.indexOf('insert into public."sys_AIDexterWatchCapabilities"'))}
    alter table public."sys_AIDexterWatchCapabilities" add "AIDexterWatchCapability_RequiredPermissionsJSON" jsonb default '[]';
    alter table public."AI_DexterWatches" add "AIDexterWatch_HealthStatusCode" text default 'starting',add "AIDexterWatch_LastSourceCheckAt" timestamptz,add "AIDexterWatch_LastHealthError" text;
    ${table("sys_AIDexterDataDomains")}
    ${table("sys_AIDexterActions")}
    alter table public."sys_AIDexterActions" add column if not exists "AIDexterAction_AlwaysRequiresApproval" boolean not null default false;
    alter table public."sys_AIDexterDataDomains" add column if not exists "AIDexterDomain_RequiredPermissionsJSON" jsonb default '[]',add column if not exists "AIDexterDomain_DataCategoriesJSON" jsonb default '[]';
    alter table public."sys_AIDexterActions" add column if not exists "AIDexterAction_RequiredPermissionsJSON" jsonb default '[]',add column if not exists "AIDexterAction_IntentFamily" text;
    ${table("Comm_Notifications")}
    create function public._multideck_dexter_context() returns table(user_id uuid,company_id uuid) language sql stable as $$select "User_ID","Company_ID" from public."cmp_Users" where "Auth_User_ID"=auth.uid() and "User_AccessStatus"='active'$$;
    create function public._multideck_dexter_has_permission(uuid,text) returns boolean language sql stable as $$select false$$;
    create function public._multideck_dexter_has_permissions(uuid,jsonb) returns boolean language sql stable as $$select true$$;
    create function public._multideck_dexter_email_mailboxes(uuid,uuid) returns table(mailbox_id uuid) language sql as $$select null::uuid where false$$;
    ${fn(watches, "public.multideck_dexter_create_watch")}
    ${fn(watches, "public.multideck_dexter_list_watches")}
    ${fn(watches, "public.multideck_dexter_set_watch_status")}
    ${fn(watches, "public._multideck_dexter_watch_matches")}
    ${fn(read("20260802150818_dexter_email_watch_reliability"), "public._multideck_dexter_evaluate_watch_signal").replace("if v_matches and not coalesce(v_previously_matched, false) then", "if v_matches and (not coalesce(v_previously_matched, false)) then")}
    ${fn(security, "public.multideck_dexter_query_domain")}
    create trigger reporting_test_watch after insert on public."AI_DexterWatchSignals" for each row execute function public._multideck_dexter_evaluate_watch_signal();
    create schema private;
    create table public."AI_DexterPreparedActions"("AIDexterPrepared_ID" uuid,"AIDexterPrepared_ActionCode" text,"AIDexterPrepared_Status" text,"AIDexterPrepared_ApprovedAt" timestamptz);
    ${fn(read("20260831001000_security_scan_mandatory_approval_registry_fallback"), "private.multideck_dexter_guard_mandatory_approval")}
    create trigger report_approval_test before update on public."AI_DexterPreparedActions" for each row execute function private.multideck_dexter_guard_mandatory_approval();
    ${read("20260907223500_reporting_dexter")}
  `
}
