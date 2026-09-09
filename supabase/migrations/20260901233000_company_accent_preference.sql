begin;

alter table public."cmp_Users"
  drop constraint if exists "CK_cmp_Users_AccentPreset";

alter table public."cmp_Users"
  add constraint "CK_cmp_Users_AccentPreset"
  check (
    "User_AccentPreset" is null
    or "User_AccentPreset" in (
      'teal', 'meadow', 'sky', 'ocean', 'indigo',
      'violet', 'plum', 'rose', 'ember', 'graphite',
      'lime', 'gold', 'coral', 'cobalt', 'fuchsia',
      'company'
    )
  );

create or replace function public.set_current_user_accent_preference(p_accent_preset text)
returns table (accent_preset text)
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

  if p_accent_preset is null or p_accent_preset not in (
    'teal', 'meadow', 'sky', 'ocean', 'indigo',
    'violet', 'plum', 'rose', 'ember', 'graphite',
    'lime', 'gold', 'coral', 'cobalt', 'fuchsia',
    'company'
  ) then
    raise exception 'The accent colour is invalid.' using errcode = '22023';
  end if;

  update public."cmp_Users"
  set "User_AccentPreset" = p_accent_preset
  where "Auth_User_ID" = v_auth_user_id;

  if not found then
    raise exception 'The signed-in account is not linked to a Multideck user profile.';
  end if;

  return query select p_accent_preset;
end
$$;

revoke all on function public.set_current_user_accent_preference(text) from public, anon;
grant execute on function public.set_current_user_accent_preference(text) to authenticated;

comment on column public."cmp_Users"."User_AccentPreset" is
  'Personal accent preset. The company value resolves only when Admin Branding has a complete saved company identity.';

commit;
