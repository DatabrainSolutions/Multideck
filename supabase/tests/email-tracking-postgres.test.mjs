import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
const bin=process.env.PG_TEST_BIN||'/opt/homebrew/opt/postgresql@17/bin'
const read=name=>readFileSync(new URL(`../migrations/${name}.sql`,import.meta.url),'utf8')
function extract(source,name){const start=source.indexOf(`create or replace function public.${name}(`);assert.ok(start>=0);return source.slice(start,source.indexOf('$$;',source.indexOf('as $$',start))+3)}
const foundation=read('20260802140000_dexter_watching_for_you')
const watchTables=foundation.slice(foundation.indexOf('create table if not exists'),foundation.indexOf('create index if not exists'))
const tokenSource=read('20260803151000_inbox_open_tracking')
const tokenTable=tokenSource.slice(tokenSource.indexOf('create table if not exists'),tokenSource.indexOf('create or replace function'))

test('PostgreSQL tracking lifecycle, deduplication, expiry, private reads and mailbox-safe watch pause/resume',()=>{
 assert.equal(spawnSync(join(bin,'initdb'),['--version']).status,0,'PostgreSQL is required')
 const dir=mkdtempSync(join(tmpdir(),'email-tracking-pg-')),data=join(dir,'data');let started=false
 const run=(cmd,args,input)=>{const r=spawnSync(join(bin,cmd),args,{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,`${r.stderr}\n${r.stdout}`);return r.stdout}
 try{
  run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8'])
  run('pg_ctl',['-D',data,'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']);started=true
  run('psql',['-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],`
   create role anon;create role authenticated;create role service_role;
   create table public."cmp_Company"("Company_ID" uuid primary key);
   create table public."cmp_Users"("User_ID" uuid primary key,"Company_ID" uuid,allowed boolean default true);
   create table public."Comm_ProviderConnections"("CommConn_ID" uuid primary key,"CommConn_UserID" uuid);
   create table public."Comm_Mailboxes"("CommMailbox_ID" uuid primary key,"CommMailbox_ConnectionID" uuid);
   create table public."Comm_Messages"("CommMessage_ID" uuid primary key,"CommMessage_MailboxID" uuid,"CommMessage_ProviderMessageID" varchar,
    "CommMessage_Subject" text,"CommMessage_StatusCode" varchar default 'sent',"CommMessage_SentAt" timestamptz default now(),
    "CommMessage_DeliveredAt" timestamptz,"CommMessage_ReadAt" timestamptz,"CommMessage_UpdatedAt" timestamptz,
    "CommMessage_IsInbound" boolean default false,"CommMessage_IsDraft" boolean default false,"CommMessage_IsDeleted" boolean default false,
    "CommMessage_ReplyToMessageID" uuid,"CommMessage_ReceivedAt" timestamptz,"CommMessage_IsBodyRedacted" boolean default false);
   create table public."Comm_SendRequests"("CommSend_ID" uuid primary key,"CommSend_MessageID" uuid,"CommSend_StatusCode" varchar default 'sent',"CommSend_UpdatedAt" timestamptz);
   create table public."Comm_MailFolders"("CommMailFolder_ID" uuid primary key,"CommMailFolder_MailboxID" uuid,"CommMailFolder_RoleCode" text);
   create table public."Comm_MessageFolders"("CommMessageFolder_MessageID" uuid,"CommMessageFolder_FolderID" uuid,"CommMessageFolder_IsPrimary" boolean,"CommMessageFolder_AddedAt" timestamptz,primary key("CommMessageFolder_MessageID","CommMessageFolder_FolderID"));
   create table public."Comm_DeliveryEvents"("CommDelivery_ID" uuid primary key default gen_random_uuid(),"CommDelivery_MessageID" uuid,"CommDelivery_SendID" uuid,
    "CommDelivery_ConnectionID" uuid,"CommDelivery_EventTypeCode" varchar,"CommDelivery_StatusCode" varchar,"CommDelivery_ProviderEventID" varchar,
    "CommDelivery_ProviderMessageID" varchar,"CommDelivery_EventAt" timestamptz,"CommDelivery_PayloadJSON" jsonb);
   create unique index event_unique on public."Comm_DeliveryEvents"("CommDelivery_ConnectionID","CommDelivery_ProviderEventID") where "CommDelivery_ConnectionID" is not null and "CommDelivery_ProviderEventID" is not null;
   ${tokenTable}
   ${read('20260810084103_inbox_delivery_event_timestamp_accuracy')}
   ${extract(read('20260810075358_inbox_email_tracking_event_integrity'),'comm_record_tracking_open')}
   revoke all on function public.comm_record_tracking_open(text) from public,anon,authenticated;
   grant execute on function public.comm_record_tracking_open(text) to service_role;
   ${watchTables}
   alter table public."AI_DexterWatches" add column "AIDexterWatch_HealthStatusCode" text,add column "AIDexterWatch_LastSourceCheckAt" timestamptz,add column "AIDexterWatch_LastHealthError" text;
   create table public."Comm_Notifications"("CommNotif_UserID" uuid,"CommNotif_Title" text,"CommNotif_Body" text,"CommNotif_TargetTable" text,"CommNotif_TargetID" uuid,"CommNotif_LinkTypeCode" text,"CommNotif_MetadataJSON" jsonb,"CommNotif_CreatedBy" uuid);
   create function public._multideck_dexter_email_mailboxes(uuid,uuid) returns table(mailbox_id uuid) language sql as $$
    select m."CommMailbox_ID" from public."Comm_Mailboxes" m join public."Comm_ProviderConnections" c on c."CommConn_ID"=m."CommMailbox_ConnectionID"
    join public."cmp_Users" u on u."User_ID"=c."CommConn_UserID" where u."User_ID"=$1 and u."Company_ID"=$2 and u.allowed$$;
   ${extract(read('20260802153000_dexter_email_sender_attachment_watches'),'_multideck_dexter_watch_matches')}
   ${extract(read('20260802150818_dexter_email_watch_reliability'),'_multideck_dexter_evaluate_watch_signal')}
   -- A minimal authorised-read shell verifies the migration enriches only its selected rows.
   create function public.multideck_dexter_read_email_thread(text[],uuid,timestamptz) returns jsonb language sql as $$
    select jsonb_build_object('bodyWasRedacted', page."CommMessage_IsBodyRedacted", 'messageId',page."CommMessage_ID") from public."Comm_Messages" page where page."CommMessage_ID"=$2$$;
   insert into public."sys_AIDexterWatchCapabilities"("AIDexterWatchCapability_Code","AIDexterWatchCapability_Name","AIDexterWatchCapability_Description") values('email','Email','Email');
   ${read('20260911141000_email_tracking_evidence_parity')}
   ${read('20260911153500_sent_draft_folder_reconciliation')}
   create trigger signal after insert on public."Comm_DeliveryEvents" for each row execute function public._multideck_dexter_crm_essential_signal('email');
   create trigger evaluate after insert on public."AI_DexterWatchSignals" for each row execute function public._multideck_dexter_evaluate_watch_signal();
   create function check_events(n int) returns void language plpgsql as $$begin
    if (select count(*) from public."AI_DexterWatchEvents")<>n or (select count(*) from public."Comm_Notifications")<>n then raise exception 'Expected % watch events, got %',n,(select count(*) from public."AI_DexterWatchEvents");end if;
    if exists(select 1 from public."AI_DexterWatches" where "AIDexterWatch_HealthStatusCode"='error') then raise exception 'Watch evaluation failed: %',(select "AIDexterWatch_LastHealthError" from public."AI_DexterWatches" where "AIDexterWatch_HealthStatusCode"='error' limit 1);end if;
   end$$;
   do $$declare box uuid:=gen_random_uuid();other_box uuid:=gen_random_uuid();m uuid:=gen_random_uuid();d uuid:=gen_random_uuid();s uuid:=gen_random_uuid();label uuid:=gen_random_uuid();foreign_d uuid:=gen_random_uuid();begin
    insert into public."Comm_MailFolders" values(d,box,'drafts'),(s,box,'sent'),(label,box,'custom'),(foreign_d,other_box,'drafts');
    insert into public."Comm_Messages"("CommMessage_ID","CommMessage_MailboxID","CommMessage_StatusCode","CommMessage_IsDraft","CommMessage_SentAt") values(m,box,'draft',true,null);
    insert into public."Comm_MessageFolders" values(m,d,false,now()),(m,label,false,now()),(m,foreign_d,false,now());
    update public."Comm_Messages" set "CommMessage_StatusCode"='sending' where "CommMessage_ID"=m;
    if not exists(select 1 from public."Comm_MessageFolders" where "CommMessageFolder_MessageID"=m and "CommMessageFolder_FolderID"=d) then raise exception 'Pending send lost draft label';end if;
    update public."Comm_Messages" set "CommMessage_StatusCode"='failed',"CommMessage_IsDraft"=false where "CommMessage_ID"=m;
    if not exists(select 1 from public."Comm_MessageFolders" where "CommMessageFolder_MessageID"=m and "CommMessageFolder_FolderID"=d) then raise exception 'Failed send lost draft label';end if;
    update public."Comm_Messages" set "CommMessage_StatusCode"='sent',"CommMessage_SentAt"=now() where "CommMessage_ID"=m;
    if exists(select 1 from public."Comm_MessageFolders" where "CommMessageFolder_MessageID"=m and "CommMessageFolder_FolderID"=d) then raise exception 'Confirmed send retained draft label';end if;
    if (select count(*) from public."Comm_MessageFolders" where "CommMessageFolder_MessageID"=m and "CommMessageFolder_FolderID" in(s,label,foreign_d))<>3 then raise exception 'Sent label missing or unrelated label changed';end if;
    update public."Comm_Messages" set "CommMessage_StatusCode"='sent' where "CommMessage_ID"=m;
    if (select count(*) from public."Comm_MessageFolders" where "CommMessageFolder_MessageID"=m)<>3 then raise exception 'Repeated reconciliation duplicated labels';end if;
    insert into public."Comm_MessageFolders" values(m,d,false,now());
    update public."Comm_Messages" set "CommMessage_IsInbound"=true,"CommMessage_StatusCode"='sent' where "CommMessage_ID"=m;
    if not exists(select 1 from public."Comm_MessageFolders" where "CommMessageFolder_MessageID"=m and "CommMessageFolder_FolderID"=d) then raise exception 'Inbound message was changed';end if;
    update public."Comm_Messages" set "CommMessage_IsInbound"=false,"CommMessage_IsDeleted"=true,"CommMessage_StatusCode"='sent' where "CommMessage_ID"=m;
    if not exists(select 1 from public."Comm_MessageFolders" where "CommMessageFolder_MessageID"=m and "CommMessageFolder_FolderID"=d) then raise exception 'Deleted message was changed';end if;
    update public."Comm_Messages" set "CommMessage_IsDeleted"=false,"CommMessage_SentAt"=null where "CommMessage_ID"=m;
    if not exists(select 1 from public."Comm_MessageFolders" where "CommMessageFolder_MessageID"=m and "CommMessageFolder_FolderID"=d) then raise exception 'Unconfirmed message was changed';end if;
    update public."Comm_Messages" set "CommMessage_SentAt"=now() where "CommMessage_ID"=m;
    insert into public."Comm_MessageFolders" values(m,d,false,now());
    execute $repair$${read('20260911153500_sent_draft_folder_reconciliation').slice(read('20260911153500_sent_draft_folder_reconciliation').indexOf('update public."Comm_Messages" message'))}$repair$;
    if exists(select 1 from public."Comm_MessageFolders" where "CommMessageFolder_MessageID"=m and "CommMessageFolder_FolderID"=d) then raise exception 'Historical confirmed send was not repaired';end if;
    if has_function_privilege('authenticated','public.comm_reconcile_sent_draft_folders()','execute') or has_function_privilege('anon','public.comm_reconcile_sent_draft_folders()','execute') then raise exception 'Reconciliation function exposed';end if;
   end$$;
   do $$declare c uuid:=gen_random_uuid();u uuid:=gen_random_uuid();other_u uuid:=gen_random_uuid();other_c uuid:=gen_random_uuid();conn uuid:=gen_random_uuid();box uuid:=gen_random_uuid();m uuid:=gen_random_uuid();s uuid:=gen_random_uuid();w uuid;e jsonb;begin
    insert into public."cmp_Company" values(c),(other_c);insert into public."cmp_Users" values(u,c,true),(other_u,other_c,true);
    insert into public."Comm_ProviderConnections" values(conn,u);insert into public."Comm_Mailboxes" values(box,conn);
    insert into public."Comm_Messages"("CommMessage_ID","CommMessage_MailboxID","CommMessage_Subject") values(m,box,'Tracking QA');
    insert into public."Comm_SendRequests"("CommSend_ID","CommSend_MessageID")values(s,m);
    insert into public."Comm_MessageTrackingTokens"("CommTrack_MessageID","CommTrack_SendID","CommTrack_RecipientHashSHA256","CommTrack_TokenHashSHA256","CommTrack_ExpiresAt")values(m,s,repeat('b',64),repeat('a',64),now()+interval '1 day');
    insert into public."AI_DexterWatches"("AIDexterWatch_CompanyID","AIDexterWatch_OwnerUserID","AIDexterWatch_CapabilityCode","AIDexterWatch_Title","AIDexterWatch_Summary","AIDexterWatch_Request","AIDexterWatch_RuleJSON")values(c,u,'email','QA','QA','QA','{"field":"deliveryStatus","operator":"eq","value":"opened"}')returning "AIDexterWatch_ID" into w;
    if public.comm_email_delivery_evidence(m)->>'status'<>'no_open_signal' then raise exception 'Unopened state';end if;
    perform public.comm_record_tracking_open(repeat('a',64));perform check_events(1);
    perform public.comm_record_tracking_open(repeat('a',64));perform check_events(1);
    if (select count(*) from public."Comm_DeliveryEvents")<>1 then raise exception 'Duplicate first-open event';end if;
    if (select "CommTrack_OpenCount" from public."Comm_MessageTrackingTokens")<>2 then raise exception 'Repeat-load count';end if;
    e:=public.comm_email_delivery_evidence(m);if e->>'status'<>'opened_estimated' or e->>'confidence'<>'estimated' then raise exception 'Open evidence';end if;
    if public.multideck_dexter_read_email_thread(array['gmail'],m,null)->'delivery'->>'status'<>'opened_estimated' then raise exception 'Dexter read parity';end if;
    if exists(select 1 from public."Comm_Messages" where "CommMessage_ReadAt" is not null or "CommMessage_StatusCode"<>'sent') then raise exception 'Image changed mailbox read state';end if;
    if exists(select 1 from public."AI_DexterWatchEvents" where "AIDexterWatchEvent_Body" not like 'Email engagement: opened (estimated)%') then raise exception 'Misleading notification';end if;
    update public."AI_DexterWatches" set "AIDexterWatch_RuleJSON"='{"field":"deliveryStatus","operator":"eq","value":"replied"}',"AIDexterWatch_StatusCode"='paused';
    perform public."Comm_RecordDeliveryEvent"(m,s,'replied',null,'paused','{}');perform check_events(1);
    update public."AI_DexterWatches" set "AIDexterWatch_StatusCode"='active';
    perform public."Comm_RecordDeliveryEvent"(m,s,'delivered',null,'delivery','{}');perform check_events(1);
    perform public."Comm_RecordDeliveryEvent"(m,s,'replied',null,'reply','{}');perform check_events(2);
    perform public."Comm_RecordDeliveryEvent"(m,s,'replied',null,'reply','{}');perform check_events(2);
    if public.comm_email_delivery_evidence(m)->>'confidence'<>'confirmed' then raise exception 'Reply downgraded by image estimate';end if;
    update public."AI_DexterWatches" set "AIDexterWatch_RuleJSON"='{"field":"deliveryStatus","operator":"eq","value":"bounced"}';
    update public."cmp_Users" set allowed=false where "User_ID"=u;
    perform public."Comm_RecordDeliveryEvent"(m,s,'bounced',null,'denied','{}');perform check_events(2);
    update public."cmp_Users" set allowed=true where "User_ID"=u;
    update public."AI_DexterWatches" set "AIDexterWatch_OwnerUserID"=other_u;
    perform public."Comm_RecordDeliveryEvent"(m,s,'bounced',null,'foreign-user','{}');perform check_events(2);
    update public."AI_DexterWatches" set "AIDexterWatch_OwnerUserID"=u,"AIDexterWatch_CompanyID"=other_c;
    perform public."Comm_RecordDeliveryEvent"(m,s,'bounced',null,'foreign-company','{}');perform check_events(2);
    update public."Comm_MessageTrackingTokens" set "CommTrack_ExpiresAt"=now()-interval '1 day';
    if public.comm_record_tracking_open(repeat('a',64)) then raise exception 'Expired token accepted';end if;
    update public."Comm_MessageTrackingTokens" set "CommTrack_ExpiresAt"=now()+interval '1 day',"CommTrack_IsActive"=false;
    if public.comm_record_tracking_open(repeat('a',64)) or public.comm_record_tracking_open('unknown') then raise exception 'Inactive or invalid token accepted';end if;
    if has_function_privilege('authenticated','public.comm_email_delivery_evidence(uuid)','execute') or has_function_privilege('anon','public.comm_record_tracking_open(text)','execute') then raise exception 'Private evidence exposed';end if;
   end$$;
  `)
 }finally{if(started)spawnSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true})}
})
