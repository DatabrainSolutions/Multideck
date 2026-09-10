import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
const bin=process.env.PG_TEST_BIN||'/opt/homebrew/opt/postgresql@17/bin'
const available=spawnSync(join(bin,'initdb'),['--version']).status===0
const sql=readFileSync(new URL('../migrations/20260910003943_dexter_recent_email.sql',import.meta.url),'utf8')
test('recent email preserves permissions, mailbox scope, chronological ordering and retention',{skip:!available},()=>{
 const dir=mkdtempSync(join(tmpdir(),'dexter-recent-'));const data=join(dir,'data');let started=false
 const run=(cmd,args,input)=>{const r=spawnSync(join(bin,cmd),args,{input,encoding:'utf8',timeout:30000});assert.equal(r.status,0,`${r.stderr}\n${r.stdout}`)}
 try {
  run('initdb',['-D',data,'-A','trust','-U','postgres','--no-locale','-E','UTF8'])
  run('pg_ctl',['-D',data,'-l',join(dir,'log'),'-o',`-k ${dir} -c listen_addresses=''`,'-w','start']);started=true
  run('psql',['-h',dir,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],`
   create role anon;create role authenticated;create schema auth;
   create function public._multideck_dexter_context() returns table(user_id uuid,company_id uuid) language sql as $$select '00000000-0000-4000-8000-000000000001'::uuid,'00000000-0000-4000-8000-000000000002'::uuid$$;
   create function public._multideck_dexter_has_permission(uuid,text) returns boolean language sql as $$select coalesce(current_setting('test.denied',true),'')<>$2$$;
   create table permitted(mailbox_id uuid,provider text);
   create function public._multideck_dexter_email_mailboxes(uuid,uuid) returns table(mailbox_id uuid,provider text) language sql as $$select * from permitted$$;
   create table "Comm_Mailboxes"("CommMailbox_ID" uuid primary key,"CommMailbox_LastSyncedAt" timestamptz,"CommMailbox_IndexStatus" text);
   create table "Comm_Messages"("CommMessage_ID" uuid primary key default gen_random_uuid(),"CommMessage_ThreadID" uuid default gen_random_uuid(),"CommMessage_MailboxID" uuid,"CommMessage_ChannelCode" text default 'email',"CommMessage_IsDeleted" boolean default false,"CommMessage_IsDraft" boolean default false,"CommMessage_IsSpam" boolean default false,"CommMessage_IsInbound" boolean default true,"CommMessage_MessageDate" timestamptz,"CommMessage_ReceivedAt" timestamptz,"CommMessage_SentAt" timestamptz,"CommMessage_CreatedAt" timestamptz default now(),"CommMessage_Subject" text,"CommMessage_HasAttachments" boolean default false);
   create table "Comm_MessageFolders"("CommMessageFolder_FolderID" uuid,"CommMessageFolder_MessageID" uuid);
   create table "Comm_MailFolders"("CommMailFolder_ID" uuid,"CommMailFolder_RoleCode" text);
   create table "Comm_MessageRecipients"("CommRecipient_MessageID" uuid,"CommRecipient_Address" text,"CommRecipient_DisplayNameSnapshot" text,"CommRecipient_RecipientTypeCode" text);
   ${sql}
   do $$declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();foreign_box uuid:=gen_random_uuid();r jsonb;trash uuid:=gen_random_uuid();trash_msg uuid;begin
    insert into permitted values(a,'gmail'),(b,'outlook');
    insert into "Comm_Mailboxes" values(a,now(),'complete'),(b,now()-interval '1 hour','pending'),(foreign_box,now(),'complete');
    insert into "Comm_Messages"("CommMessage_MailboxID","CommMessage_Subject","CommMessage_MessageDate") values(a,'first',now()-interval '1 minute'),(b,'second',now()-interval '2 minutes'),(a,'third',now()-interval '3 minutes'),(foreign_box,'private',now()),(a,'expired',now()-interval '13 months');
    insert into "Comm_Messages"("CommMessage_MailboxID","CommMessage_Subject","CommMessage_IsInbound") values(a,'sent',false);
    insert into "Comm_Messages"("CommMessage_MailboxID","CommMessage_Subject","CommMessage_IsDraft") values(a,'draft',true);
    insert into "Comm_Messages"("CommMessage_MailboxID","CommMessage_Subject","CommMessage_IsSpam") values(a,'spam',true);
    insert into "Comm_Messages"("CommMessage_MailboxID","CommMessage_Subject") values(a,'trash') returning "CommMessage_ID" into trash_msg;
    insert into "Comm_MailFolders" values(trash,'trash');insert into "Comm_MessageFolders" values(trash,trash_msg);
    r:=public.multideck_dexter_recent_email(array['gmail','outlook'],'received',null,null,2);
    if r#>>'{items,0,subject}'<>'first' or r#>>'{items,1,subject}'<>'second' or jsonb_array_length(r->'items')<>2 or not (r->>'hasMore')::boolean then raise exception 'Wrong chronological/page result: %',r;end if;
    if jsonb_array_length(r->'coverage')<>2 or not exists(select 1 from jsonb_array_elements(r->'coverage') e where (e->>'stale')::boolean) then raise exception 'Missing stale coverage';end if;
    r:=public.multideck_dexter_recent_email(array['gmail'],'received');
    if jsonb_array_length(r->'items')<>2 or r#>>'{items,1,subject}'<>'third' then raise exception 'Wrong provider or excluded mail leaked: %',r;end if;
    r:=public.multideck_dexter_recent_email(array['gmail'],'sent');if r#>>'{items,0,subject}'<>'sent' or jsonb_array_length(r->'items')<>1 then raise exception 'Wrong sent result';end if;
    r:=public.multideck_dexter_recent_email(array['gmail'],'received',now()+interval '1 day');if jsonb_array_length(r->'items')<>0 or jsonb_array_length(r->'coverage')<>1 then raise exception 'Empty coverage missing';end if;
    r:=public.multideck_dexter_recent_email(array['gmail'],'received',now()-interval '14 months',now()-interval '12 months');if jsonb_array_length(r->'items')<>0 or not (r->>'outsideRetentionWindow')::boolean then raise exception 'Retention bypass';end if;
    perform set_config('test.denied','Email.AIRead',true);begin perform public.multideck_dexter_recent_email(array['gmail'],'received');raise exception 'AI permission bypass';exception when insufficient_privilege then null;end;
    perform set_config('test.denied','Email.Read',true);begin perform public.multideck_dexter_recent_email(array['gmail'],'received');raise exception 'Read permission bypass';exception when insufficient_privilege then null;end;
    perform set_config('test.denied','',true);
    delete from permitted; r:=public.multideck_dexter_recent_email(array['gmail'],'received');if jsonb_array_length(r->'items')<>0 then raise exception 'Revoked mailbox leaked';end if;
    begin perform public.multideck_dexter_recent_email(array['invalid'],'received');raise exception 'Invalid provider accepted';exception when invalid_parameter_value then null;end;
    if has_function_privilege('anon','public.multideck_dexter_recent_email(text[],text,timestamptz,timestamptz,integer)','execute') then raise exception 'Anonymous access';end if;
   end $$;
  `)
 } finally {if(started)spawnSync(join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']);rmSync(dir,{recursive:true,force:true})}
})
