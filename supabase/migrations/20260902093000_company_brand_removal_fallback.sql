begin;

-- Match the default active brand resolved by tenantBrandRow. The row lock also
-- serialises a stale profile selection with an administrator removing branding.
create or replace function public.company_appearance_available(p_company_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_brand public."cmp_Brands"%rowtype;
  v_settings jsonb;
begin
  select * into v_brand from public."cmp_Brands"
  where "Company_ID" = p_company_id and "Brand_IsActive" = true
  order by "Brand_IsDefault" desc, "Brand_CreatedAt" asc
  limit 1 for share;
  if not found then return false; end if;
  v_settings := v_brand."Brand_TemplateSettingsJSON" -> 'tenantBranding';
  return coalesce(
    v_settings -> 'version' = '1'::jsonb
    and (v_settings -> 'configured' is distinct from 'false'::jsonb)
    and coalesce(nullif(btrim(v_brand."Brand_DisplayName"), ''), nullif(btrim(v_brand."Brand_Name"), '')) is not null
    and (v_settings ->> 'primaryColor') ~* '^#[0-9a-f]{6}$'
    and (v_settings ->> 'secondaryColor') ~* '^#[0-9a-f]{6}$', false);
end;
$$;
revoke all on function public.company_appearance_available(uuid) from public, anon, authenticated;

create or replace function public.reset_removed_company_appearance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  -- Changes and deletes both reconcile the affected company. Other companies
  -- and colleagues with any standard Multideck preset are never changed.
  for v_company_id in
    select distinct company_id from unnest(array[
      case when TG_OP <> 'INSERT' then OLD."Company_ID" end,
      case when TG_OP <> 'DELETE' then NEW."Company_ID" end
    ]) as affected(company_id) where company_id is not null
  loop
    if not public.company_appearance_available(v_company_id) then
      update public."cmp_Users" set "User_AccentPreset" = 'teal'
      where "Company_ID" = v_company_id and "User_AccentPreset" = 'company';
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function public.reset_removed_company_appearance() from public, anon, authenticated;

create trigger reset_removed_company_appearance
after insert or update or delete on public."cmp_Brands"
for each row execute function public.reset_removed_company_appearance();

create or replace function public.guard_company_appearance_preference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if NEW."User_AccentPreset" = 'company'
    and not public.company_appearance_available(NEW."Company_ID") then
    NEW."User_AccentPreset" := 'teal';
  end if;
  return NEW;
end;
$$;
revoke all on function public.guard_company_appearance_preference() from public, anon, authenticated;

create trigger guard_company_appearance_preference
before insert or update of "User_AccentPreset", "Company_ID" on public."cmp_Users"
for each row execute function public.guard_company_appearance_preference();

create or replace function public.set_current_user_accent_preference(p_accent_preset text)
returns table (accent_preset text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
begin
  if v_auth_user_id is null then raise exception 'Authentication is required.'; end if;
  if p_accent_preset is null or p_accent_preset not in (
    'teal', 'meadow', 'sky', 'ocean', 'indigo', 'violet', 'plum', 'rose',
    'ember', 'graphite', 'lime', 'gold', 'coral', 'cobalt', 'fuchsia', 'company'
  ) then
    raise exception 'The accent colour is invalid.' using errcode = '22023';
  end if;
  return query update public."cmp_Users"
    set "User_AccentPreset" = p_accent_preset
    where "Auth_User_ID" = v_auth_user_id
    returning "User_AccentPreset";
  if not found then
    raise exception 'The signed-in account is not linked to a Multideck user profile.';
  end if;
end;
$$;
revoke all on function public.set_current_user_accent_preference(text) from public, anon;
grant execute on function public.set_current_user_accent_preference(text) to authenticated;

-- Existing SELECT RLS still authorises every event; no new table access grants.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'cmp_Users') then
    alter publication supabase_realtime add table public."cmp_Users";
  end if;
end;
$$;

commit;
