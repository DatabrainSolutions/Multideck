begin;

alter table public."cmp_Users"
  add column if not exists "User_ProfilePhotoBucket" varchar(63),
  add column if not exists "User_ProfilePhotoPath" varchar(255),
  add column if not exists "User_ProfilePhotoMimeType" varchar(100),
  add column if not exists "User_ProfilePhotoSizeBytes" bigint,
  add column if not exists "User_ProfilePhotoUpdatedAt" timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'CK_cmp_Users_ProfilePhoto'
      and conrelid = 'public."cmp_Users"'::regclass
  ) then
    alter table public."cmp_Users"
      add constraint "CK_cmp_Users_ProfilePhoto"
      check (
        (
          "User_ProfilePhotoBucket" is null
          and "User_ProfilePhotoPath" is null
          and "User_ProfilePhotoMimeType" is null
          and "User_ProfilePhotoSizeBytes" is null
          and "User_ProfilePhotoUpdatedAt" is null
        )
        or
        (
          "User_ProfilePhotoBucket" = 'profile-photos'
          and "User_ProfilePhotoPath" is not null
          and "User_ProfilePhotoMimeType" in ('image/jpeg', 'image/png', 'image/webp')
          and "User_ProfilePhotoSizeBytes" between 1 and 5242880
          and "User_ProfilePhotoUpdatedAt" is not null
        )
      );
  end if;
end
$$;

alter table public."cmp_Users" enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_read_profile_photo(p_object_name text)
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

revoke all on function public.can_read_profile_photo(text) from public, anon;
grant execute on function public.can_read_profile_photo(text) to authenticated;

drop policy if exists "Company users can read profile photos" on storage.objects;
create policy "Company users can read profile photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-photos'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (select public.can_read_profile_photo(name))
  )
);

drop policy if exists "Users can upload their own profile photos" on storage.objects;
create policy "Users can upload their own profile photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
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
  and name ~ (
    '^'
    || (select auth.uid())::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'
  )
);

drop policy if exists "Users can remove their own profile photos" on storage.objects;
create policy "Users can remove their own profile photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.get_current_user_profile_photo()
returns table (
  "bucket" text,
  "path" text,
  "mimeType" text,
  "sizeBytes" bigint,
  "updatedAt" timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    workspace_user."User_ProfilePhotoBucket"::text,
    workspace_user."User_ProfilePhotoPath"::text,
    workspace_user."User_ProfilePhotoMimeType"::text,
    workspace_user."User_ProfilePhotoSizeBytes",
    workspace_user."User_ProfilePhotoUpdatedAt"
  from public."cmp_Users" as workspace_user
  where workspace_user."Auth_User_ID" = (select auth.uid())
    and workspace_user."User_ProfilePhotoPath" is not null;
$$;

revoke all on function public.get_current_user_profile_photo() from public, anon;
grant execute on function public.get_current_user_profile_photo() to authenticated;

create or replace function public.set_current_user_profile_photo(
  p_bucket text,
  p_path text,
  p_mime_type text,
  p_size_bytes bigint
)
returns table (
  "bucket" text,
  "path" text,
  "mimeType" text,
  "sizeBytes" bigint,
  "updatedAt" timestamptz
)
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

  if p_bucket <> 'profile-photos' then
    raise exception 'The profile photo bucket is invalid.';
  end if;

  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'The profile photo type is invalid.';
  end if;

  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 5242880 then
    raise exception 'The profile photo size is invalid.';
  end if;

  if p_path !~ (
    '^'
    || v_auth_user_id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'
  ) then
    raise exception 'The profile photo path is invalid.';
  end if;

  if (
    (p_mime_type = 'image/jpeg' and right(p_path, 4) <> '.jpg')
    or (p_mime_type = 'image/png' and right(p_path, 4) <> '.png')
    or (p_mime_type = 'image/webp' and right(p_path, 5) <> '.webp')
  ) then
    raise exception 'The profile photo extension does not match its type.';
  end if;

  if not exists (
    select 1
    from storage.objects
    where bucket_id = p_bucket
      and name = p_path
  ) then
    raise exception 'Upload the profile photo before saving its metadata.';
  end if;

  update public."cmp_Users"
  set
    "User_ProfilePhotoBucket" = p_bucket,
    "User_ProfilePhotoPath" = p_path,
    "User_ProfilePhotoMimeType" = p_mime_type,
    "User_ProfilePhotoSizeBytes" = p_size_bytes,
    "User_ProfilePhotoUpdatedAt" = now()
  where "Auth_User_ID" = v_auth_user_id;

  if not found then
    raise exception 'The signed-in account is not linked to a Multideck user profile.';
  end if;

  return query
  select
    workspace_user."User_ProfilePhotoBucket"::text,
    workspace_user."User_ProfilePhotoPath"::text,
    workspace_user."User_ProfilePhotoMimeType"::text,
    workspace_user."User_ProfilePhotoSizeBytes",
    workspace_user."User_ProfilePhotoUpdatedAt"
  from public."cmp_Users" as workspace_user
  where workspace_user."Auth_User_ID" = v_auth_user_id;
end
$$;

revoke all on function public.set_current_user_profile_photo(text, text, text, bigint) from public, anon;
grant execute on function public.set_current_user_profile_photo(text, text, text, bigint) to authenticated;

create or replace function public.clear_current_user_profile_photo(p_expected_path text)
returns boolean
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

  update public."cmp_Users"
  set
    "User_ProfilePhotoBucket" = null,
    "User_ProfilePhotoPath" = null,
    "User_ProfilePhotoMimeType" = null,
    "User_ProfilePhotoSizeBytes" = null,
    "User_ProfilePhotoUpdatedAt" = null
  where "Auth_User_ID" = v_auth_user_id
    and "User_ProfilePhotoPath" = p_expected_path;

  return found;
end
$$;

revoke all on function public.clear_current_user_profile_photo(text) from public, anon;
grant execute on function public.clear_current_user_profile_photo(text) to authenticated;

commit;
