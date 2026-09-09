-- Read-only fixtures for personal/shared mailboxes, revocation and expiry.
begin;
do $$
declare email_allowed boolean; allowed_ids integer[];
begin
  foreach email_allowed in array array[true,false] loop
    with mailboxes("CommMailbox_ID","CommMailbox_UserID","CommMailbox_TypeCode","CommMailbox_IsDeleted") as (
 values (1,1,'personal',false),(2,2,'personal',false),(3,1,'shared',false),(4,2,'shared',false),
 (5,2,'shared',false),(6,2,'shared',false),(7,2,'shared',false),(8,2,'shared',true),
 (9,2,'personal',false),(10,2,'shared',false)
), access_grants("CommMailboxAccess_MailboxID","CommMailboxAccess_UserID","CommMailboxAccess_CanRead","CommMailboxAccess_RevokedAt","CommMailboxAccess_ExpiresAt") as (
 values (4,1,true,null::timestamptz,null::timestamptz),(5,1,true,now(),null),
 (6,1,true,null,now()-interval '1 second'),(7,1,false,null,null),(8,1,true,null,null),
 (9,1,true,null,now()+interval '1 day'),(10,2,true,null,null)
), accessible_mailboxes as materialized (
    select mailbox."CommMailbox_ID" as id
    from mailboxes mailbox
    where email_allowed
      and not mailbox."CommMailbox_IsDeleted"
      and mailbox."CommMailbox_UserID" = 1
      and mailbox."CommMailbox_TypeCode" = 'personal'
    union
    select access."CommMailboxAccess_MailboxID"
    from access_grants access
    join mailboxes mailbox
      on mailbox."CommMailbox_ID" = access."CommMailboxAccess_MailboxID"
     and not mailbox."CommMailbox_IsDeleted"
    where email_allowed
      and access."CommMailboxAccess_UserID" = 1
      and access."CommMailboxAccess_CanRead"
      and access."CommMailboxAccess_RevokedAt" is null
      and (access."CommMailboxAccess_ExpiresAt" is null or access."CommMailboxAccess_ExpiresAt" > now())
  )
    select coalesce(array_agg(id order by id),'{}'::integer[]) into allowed_ids from accessible_mailboxes;
    assert allowed_ids = case when email_allowed then array[1,4,9] else '{}'::integer[] end,
      'Engagement signals included an inaccessible mailbox';
  end loop;
end;
$$;
select 'Mailbox owner, grant, revocation, expiry, deletion and Email.Read checks passed.' as verification;
rollback;

