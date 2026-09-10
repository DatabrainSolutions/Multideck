-- Server-mediated steering. No direct browser grants or service credentials in clients.
create table public."AI_DexterActiveRuns" (
  id uuid primary key,
  company_id uuid not null,
  user_id uuid not null,
  client_session_id uuid not null,
  conversation_id uuid,
  worker_token uuid not null,
  status text not null default 'active' check (status in ('active','completed','failed','expired')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '2 minutes',
  finished_at timestamptz
);
create table public."AI_DexterSteeringInputs" (
  id uuid primary key,
  run_id uuid not null references public."AI_DexterActiveRuns"(id),
  input text not null check (length(btrim(input)) between 1 and 8000),
  status text not null default 'pending' check (status in ('pending','claimed','submitted','queued','incorporated','failed','unconfirmed')),
  response_id text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index on public."AI_DexterSteeringInputs"(run_id,created_at);
alter table public."AI_DexterActiveRuns" enable row level security;
alter table public."AI_DexterSteeringInputs" enable row level security;
revoke all on public."AI_DexterActiveRuns",public."AI_DexterSteeringInputs" from public,anon,authenticated;
grant all on public."AI_DexterActiveRuns",public."AI_DexterSteeringInputs" to service_role;

create function public.multideck_dexter_active_run(
 p_operation text,p_run_id uuid,p_company_id uuid,p_user_id uuid,p_auth_user_id uuid,
 p_client_session_id uuid,p_conversation_id uuid default null,p_worker_token uuid default null,
 p_input_id uuid default null,p_input text default null,p_status text default null,p_response_id text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public."AI_DexterActiveRuns";s public."AI_DexterSteeringInputs";v_inputs jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'server_only' using errcode='42501';end if;
 if not exists(select 1 from public."cmp_Users" where "User_ID"=p_user_id and "Company_ID"=p_company_id
  and "Auth_User_ID"=p_auth_user_id and coalesce("User_AccessStatus",'active')='active')
 then raise exception 'actor_unavailable' using errcode='42501';end if;
 if p_run_id is null or p_client_session_id is null then raise exception 'invalid_run' using errcode='22023';end if;
 if p_operation='begin' then
  if p_worker_token is null then raise exception 'worker_required' using errcode='22023';end if;
  if p_conversation_id is not null and not exists(select 1 from public."AI_Conversations"
   where "AICNV_ID"=p_conversation_id and "AICNV_CompanyID"=p_company_id and "AICNV_OwnerUserID"=p_user_id
   and "AICNV_Channel"='chat' and "AICNV_EndedAt" is null)
  then raise exception 'conversation_unavailable' using errcode='42501';end if;
  insert into public."AI_DexterActiveRuns"(id,company_id,user_id,client_session_id,conversation_id,worker_token)
   values(p_run_id,p_company_id,p_user_id,p_client_session_id,p_conversation_id,p_worker_token)
   on conflict(id) do nothing;
 end if;
 select * into r from public."AI_DexterActiveRuns" where id=p_run_id and company_id=p_company_id
  and user_id=p_user_id and client_session_id=p_client_session_id for update;
 if not found then raise exception 'run_unavailable' using errcode='42501';end if;
 if p_operation in ('begin','claim','transition','finish') and p_worker_token is distinct from r.worker_token
 then raise exception 'worker_unavailable' using errcode='42501';end if;
 if r.status='active' and r.expires_at<=clock_timestamp() then
  update public."AI_DexterActiveRuns" set status='expired',finished_at=clock_timestamp() where id=r.id;
  update public."AI_DexterSteeringInputs" set status=case when status='pending' then 'failed' else 'unconfirmed' end,updated_at=clock_timestamp()
   where run_id=r.id and status in ('pending','claimed','submitted','queued');
  r.status:='expired';
 end if;
 if p_operation='enqueue' then
  -- Request IDs are immutable: a retry reads its original outcome, never repeats it.
  select * into s from public."AI_DexterSteeringInputs" where id=p_input_id;
  if found then
   if s.run_id<>r.id or s.input is distinct from p_input then raise exception 'steering_id_reused' using errcode='22023';end if;
  else
   if r.status<>'active' then raise exception 'run_finished' using errcode='55000';end if;
   if p_input_id is null or p_input is null or length(btrim(p_input)) not between 1 and 8000
    then raise exception 'invalid_steering' using errcode='22023';end if;
   if (select count(*) from public."AI_DexterSteeringInputs" where run_id=r.id)>=4
    then raise exception 'steering_limit' using errcode='54000';end if;
   if exists(select 1 from public."AI_DexterSteeringInputs" where run_id=r.id and status in ('pending','claimed','submitted','queued'))
    then raise exception 'steering_pending' using errcode='55000';end if;
   insert into public."AI_DexterSteeringInputs"(id,run_id,input) values(p_input_id,r.id,p_input) returning * into s;
  end if;
 elsif p_operation='claim' then
  if r.status='active' then
   select * into s from public."AI_DexterSteeringInputs" where run_id=r.id and status='pending' order by created_at limit 1 for update;
   if found then update public."AI_DexterSteeringInputs" set status='claimed',updated_at=clock_timestamp() where id=s.id returning * into s;end if;
  end if;
  return case when s.id is null then null else to_jsonb(s) end;
 elsif p_operation='transition' then
  select * into s from public."AI_DexterSteeringInputs" where id=p_input_id and run_id=r.id for update;
  if not found then raise exception 'steering_unavailable' using errcode='22023';end if;
  if s.status is distinct from p_status then
   if r.status<>'active' or not (
    (s.status='claimed' and p_status in ('submitted','failed','unconfirmed')) or
    (s.status='submitted' and p_status in ('queued','failed','unconfirmed','incorporated')) or
    (s.status='queued' and p_status in ('incorporated','failed','unconfirmed')))
   then raise exception 'invalid_steering_transition' using errcode='55000';end if;
   if p_status='incorporated' and nullif(btrim(p_response_id),'') is null
    then raise exception 'response_required' using errcode='22023';end if;
   update public."AI_DexterSteeringInputs" set status=p_status,response_id=p_response_id,updated_at=clock_timestamp() where id=s.id;
  end if;
 elsif p_operation='finish' then
  if p_status is null or p_status not in ('completed','failed') then raise exception 'invalid_run_status' using errcode='22023';end if;
  if r.status='active' then
   update public."AI_DexterActiveRuns" set status=p_status,finished_at=clock_timestamp() where id=r.id;
   update public."AI_DexterSteeringInputs" set status=case when status='pending' then 'failed' else 'unconfirmed' end,updated_at=clock_timestamp()
    where run_id=r.id and status in ('pending','claimed','submitted','queued');
   r.status:=p_status;
  end if;
 elsif p_operation not in ('begin','status') then raise exception 'invalid_operation' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at),'[]'::jsonb) into v_inputs from public."AI_DexterSteeringInputs" i where i.run_id=r.id;
 return jsonb_build_object('id',r.id,'status',r.status,'expiresAt',r.expires_at,'inputs',v_inputs);
end $$;
revoke all on function public.multideck_dexter_active_run(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.multideck_dexter_active_run(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text) to service_role;
