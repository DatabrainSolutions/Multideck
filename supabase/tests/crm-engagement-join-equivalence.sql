-- Pure relational fixtures: no operational records are changed.
begin;
do $$
declare verified boolean;
begin
with account_records(id) as (values (1), (2), (3)),
lead_records(id,org_id,email) as (values (11,1,'lead@example.test'),(12,null,'fallback@example.test'),(13,null,'normalised@example.test')),
threads("CommThread_ID","CommThread_CustomerOrgID","CommThread_PrimaryTargetID","CommThread_IsDeleted") as (
 values (100,1,11,false),(101,null,null,false),(102,null,null,false),(103,1,11,true),
 (104,null,null,false),(105,null,null,false),(106,null,null,false),(107,null,null,false),(108,null,12,false),(109,null,null,false),(110,null,null,false)
),
identities("CommIdentity_ID","CommIdentity_OrgID","CommIdentity_NormalizedAddress","CommIdentity_IsDeleted") as (
 values (1,1,'lead@example.test',false),(2,1,'deleted@example.test',true),
 (3,null,'other@example.test',false),(4,null,null,false),(5,null,'NORMALISED@example.test',false)
),
participants("CommThreadPart_ThreadID","CommThreadPart_OrgID","CommThreadPart_IdentityID","CommThreadPart_AddressSnapshot") as (
 values (100,1,1,'lead@example.test'),(100,1,1,'duplicate@example.test'),(101,1,null,null),
 (102,null,1,null),(103,1,1,null),(104,null,2,'fallback@example.test'),
 (105,null,3,'fallback@example.test'),(106,null,4,'FALLBACK@example.test'),
 (107,null,999,'fallback@example.test'),(109,null,5,null),(110,2,1,null)
),
original_accounts as materialized (
    select distinct account.id as record_id, thread."CommThread_ID" as thread_id
    from account_records account
    join threads thread
      on true
     and not thread."CommThread_IsDeleted"
     and (
       thread."CommThread_CustomerOrgID" = account.id
       or exists (
         select 1
         from participants participant
         left join identities identity
           on identity."CommIdentity_ID" = participant."CommThreadPart_IdentityID"
          and not identity."CommIdentity_IsDeleted"
         where participant."CommThreadPart_ThreadID" = thread."CommThread_ID"
           and (participant."CommThreadPart_OrgID" = account.id or identity."CommIdentity_OrgID" = account.id)
       )
     )
  ), original_leads as materialized (
    select distinct lead.id as record_id, thread."CommThread_ID" as thread_id
    from lead_records lead
    join threads thread
      on true
     and not thread."CommThread_IsDeleted"
     and (
       thread."CommThread_PrimaryTargetID" = lead.id
       or (lead.org_id is not null and thread."CommThread_CustomerOrgID" = lead.org_id)
       or exists (
         select 1
         from participants participant
         left join identities identity
           on identity."CommIdentity_ID" = participant."CommThreadPart_IdentityID"
          and not identity."CommIdentity_IsDeleted"
         where participant."CommThreadPart_ThreadID" = thread."CommThread_ID"
           and (
             (lead.org_id is not null and (participant."CommThreadPart_OrgID" = lead.org_id or identity."CommIdentity_OrgID" = lead.org_id))
             or (lead.email is not null and lower(coalesce(identity."CommIdentity_NormalizedAddress", participant."CommThreadPart_AddressSnapshot")) = lead.email)
           )
       )
     )
  ), candidate_accounts as materialized (
    -- Separate associations let Postgres join once per relation instead of
    -- testing every requested account against every thread.
    select account.id as record_id, thread."CommThread_ID" as thread_id
    from account_records account
    join threads thread on thread."CommThread_CustomerOrgID" = account.id
    where true and not thread."CommThread_IsDeleted"
    union
    select account.id, thread."CommThread_ID"
    from account_records account
    join participants participant on participant."CommThreadPart_OrgID" = account.id
    join threads thread on thread."CommThread_ID" = participant."CommThreadPart_ThreadID"
    where true and not thread."CommThread_IsDeleted"
    union
    select account.id, thread."CommThread_ID"
    from account_records account
    join identities identity on identity."CommIdentity_OrgID" = account.id and not identity."CommIdentity_IsDeleted"
    join participants participant on participant."CommThreadPart_IdentityID" = identity."CommIdentity_ID"
    join threads thread on thread."CommThread_ID" = participant."CommThreadPart_ThreadID"
    where true and not thread."CommThread_IsDeleted"
  ), candidate_leads as materialized (
    select lead.id as record_id, thread."CommThread_ID" as thread_id
    from lead_records lead
    join threads thread on thread."CommThread_PrimaryTargetID" = lead.id
    where true and not thread."CommThread_IsDeleted"
    union
    select lead.id, thread."CommThread_ID"
    from lead_records lead
    join threads thread on thread."CommThread_CustomerOrgID" = lead.org_id
    where true and not thread."CommThread_IsDeleted"
    union
    select lead.id, thread."CommThread_ID"
    from lead_records lead
    join participants participant on participant."CommThreadPart_OrgID" = lead.org_id
    join threads thread on thread."CommThread_ID" = participant."CommThreadPart_ThreadID"
    where true and not thread."CommThread_IsDeleted"
    union
    select lead.id, thread."CommThread_ID"
    from lead_records lead
    join identities identity on identity."CommIdentity_OrgID" = lead.org_id and not identity."CommIdentity_IsDeleted"
    join participants participant on participant."CommThreadPart_IdentityID" = identity."CommIdentity_ID"
    join threads thread on thread."CommThread_ID" = participant."CommThreadPart_ThreadID"
    where true and not thread."CommThread_IsDeleted"
    union
    select lead.id, thread."CommThread_ID"
    from lead_records lead
    join identities identity on lower(identity."CommIdentity_NormalizedAddress") = lead.email and not identity."CommIdentity_IsDeleted"
    join participants participant on participant."CommThreadPart_IdentityID" = identity."CommIdentity_ID"
    join threads thread on thread."CommThread_ID" = participant."CommThreadPart_ThreadID"
    where true and not thread."CommThread_IsDeleted"
    union
    select lead.id, thread."CommThread_ID"
    from lead_records lead
    join participants participant on lower(participant."CommThreadPart_AddressSnapshot") = lead.email
    left join identities identity on identity."CommIdentity_ID" = participant."CommThreadPart_IdentityID" and not identity."CommIdentity_IsDeleted"
    join threads thread on thread."CommThread_ID" = participant."CommThreadPart_ThreadID"
    where true and not thread."CommThread_IsDeleted"
      and identity."CommIdentity_NormalizedAddress" is null
  ), expected(kind,record_id,thread_id) as (values
 ('account',1,100),('account',1,101),('account',1,102),('account',1,110),('account',2,110),
 ('lead',11,100),('lead',11,101),('lead',11,102),('lead',11,110),
 ('lead',12,104),('lead',12,106),('lead',12,107),('lead',12,108),('lead',13,109)
), original as (select 'account' as kind,* from original_accounts union all select 'lead',* from original_leads),
candidate as (select 'account' as kind,* from candidate_accounts union all select 'lead',* from candidate_leads)
select
 not exists ((select * from original except select * from candidate) union all (select * from candidate except select * from original))
 and not exists ((select * from expected except select * from candidate) union all (select * from candidate except select * from expected))
 and (select count(*) from candidate) = (select count(*) from expected)
 into verified;
assert verified, 'Account/lead associations, duplicate links, deleted identities or address precedence changed';
end;
$$;
select 'Engagement join equivalence and explicit account/lead edge cases passed.' as verification;
rollback;

