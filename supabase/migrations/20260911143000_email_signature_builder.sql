begin;
insert into public."sys_Permissions" ("sys_Permission_Value","sys_Permission_Group","sys_Permission_Name","sys_Permission_Description")
values ('Email.Signatures.Manage','Email','Manage email signatures','Design and assign company email signatures and control personal customisation.')
on conflict ("sys_Permission_Value") do nothing;
insert into public."sys_UserRole_Permissions" ("sys_UserRole_ID","sys_Permission_ID")
select r."sys_UserRole_ID",p."sys_Permission_ID" from public."sys_UserRoles" r cross join public."sys_Permissions" p
where lower(r."sys_UserRole_Name") in ('administrator','company admin','company manager') and p."sys_Permission_Value"='Email.Signatures.Manage'
on conflict do nothing;

create table public.email_signature_policies (
 company_id uuid primary key references public."cmp_Company"("Company_ID"), allow_customisation boolean not null default true,
 website text not null default '', revision integer not null default 1, updated_at timestamptz not null default now()
);
create table public.email_signature_profiles (
 user_id uuid primary key references public."cmp_Users"("User_ID"), company_id uuid not null references public."cmp_Company"("Company_ID"),
 allow_customisation boolean, phone text not null default '', mobile text not null default '', updated_at timestamptz not null default now()
);
create table public.email_signature_templates (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public."cmp_Company"("Company_ID"),
 owner_user_id uuid references public."cmp_Users"("User_ID"), source_template_id uuid references public.email_signature_templates(id),
 name text not null check(length(name) between 1 and 120), document jsonb not null, revision integer not null default 1,
 assignments jsonb not null default '[]', published_document jsonb, published_assignments jsonb not null default '[]', published_revision integer,
 archived boolean not null default false, created_by uuid not null references public."cmp_Users"("User_ID"), updated_by uuid not null references public."cmp_Users"("User_ID"),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (jsonb_typeof(document)='object'), check (jsonb_typeof(assignments)='array'), check (pg_column_size(document)<200000)
);
create index on public.email_signature_templates(company_id,owner_user_id) where not archived;
create table public.email_signature_versions (
 id uuid primary key default gen_random_uuid(), template_id uuid not null references public.email_signature_templates(id), company_id uuid not null,
 revision integer not null, document jsonb not null, assignments jsonb not null, actor_id uuid not null, created_at timestamptz not null default now(), unique(template_id,revision)
);
create table public.email_signature_assets (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, owner_user_id uuid, created_by uuid not null,
 path text not null unique, mime_type text not null check(mime_type in ('image/png','image/jpeg','image/webp','image/gif')), file_name text not null,
 size_bytes integer not null check(size_bytes between 1 and 2097152), created_at timestamptz not null default now()
);
create table public.email_signature_defaults (
 user_id uuid not null references public."cmp_Users"("User_ID"), mailbox_id uuid not null references public."Comm_Mailboxes"("CommMailbox_ID"),
 template_id uuid references public.email_signature_templates(id), primary key(user_id,mailbox_id)
);
create table public.email_signature_events (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, actor_id uuid not null, owner_user_id uuid,
 template_id uuid, kind text not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);
-- Private communication data stays behind the authenticated, permission-checked Edge API.
do $$ declare t text; begin foreach t in array array['email_signature_policies','email_signature_profiles','email_signature_templates','email_signature_versions','email_signature_assets','email_signature_defaults','email_signature_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop; end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('email-signatures','email-signatures',false,2097152,array['image/png','image/jpeg','image/webp','image/gif']) on conflict(id) do nothing;

create or replace function public.email_signature_commit(p_actor uuid,p_id uuid,p_expected integer,p_payload jsonb,p_publish boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u record; old public.email_signature_templates%rowtype; saved public.email_signature_templates%rowtype; manager boolean; allow_edit boolean; personal boolean;
begin
 select * into u from public."cmp_Users" where "User_ID"=p_actor and "Auth_User_ID" is not null and coalesce("User_AccessStatus",'active')='active';
 if not found or u."Company_ID" is null then raise exception 'Active company profile required' using errcode='42501'; end if;
 select exists(select 1 from public."cmp_Users_Roles" ur join public."sys_UserRole_Permissions" rp using("sys_UserRole_ID") join public."sys_Permissions" p using("sys_Permission_ID") where ur."User_ID"=p_actor and p."sys_Permission_Value"='Email.Signatures.Manage') into manager;
 select coalesce((select allow_customisation from public.email_signature_profiles where user_id=p_actor),(select allow_customisation from public.email_signature_policies where company_id=u."Company_ID"),true) into allow_edit;
 if not manager and not exists(select 1 from public."cmp_Users_Roles" ur join public."sys_UserRole_Permissions" rp using("sys_UserRole_ID") join public."sys_Permissions" p using("sys_Permission_ID") where ur."User_ID"=p_actor and p."sys_Permission_Value"='Email.Send') then raise exception 'Email permission required' using errcode='42501';end if;
 -- Serialise assignment and policy changes for this company, including separate templates.
 perform pg_advisory_xact_lock(hashtextextended(u."Company_ID"::text,1430));
 select * into old from public.email_signature_templates where id=p_id for update;
 if found then
   if old.company_id<>u."Company_ID" or old.archived or (old.owner_user_id is null and not manager) or (old.owner_user_id is not null and (old.owner_user_id<>p_actor or not allow_edit)) then raise exception 'Signature access denied' using errcode='42501';end if;
   if old.revision<>p_expected then raise exception 'Signature changed; refresh before saving' using errcode='40001';end if;
   personal:=old.owner_user_id is not null;
 else
   if p_expected<>0 then raise exception 'Signature not found' using errcode='42501';end if;
   personal:=coalesce((p_payload->>'personal')::boolean,false);
   if (personal and not allow_edit) or (not personal and not manager) then raise exception 'Signature access denied' using errcode='42501';end if;
 end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'assignments','[]')) a where not (
   a->>'kind'='everyone' and a->>'id' is null or a->>'kind'='user' and exists(select 1 from public."cmp_Users" target where target."User_ID"::text=a->>'id' and target."Company_ID"=u."Company_ID" and coalesce(target."User_AccessStatus",'active')='active') or a->>'kind'='department' and exists(select 1 from public."cmp_Departments" d where d."Department_ID"::text=a->>'id' and d."Company_ID"=u."Company_ID" and d."Department_IsActive"))) then raise exception 'Invalid assignment' using errcode='42501';end if;
 if nullif(p_payload->>'sourceTemplateId','') is not null and not exists(select 1 from public.email_signature_templates source where source.id::text=p_payload->>'sourceTemplateId' and source.company_id=u."Company_ID" and (source.owner_user_id is null or source.owner_user_id=p_actor)) then raise exception 'Invalid source signature' using errcode='42501';end if;
 if personal and jsonb_array_length(coalesce(p_payload->'assignments','[]'))>0 then raise exception 'Personal signatures cannot be assigned';end if;
 if coalesce((p_payload->>'archived')::boolean,false) and (jsonb_array_length(coalesce(old.published_assignments,'[]'))>0 or jsonb_array_length(coalesce(p_payload->'assignments','[]'))>0) then raise exception 'Remove assignments before archiving';end if;
 insert into public.email_signature_templates(id,company_id,owner_user_id,source_template_id,name,document,assignments,revision,created_by,updated_by)
 values(p_id,u."Company_ID",case when personal then p_actor end,nullif(p_payload->>'sourceTemplateId','')::uuid,p_payload->>'name',p_payload->'document',coalesce(p_payload->'assignments','[]'),1,p_actor,p_actor)
 on conflict(id) do update set name=excluded.name,document=excluded.document,assignments=excluded.assignments,revision=old.revision+1,updated_by=p_actor,updated_at=clock_timestamp()
 returning * into saved;
 if p_publish then
   if not personal and not coalesce(p_payload->'assignments','[]') @> '[{"kind":"everyone","id":null}]'::jsonb
     and not exists(select 1 from public.email_signature_templates t where t.company_id=u."Company_ID" and t.id<>p_id and not t.archived and t.owner_user_id is null and t.published_assignments @> '[{"kind":"everyone","id":null}]'::jsonb)
     and (exists(select 1 from public.email_signature_policies where company_id=u."Company_ID" and not allow_customisation) or exists(select 1 from public.email_signature_profiles where company_id=u."Company_ID" and allow_customisation=false)) then
       raise exception 'Keep a company default while customisation is restricted' using errcode='42501';
   end if;
   update public.email_signature_templates set published_document=document,published_assignments=assignments,published_revision=revision where id=p_id returning * into saved;
   insert into public.email_signature_versions(template_id,company_id,revision,document,assignments,actor_id) values(p_id,u."Company_ID",saved.revision,saved.document,saved.assignments,p_actor);
 end if;
 if coalesce((p_payload->>'archived')::boolean,false) then update public.email_signature_templates set archived=true where id=p_id returning * into saved;end if;
 insert into public.email_signature_events(company_id,actor_id,owner_user_id,template_id,kind,details) values(u."Company_ID",p_actor,saved.owner_user_id,p_id,case when saved.archived then 'archived' when p_publish then 'published' else 'draft_saved' end,jsonb_build_object('revision',saved.revision,'name',saved.name));
 return to_jsonb(saved);
end $$;
revoke all on function public.email_signature_commit(uuid,uuid,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.email_signature_commit(uuid,uuid,integer,jsonb,boolean) to service_role;
create function public.email_signature_policy(p_actor uuid,p_user uuid,p_allow boolean,p_website text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare company uuid;
begin
 select u."Company_ID" into company from public."cmp_Users" u where u."User_ID"=p_actor and u."Auth_User_ID" is not null and coalesce(u."User_AccessStatus",'active')='active'
  and exists(select 1 from public."cmp_Users_Roles" ur join public."sys_UserRole_Permissions" rp using("sys_UserRole_ID") join public."sys_Permissions" p using("sys_Permission_ID") where ur."User_ID"=p_actor and p."sys_Permission_Value"='Email.Signatures.Manage');
 if company is null then raise exception 'Signature manager required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(company::text,1430));
 if p_user is not null and not exists(select 1 from public."cmp_Users" where "User_ID"=p_user and "Company_ID"=company and coalesce("User_AccessStatus",'active')='active') then raise exception 'Signature profile unavailable' using errcode='42501';end if;
 if p_allow=false and not exists(select 1 from public.email_signature_templates where company_id=company and owner_user_id is null and not archived and published_revision is not null and published_assignments @> '[{"kind":"everyone","id":null}]'::jsonb) then raise exception 'Apply a company default before restricting customisation' using errcode='22023';end if;
 if p_user is null then
  insert into public.email_signature_policies(company_id,allow_customisation,website) values(company,coalesce(p_allow,true),left(coalesce(p_website,''),2000))
  on conflict(company_id) do update set allow_customisation=excluded.allow_customisation,website=excluded.website,revision=email_signature_policies.revision+1,updated_at=clock_timestamp();
 else
  insert into public.email_signature_profiles(user_id,company_id,allow_customisation) values(p_user,company,p_allow)
  on conflict(user_id) do update set allow_customisation=excluded.allow_customisation,updated_at=clock_timestamp();
 end if;
 insert into public.email_signature_events(company_id,actor_id,owner_user_id,kind,details) values(company,p_actor,p_user,'policy_changed',jsonb_build_object('allowCustomisation',p_allow));
end $$;
revoke all on function public.email_signature_policy(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.email_signature_policy(uuid,uuid,boolean,text) to service_role;

commit;
