import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { withProductPostgres } from './local-product-postgres.mjs'

const migration = name => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')
test('Jenkar exclusivity preserves ordinary CRM permissions and pauses existing phone watches on revocation', () => {
  withProductPostgres((sql, ok) => {
    ok(sql(`
      create table public."cmp_Users_Roles" ("User_ID" uuid, "sys_UserRole_ID" uuid);
      create table public."sys_UserRole_Permissions" ("sys_UserRole_ID" uuid, "sys_Permission_ID" uuid);
      create table public."sys_Permissions" ("sys_Permission_ID" uuid, "sys_Permission_Value" text);
      create table public."AI_DexterWatches" (
        "AIDexterWatch_CapabilityCode" text, "AIDexterWatch_StatusCode" text,
        "AIDexterWatch_IsArmed" boolean, "AIDexterWatch_UpdatedAt" timestamptz
      );
      ${migration('20260915090134_cloud_product_entitlements')}
      ${migration('20260915090826_jenkar_phone_permission_boundary')}
      do $$declare actor uuid := gen_random_uuid(); role_id uuid := gen_random_uuid();
        permission_id uuid := gen_random_uuid(); begin
        insert into public."cmp_Users_Roles" values(actor, role_id);
        insert into public."sys_UserRole_Permissions" values(role_id, permission_id);
        insert into public."sys_Permissions" values(permission_id, 'CRM.PhoneCalls.Read'), (permission_id, 'CRM.Leads.Read');
        if public._multideck_crm_has_permission(actor, 'CRM.PhoneCalls.Read') then raise exception 'Unbound phone access'; end if;
        if not public._multideck_crm_has_permission(actor, 'CRM.Leads.Read') then raise exception 'Ordinary CRM broken'; end if;
        insert into private.cloud_product_state(tenant_id) values(gen_random_uuid());
        if public._multideck_crm_has_permission(actor, 'CRM.PhoneCalls.Read') then raise exception 'Unverified phone access'; end if;
        -- Only trusted database provisioning can establish verified exclusivity.
        update private.cloud_product_state set jenkar_phone_verified=true;
        if not public._multideck_crm_has_permission(actor, 'CRM.PhoneCalls.Read') then raise exception 'Verified Jenkar denied'; end if;
        if public._multideck_crm_has_permission(gen_random_uuid(), 'CRM.PhoneCalls.Read') then raise exception 'Roles bypassed'; end if;
        insert into public."AI_DexterWatches" values('phone_calls','active',true,now()), ('deals','active',true,now());
        update private.cloud_product_state set jenkar_phone_verified=false;
        if public._multideck_crm_has_permission(actor, 'CRM.PhoneCalls.Read') then raise exception 'Revocation ignored'; end if;
        if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_CapabilityCode"='phone_calls' and "AIDexterWatch_StatusCode" <> 'paused') then raise exception 'Watch not paused'; end if;
        if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_CapabilityCode"='deals' and "AIDexterWatch_StatusCode" <> 'active') then raise exception 'Unrelated watch changed'; end if;
        update private.cloud_product_state set jenkar_phone_verified=true;
        if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_CapabilityCode"='phone_calls' and "AIDexterWatch_StatusCode" <> 'paused') then raise exception 'Watch silently resumed'; end if;
      end $$;
    `))
  })
})
