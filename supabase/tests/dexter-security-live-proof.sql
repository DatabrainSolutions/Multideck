-- Run only against an isolated Supabase project after the Dexter hardening
-- migration. Every fixture and state change is rolled back.

begin;
set local request.jwt.claim.role = 'service_role';

alter table public."cmp_Users"
  add column if not exists "User_AccessStatus" text not null default 'active';

create temporary table dexter_security_proof (
  test text primary key,
  result jsonb
) on commit drop;

insert into public."cmp_Company" ("Company_ID", "Company_Name") values
  ('11111111-1111-4111-8111-111111111111', 'Dexter isolated security test')
on conflict ("Company_ID") do nothing;

insert into public."cmp_Users" (
  "User_ID", "Company_ID", "User_Email", "User_Firstname", "User_AccessStatus"
) values
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'dexter-security@example.invalid', 'Security', 'active'),
  ('22222222-2222-4222-8222-222222222223', '11111111-1111-4111-8111-111111111111', 'dexter-other@example.invalid', 'Other', 'active')
on conflict ("User_ID") do nothing;

insert into public."sys_UserRoles" ("sys_UserRole_ID", "sys_UserRole_Name") values
  ('33333333-3333-4333-8333-333333333333', 'Dexter isolated security role')
on conflict ("sys_UserRole_ID") do nothing;

insert into public."sys_Permissions" (
  "sys_Permission_ID", "sys_Permission_Value", "sys_Permission_Group",
  "sys_Permission_Name", "sys_Permission_Description", "sys_Permission_IsDangerous"
) values
  ('44444444-4444-4444-8444-444444444441', 'AgentDexter.Manage', 'Test', 'Manage Dexter', 'Isolated test permission', true),
  ('44444444-4444-4444-8444-444444444442', 'Email.Send', 'Test', 'Send email', 'Isolated test permission', true),
  ('44444444-4444-4444-8444-444444444443', 'Customers.Read', 'Test', 'Read customers', 'Isolated test permission', false)
on conflict ("sys_Permission_Value") do nothing;

insert into public."cmp_Users_Roles" ("User_ID", "sys_UserRole_ID") values
  ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333')
on conflict do nothing;

insert into public."sys_UserRole_Permissions" ("sys_UserRole_ID", "sys_Permission_ID")
select '33333333-3333-4333-8333-333333333333'::uuid, permission."sys_Permission_ID"
from public."sys_Permissions" permission
where permission."sys_Permission_Value" in ('AgentDexter.Manage', 'Email.Send', 'Customers.Read')
on conflict do nothing;

insert into public."sys_AIConversationChannels" (
  "AICC_Code", "AICC_Name", "AICC_Description", "AICC_SortOrder", "AICC_IsActive"
) values ('chat', 'Chat', 'Isolated Dexter test conversation.', 10, true)
on conflict ("AICC_Code") do nothing;

insert into public."AI_Conversations" (
  "AICNV_ID", "AICNV_Title", "AICNV_Channel", "AICNV_CompanyID",
  "AICNV_OwnerUserID", "AICNV_CreatedBy"
) values (
  '88888888-8888-4888-8888-888888888888', 'Isolated security conversation', 'chat',
  '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
  '22222222-2222-4222-8222-222222222222'
);

insert into public."AI_DexterIntentPlans" (
  "AIDexterIntent_ID", "AIDexterIntent_CompanyID", "AIDexterIntent_UserID",
  "AIDexterIntent_ConversationID", "AIDexterIntent_ClientSessionID",
  "AIDexterIntent_PromptSHA256", "AIDexterIntent_AllowedActionsJSON",
  "AIDexterIntent_TargetConstraintsJSON", "AIDexterIntent_RecipientConstraintsJSON",
  "AIDexterIntent_Specialist", "AIDexterIntent_AccessMode", "AIDexterIntent_ExpiresAt"
) values (
  '99999999-9999-4999-8999-999999999999', '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', repeat('a', 64), '["send_email"]',
  '["dddddddd-dddd-4ddd-8ddd-dddddddddddd"]', '["allowed@example.com"]',
  'auto', 'full', now() + interval '1 hour'
);

insert into public."AI_DexterConversationGrants" (
  "AIDexterGrant_ID", "AIDexterGrant_CompanyID", "AIDexterGrant_UserID",
  "AIDexterGrant_ConversationID", "AIDexterGrant_ClientSessionID",
  "AIDexterGrant_Mode", "AIDexterGrant_Status", "AIDexterGrant_ExpiresAt"
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'full', 'active', now() + interval '1 hour'
);

insert into public."AI_DexterPreparedActions" (
  "AIDexterPrepared_ID", "AIDexterPrepared_CompanyID", "AIDexterPrepared_UserID",
  "AIDexterPrepared_ConversationID", "AIDexterPrepared_ClientSessionID",
  "AIDexterPrepared_IntentID", "AIDexterPrepared_GrantID", "AIDexterPrepared_ActionCode",
  "AIDexterPrepared_ArgumentsJSON", "AIDexterPrepared_TargetID", "AIDexterPrepared_TargetJSON",
  "AIDexterPrepared_Title", "AIDexterPrepared_Description", "AIDexterPrepared_ChangesJSON",
  "AIDexterPrepared_AccessMode", "AIDexterPrepared_IdempotencyKey", "AIDexterPrepared_ExpiresAt"
) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'send_email', '{"draft":{"to":[{"address":"allowed@example.com"}]}}', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', '{}', 'Send email', 'Allowed recipient', '[]', 'full', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', now() + interval '30 minutes'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'send_email', '{"draft":{"to":[{"address":"allowed@example.com"}]}}', 'dddddddd-dddd-4ddd-8ddd-ddddddddddde', '{}', 'Send email', 'Wrong target', '[]', 'full', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', now() + interval '30 minutes'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb003', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'send_email', '{"draft":{"to":[{"address":"attacker@example.com"}]}}', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', '{}', 'Send email', 'Wrong recipient', '[]', 'full', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee03', now() + interval '30 minutes'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb004', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'send_email', '{"draft":{"to":[{"address":"allowed@example.com"}]}}', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', '{}', 'Send email', 'Permission revoked', '[]', 'full', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee04', now() + interval '30 minutes'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb005', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'send_email', '{"draft":{"to":[{"address":"allowed@example.com"}]}}', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', '{}', 'Send email', 'Cross user', '[]', 'full', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee05', now() + interval '30 minutes'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb006', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'send_email', '{"draft":{"to":[{"address":"allowed@example.com"}]}}', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', '{}', 'Send email', 'Expired', '[]', 'full', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee06', now() - interval '1 minute');

insert into dexter_security_proof values
  ('authorised_exact_effect', public.multideck_dexter_claim_external_prepared_action('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888')),
  ('target_substitution_denied', public.multideck_dexter_claim_external_prepared_action('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb002', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888')),
  ('recipient_substitution_denied', public.multideck_dexter_claim_external_prepared_action('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb003', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888')),
  ('cross_user_denied', public.multideck_dexter_claim_external_prepared_action('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb005', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222223', '88888888-8888-4888-8888-888888888888')),
  ('cross_conversation_denied', public.multideck_dexter_claim_external_prepared_action('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb005', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '77777777-7777-4777-8777-777777777777')),
  ('expired_denied', public.multideck_dexter_claim_external_prepared_action('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb006', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888'));

insert into dexter_security_proof values
  ('replay_denied', public.multideck_dexter_claim_external_prepared_action('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888'));

delete from public."sys_UserRole_Permissions" role_permission
using public."sys_Permissions" permission
where role_permission."sys_UserRole_ID" = '33333333-3333-4333-8333-333333333333'
  and role_permission."sys_Permission_ID" = permission."sys_Permission_ID"
  and permission."sys_Permission_Value" = 'Email.Send';

insert into dexter_security_proof values
  ('permission_revocation_denied', public.multideck_dexter_claim_external_prepared_action('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb004', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888'));

do $$
declare failures text[];
begin
  select array_agg(test) into failures
  from dexter_security_proof
  where (test = 'authorised_exact_effect' and coalesce((result ->> 'ok')::boolean, false) is not true)
     or (test = 'target_substitution_denied' and result #>> '{error,code}' <> 'target_outside_operator_intent')
     or (test = 'recipient_substitution_denied' and result #>> '{error,code}' <> 'recipient_outside_operator_intent')
     or (test = 'cross_user_denied' and result #>> '{error,code}' <> 'prepared_action_unavailable')
     or (test = 'cross_conversation_denied' and result #>> '{error,code}' <> 'prepared_action_unavailable')
     or (test = 'expired_denied' and result #>> '{error,code}' <> 'prepared_action_expired')
     or (test = 'replay_denied' and result #>> '{error,code}' <> 'prepared_action_replayed')
     or (test = 'permission_revocation_denied' and result #>> '{error,code}' <> 'permission_denied');

  if coalesce(array_length(failures, 1), 0) > 0 then
    raise exception 'Dexter security proof failures: %', failures;
  end if;
end $$;

select test,
  case
    when test = 'authorised_exact_effect' then jsonb_build_object(
      'ok', result -> 'ok',
      'status', result #> '{prepared,AIDexterPrepared_Status}'
    )
    else jsonb_build_object('ok', result -> 'ok', 'code', result #> '{error,code}')
  end as proof
from dexter_security_proof
order by test;

rollback;
