begin;

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.can_read_profile_photo(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."cmp_Users" as viewer
    join public."cmp_Users" as photo_owner
      on photo_owner."Auth_User_ID"::text = (storage.foldername(p_object_name))[1]
    where viewer."Auth_User_ID" = (select auth.uid())
      and viewer."Company_ID" is not null
      and photo_owner."Company_ID" = viewer."Company_ID"
  );
$$;

revoke all on function private.can_read_profile_photo(text) from public, anon;
grant execute on function private.can_read_profile_photo(text) to authenticated;

drop policy if exists "Company users can read profile photos" on storage.objects;
create policy "Company users can read profile photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-photos'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select private.can_read_profile_photo(name))
  )
);

drop policy if exists "Users can upload their own profile photos" on storage.objects;
create policy "Users can upload their own profile photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and exists (
    select 1
    from public."cmp_Users" as workspace_user
    where workspace_user."Auth_User_ID" = (select auth.uid())
  )
  and name ~ (
    '^'
    || (select auth.uid())::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'
  )
);

drop policy if exists "Users can replace their own profile photos" on storage.objects;
create policy "Users can replace their own profile photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-photos'
  and exists (
    select 1
    from public."cmp_Users" as workspace_user
    where workspace_user."Auth_User_ID" = (select auth.uid())
  )
  and name ~ (
    '^'
    || (select auth.uid())::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'
  )
);

drop function if exists public.can_read_profile_photo(text);

commit;
