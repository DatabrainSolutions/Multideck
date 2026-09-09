begin;

alter table public."cmp_Users"
  add column if not exists "User_DefaultInboxProviderCode" text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'CK_cmp_Users_DefaultInboxProvider'
      and conrelid = 'public."cmp_Users"'::regclass
  ) then
    alter table public."cmp_Users"
      add constraint "CK_cmp_Users_DefaultInboxProvider"
      check (
        "User_DefaultInboxProviderCode" is null
        or "User_DefaultInboxProviderCode" in ('gmail', 'outlook')
      );
  end if;
end
$$;

alter table public."cmp_Users" enable row level security;

create or replace function public.get_current_user_default_inbox_provider()
returns table (provider text)
language sql
stable
security definer
set search_path = ''
as $$
  select workspace_user."User_DefaultInboxProviderCode"
  from public."cmp_Users" as workspace_user
  where workspace_user."Auth_User_ID" = (select auth.uid());
$$;

revoke all on function public.get_current_user_default_inbox_provider() from public, anon;
grant execute on function public.get_current_user_default_inbox_provider() to authenticated;

create or replace function public.set_current_user_default_inbox_provider(p_provider text)
returns table (provider text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_provider is null or p_provider not in ('gmail', 'outlook') then
    raise exception 'The inbox provider is invalid.' using errcode = '22023';
  end if;

  update public."cmp_Users"
  set "User_DefaultInboxProviderCode" = p_provider
  where "Auth_User_ID" = v_auth_user_id;

  if not found then
    raise exception 'The signed-in account is not linked to a Multideck user profile.';
  end if;

  return query select p_provider;
end
$$;

revoke all on function public.set_current_user_default_inbox_provider(text) from public, anon;
grant execute on function public.set_current_user_default_inbox_provider(text) to authenticated;

comment on column public."cmp_Users"."User_DefaultInboxProviderCode" is
  'Private operator preference for the initial Inbox and email-composer provider. It does not emit Watching for you events and does not grant provider or mailbox access.';

commit;
