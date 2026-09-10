begin;
-- A bounded chronological read, separate from relevance-ranked keyword search.
create function public.multideck_dexter_recent_email(p_providers text[],p_direction text,p_after timestamptz default null,p_before timestamptz default null,p_take integer default 10)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,auth as $$
declare actor record;providers text[];take_count integer:=greatest(1,least(coalesce(p_take,10),20));result jsonb;coverage_start timestamptz:=now()-interval '12 months';
begin
 select * into actor from public._multideck_dexter_context();
 if not public._multideck_dexter_has_permission(actor.user_id,'Email.Read') or not public._multideck_dexter_has_permission(actor.user_id,'Email.AIRead') then
  raise exception 'You do not have permission to use email with Dexter.' using errcode='42501';end if;
 select coalesce(array_agg(distinct lower(btrim(p))),array[]::text[]) into providers from unnest(p_providers) p where lower(btrim(p)) in ('gmail','outlook');
 if cardinality(providers)=0 or cardinality(providers)<>cardinality(p_providers) then raise exception 'Choose Gmail, Outlook, or both as the email source.' using errcode='22023';end if;
 if p_direction is null or p_direction not in ('received','sent','all') then raise exception 'Choose received, sent or all email.' using errcode='22023';end if;
 if p_after is not null and p_before is not null and p_after>=p_before then raise exception 'The email date range is invalid.' using errcode='22023';end if;
 with permitted as materialized (
  select a.*,m."CommMailbox_LastSyncedAt" synced_at,coalesce(m."CommMailbox_IndexStatus",'pending') index_status
  from public._multideck_dexter_email_mailboxes(actor.user_id,actor.company_id) a
  join public."Comm_Mailboxes" m on m."CommMailbox_ID"=a.mailbox_id where a.provider=any(providers)
 ), candidates as (
  select m.*,p.provider,p.synced_at,p.index_status,coalesce(m."CommMessage_MessageDate",m."CommMessage_ReceivedAt",m."CommMessage_SentAt",m."CommMessage_CreatedAt") occurred_at
  from public."Comm_Messages" m join permitted p on p.mailbox_id=m."CommMessage_MailboxID"
  where m."CommMessage_ChannelCode"='email' and not m."CommMessage_IsDeleted" and not m."CommMessage_IsDraft" and not m."CommMessage_IsSpam"
   and m."CommMessage_ThreadID" is not null
   and (p_direction='all' or (p_direction='received' and m."CommMessage_IsInbound") or (p_direction='sent' and not m."CommMessage_IsInbound"))
   and not exists(select 1 from public."Comm_MessageFolders" f join public."Comm_MailFolders" folder on folder."CommMailFolder_ID"=f."CommMessageFolder_FolderID"
    where f."CommMessageFolder_MessageID"=m."CommMessage_ID" and folder."CommMailFolder_RoleCode" in ('drafts','spam','trash'))
 ), ordered as materialized (
  select * from candidates where occurred_at>=greatest(coalesce(p_after,coverage_start),coverage_start) and (p_before is null or occurred_at<p_before)
  order by occurred_at desc,"CommMessage_ID" desc limit take_count+1
 ), output_rows as (
  select jsonb_build_object('threadId',o."CommMessage_ThreadID",'matchMessageId',o."CommMessage_ID",'mailboxId',o."CommMessage_MailboxID",'provider',o.provider,
   'subject',o."CommMessage_Subject",'occurredAt',o.occurred_at,'direction',case when o."CommMessage_IsInbound" then 'received' else 'sent' end,
   'hasAttachments',o."CommMessage_HasAttachments",'syncedAt',o.synced_at,'indexStatus',o.index_status,
   'participants',coalesce((select jsonb_agg(jsonb_build_object('address',r."CommRecipient_Address",'displayName',r."CommRecipient_DisplayNameSnapshot",'role',r."CommRecipient_RecipientTypeCode")) from public."Comm_MessageRecipients" r where r."CommRecipient_MessageID"=o."CommMessage_ID"),'[]'::jsonb),
   '_citation',jsonb_build_object('title',coalesce(o."CommMessage_Subject",'Email'),'url','/inbox?provider='||o.provider||'&mailbox='||o."CommMessage_MailboxID"||'&thread='||o."CommMessage_ThreadID",'description','Email thread')
  ) value,o.occurred_at,o."CommMessage_ID" id from ordered o order by o.occurred_at desc,o."CommMessage_ID" desc limit take_count
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(value order by occurred_at desc,id desc) from output_rows),'[]'::jsonb),
  'hasMore',(select count(*) from ordered)>take_count,'direction',p_direction,'coreCoverageStart',coverage_start,
  'outsideRetentionWindow',(p_before is not null and p_before<=coverage_start) or (p_after is not null and p_after<coverage_start),
  'coverage',coalesce((select jsonb_agg(jsonb_build_object('mailboxId',mailbox_id,'provider',provider,'syncedAt',synced_at,'indexStatus',index_status,'stale',synced_at is null or synced_at<now()-interval '30 minutes' or index_status='error')) from permitted),'[]'::jsonb),
  'scope','Authorised synced email retained in Multideck; excludes drafts, spam and trash. Ordered by message date, not keyword relevance.') into result;
 return result;
end $$;
revoke all on function public.multideck_dexter_recent_email(text[],text,timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.multideck_dexter_recent_email(text[],text,timestamptz,timestamptz,integer) to authenticated;
commit;
