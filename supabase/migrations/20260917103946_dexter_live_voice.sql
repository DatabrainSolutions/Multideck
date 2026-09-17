begin;

create table public."AI_DexterVoicePreferences" (
  user_id uuid primary key references public."cmp_Users"("User_ID") on delete cascade,
  voice text not null default 'vesper' check (voice in ('vesper','willow','stone','quartz','ripple','gleam','meridian','beacon','delta','cinder')),
  updated_at timestamptz not null default now()
);
create table public."AI_DexterVoiceSessions" (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null references public."cmp_Users"("User_ID") on delete cascade,
  conversation_id uuid references public."AI_Conversations"("AICNV_ID") on delete cascade,
  egress_id uuid not null references public."AI_DexterModelEgressAudit"("AIDexterEgress_ID"),
  day date not null default (now() at time zone 'Europe/London')::date,
  voice text not null,
  preview boolean not null default false,
  reserved_seconds integer not null check (reserved_seconds between 1 and 300),
  seconds numeric not null default 0 check (seconds >= 0),
  usage_confirmed boolean not null default false,
  provider_id text,
  transcript jsonb not null default '[]'::jsonb check (jsonb_typeof(transcript) = 'array'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  end_reason text
);
create index on public."AI_DexterVoiceSessions"(user_id, day);
create index on public."AI_DexterVoiceSessions"(company_id, created_at);
alter table public."AI_DexterVoicePreferences" enable row level security;
alter table public."AI_DexterVoiceSessions" enable row level security;
revoke all on public."AI_DexterVoicePreferences", public."AI_DexterVoiceSessions" from public, anon, authenticated;
grant all on public."AI_DexterVoicePreferences", public."AI_DexterVoiceSessions" to service_role;

create function public.multideck_voice_preferences(p_voice text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare ctx record; selected text; used numeric; reset_at timestamptz;
begin
  select * into ctx from public._multideck_dexter_context();
  if not public._multideck_dexter_has_permissions(ctx.user_id,'["AgentDexter.Manage"]'::jsonb) then
    raise exception 'Voice access unavailable' using errcode='42501';
  end if;
  if p_voice is not null then
    insert into public."AI_DexterVoicePreferences"(user_id,voice) values(ctx.user_id,p_voice)
    on conflict(user_id) do update set voice=excluded.voice,updated_at=now();
  end if;
  select voice into selected from public."AI_DexterVoicePreferences" where user_id=ctx.user_id;
  select coalesce(sum(case when ended_at is null then reserved_seconds else seconds end),0) into used
    from public."AI_DexterVoiceSessions" where user_id=ctx.user_id and company_id=ctx.company_id
      and day=(now() at time zone 'Europe/London')::date;
  reset_at:=((now() at time zone 'Europe/London')::date+1)::timestamp at time zone 'Europe/London';
  return jsonb_build_object('voice',coalesce(selected,'vesper'),'dailySeconds',300,
    'remainingSeconds',greatest(0,300-ceil(used)),'resetsAt',reset_at);
end $$;
revoke all on function public.multideck_voice_preferences(text) from public,anon;
grant execute on function public.multideck_voice_preferences(text) to authenticated;

create function public.multideck_voice_reserve(p_company_id uuid,p_user_id uuid,p_conversation_id uuid,p_voice text,p_preview boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare used numeric; allowed integer; state jsonb; remaining numeric; pending numeric; ledger uuid:=gen_random_uuid(); session_id uuid:=gen_random_uuid();
begin
  if auth.role() is distinct from 'service_role' then raise exception 'server_only' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text,719));
  if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id
      and coalesce("User_AccessStatus",'active')='active')
    or not public._multideck_dexter_has_permissions(p_user_id,'["AgentDexter.Manage"]'::jsonb)
    then raise exception 'operator_unavailable' using errcode='42501';end if;
  if p_voice not in ('vesper','willow','stone','quartz','ripple','gleam','meridian','beacon','delta','cinder') then
    raise exception 'invalid_voice' using errcode='22023';end if;
  if p_conversation_id is not null and not exists(select 1 from public."AI_Conversations" where "AICNV_ID"=p_conversation_id
    and "AICNV_CompanyID"=p_company_id and "AICNV_OwnerUserID"=p_user_id and "AICNV_Channel"='chat' and "AICNV_EndedAt" is null)
    then raise exception 'conversation_unavailable' using errcode='42501';end if;
  if exists(select 1 from public."AI_DexterVoiceSessions" where user_id=p_user_id and ended_at is null and expires_at>now())
    then raise exception 'voice_already_active' using errcode='P0001';end if;
  select coalesce(sum(case when ended_at is null then reserved_seconds else seconds end),0) into used
    from public."AI_DexterVoiceSessions" where user_id=p_user_id and company_id=p_company_id
      and day=(now() at time zone 'Europe/London')::date;
  allowed:=least(case when p_preview then 18 else 300 end,greatest(0,300-ceil(used))::integer,
    floor(extract(epoch from (((now() at time zone 'Europe/London')::date+1)::timestamp at time zone 'Europe/London')-now()))::integer);
  if allowed<1 then raise exception 'voice_daily_limit' using errcode='P0001';end if;
  state:=public._multideck_dexter_allowance_state(p_company_id);
  if not coalesce((state->>'usageAllowed')::boolean,false) then raise exception 'usage_allowance_reached' using errcode='P0001';end if;
  remaining:=greatest(coalesce((state->>'includedUsageRemainingGbp')::numeric,0),0)
    +case when coalesce((state->>'extraUsageEnabled')::boolean,false) then coalesce((state->>'extraUsageRemainingGbp')::numeric,1000000000) else 0 end;
  select coalesce(sum("AIDexterEgress_EstimatedCostGBP"),0) into pending from public."AI_DexterModelEgressAudit"
    where "AIDexterEgress_CompanyID"=p_company_id and "AIDexterEgress_Outcome"='attempted'
      and "AIDexterEgress_Provider"='openai'
      and "AIDexterEgress_CreatedAt">now()-interval '10 minutes';
  allowed:=least(allowed,greatest(0,floor((remaining-pending)*60*1.3/0.05))::integer);
  if allowed<1 then raise exception 'usage_allowance_reached' using errcode='P0001';end if;
  insert into public."AI_DexterModelEgressAudit"("AIDexterEgress_ID","AIDexterEgress_CompanyID","AIDexterEgress_UserID",
    "AIDexterEgress_ConversationID","AIDexterEgress_Provider","AIDexterEgress_Model","AIDexterEgress_Purpose",
    "AIDexterEgress_DataCategoriesJSON","AIDexterEgress_EstimatedCostGBP","AIDexterEgress_Outcome")
    values(ledger,p_company_id,p_user_id,p_conversation_id,'openai','gpt-live-1','dexter_voice','["operator_instruction","business_record"]',
      round(allowed::numeric/60*0.05/1.3,6),'attempted');
  insert into public."AI_DexterVoiceSessions"(id,company_id,user_id,conversation_id,egress_id,voice,preview,reserved_seconds,expires_at)
    values(session_id,p_company_id,p_user_id,p_conversation_id,ledger,p_voice,p_preview,allowed,now()+make_interval(secs=>allowed+30));
  return jsonb_build_object('id',session_id,'seconds',allowed);
end $$;
revoke all on function public.multideck_voice_reserve(uuid,uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.multideck_voice_reserve(uuid,uuid,uuid,text,boolean) to service_role;

-- Only server-observed usage can settle money or the daily allowance. A lost
-- upstream retains conservative time with explicit unconfirmed provenance.
create function public.multideck_voice_settle(p_session_id uuid,p_company_id uuid,p_user_id uuid,p_seconds numeric,p_confirmed boolean,
  p_provider_id text,p_transcript jsonb,p_reason text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare entry public."AI_DexterVoiceSessions"; billed numeric;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'server_only' using errcode='42501';end if;
  select * into entry from public."AI_DexterVoiceSessions" where id=p_session_id and company_id=p_company_id and user_id=p_user_id for update;
  if not found or entry.ended_at is not null then return;end if;
  billed:=greatest(0,coalesce(p_seconds,entry.reserved_seconds));
  if billed>entry.reserved_seconds+15 then raise exception 'invalid_voice_usage';end if;
  update public."AI_DexterVoiceSessions" set seconds=billed,usage_confirmed=p_confirmed,provider_id=left(p_provider_id,240),
    transcript=p_transcript,ended_at=now(),end_reason=left(p_reason,120) where id=entry.id;
  update public."AI_DexterModelEgressAudit" set "AIDexterEgress_ActualCostGBP"=round(billed/60*0.05/1.3,6),
    "AIDexterEgress_ProviderRequestID"=left(p_provider_id,240),"AIDexterEgress_Outcome"=case when billed>0 then 'succeeded' else 'failed' end,
    "AIDexterEgress_CompletedAt"=now(),"AIDexterEgress_ErrorCode"=case when p_confirmed then null else 'voice_usage_unconfirmed' end
    where "AIDexterEgress_ID"=entry.egress_id;
  if billed>0 then perform public._multideck_emit_usage_watch_signal(p_company_id,'AI_DexterVoiceSessions',entry.id,'voice');end if;
end $$;
revoke all on function public.multideck_voice_settle(uuid,uuid,uuid,numeric,boolean,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.multideck_voice_settle(uuid,uuid,uuid,numeric,boolean,text,jsonb,text) to service_role;

-- A terminated edge worker cannot erase spend or strand the next day's access.
-- Keep duration records for metering; only private captions expire after 30 days.
create function public.multideck_voice_reconcile(p_company_id uuid default null)
returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare entry public."AI_DexterVoiceSessions"; reconciled integer:=0;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'server_only' using errcode='42501';end if;
  for entry in select * from public."AI_DexterVoiceSessions" where ended_at is null and expires_at<now()
    and (p_company_id is null or company_id=p_company_id) order by expires_at limit 200 for update skip locked loop
    perform public.multideck_voice_settle(entry.id,entry.company_id,entry.user_id,entry.reserved_seconds,false,
      entry.provider_id,entry.transcript,'worker_expired');
    reconciled:=reconciled+1;
  end loop;
  update public."AI_DexterVoiceSessions" set transcript='[]'::jsonb where id in (
    select id from public."AI_DexterVoiceSessions" where created_at<now()-interval '30 days' and transcript<>'[]'::jsonb
      and (p_company_id is null or company_id=p_company_id) order by created_at limit 200);
  return reconciled;
end $$;
revoke all on function public.multideck_voice_reconcile(uuid) from public,anon,authenticated;
grant execute on function public.multideck_voice_reconcile(uuid) to service_role;

-- Ordinary model requests must not spend money already reserved by a live call.
-- Preserve all intervening gateway changes, with a guarded surgical replacement.
do $patch$
declare signature regprocedure:='public.multideck_dexter_reserve_model_egress(uuid,uuid,uuid,text,text,text,jsonb,integer,bigint,integer,integer)'::regprocedure;
  definition text; marker text:='    if v_estimated > v_remaining then';
begin
  definition:=pg_get_functiondef(signature);
  if position(marker in definition)=0 then raise exception 'Voice gateway reservation patch no longer matches';end if;
  execute replace(definition,marker,$body$
    v_remaining:=v_remaining-coalesce((select sum("AIDexterEgress_EstimatedCostGBP")
      from public."AI_DexterModelEgressAudit" where "AIDexterEgress_CompanyID"=p_company_id
        and "AIDexterEgress_Purpose"='dexter_voice' and "AIDexterEgress_Outcome"='attempted'),0);
    if v_estimated > v_remaining then$body$);
end $patch$;

-- Extend the current category implementation without rewriting its evolving
-- tracking, customs and document definitions. Both Admin and Dexter call it.
alter function public._multideck_usage_categories(uuid) rename to _multideck_usage_categories_before_voice;
create function public._multideck_usage_categories(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb; minutes numeric; included numeric;
begin
  result:=public._multideck_usage_categories_before_voice(p_company_id);
  select coalesce(sum(seconds),0)/60 into minutes from public."AI_DexterVoiceSessions"
    where company_id=p_company_id and ended_at is not null and created_at>=date_trunc('month',now())
      and created_at<date_trunc('month',now())+interval '1 month';
  included:=coalesce((result->>'seatCount')::integer,25)*5*extract(day from date_trunc('month',now())+interval '1 month - 1 day');
  return jsonb_set(result,'{categories}',(result->'categories')||jsonb_build_array(jsonb_build_object(
    'id','voice','label','Voice','description','Speak to Dexter. Five minutes per person each day; voice costs also count towards AI usage.',
    'unit','minutes','included',included,'used',round(minutes,1),'extra',greatest(minutes-included,0),
    'usedPercent',round(minutes/nullif(included,0)*100,2),'enabled',true,'dataState','live')));
end $$;
revoke all on function public._multideck_usage_categories(uuid),public._multideck_usage_categories_before_voice(uuid) from public,anon,authenticated;

update public."sys_AIDexterDataDomains" set "AIDexterDomain_Description"='Workspace usage for AI (including voice), voice minutes, OCR, tracking, generated documents and enabled customs services.'
  where "AIDexterDomain_Code"='usage';
update public."sys_AIDexterWatchCapabilities" set "AIDexterWatchCapability_Description"='Deterministic included and extra usage changes for AI, voice minutes, OCR, tracking, documents and enabled customs services. Filter category to voice for speaking time.'
  where "AIDexterWatchCapability_Code"='usage';

comment on table public."AI_DexterVoiceSessions" is 'Private per-operator voice captions and duration. No audio stored. Captions expire after 30 days; duration and financial egress audit retained for usage accounting. UTC timestamps; allowance resets at midnight Europe/London.';
commit;
