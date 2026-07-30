begin;

alter table public."cmp_Users"
  add column if not exists "User_CoverPhotoBucket" varchar(63),
  add column if not exists "User_CoverPhotoPath" varchar(255),
  add column if not exists "User_CoverPhotoMimeType" varchar(100),
  add column if not exists "User_CoverPhotoSizeBytes" bigint,
  add column if not exists "User_CoverPhotoUpdatedAt" timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'CK_cmp_Users_CoverPhoto'
      and conrelid = 'public."cmp_Users"'::regclass
  ) then
    alter table public."cmp_Users"
      add constraint "CK_cmp_Users_CoverPhoto"
      check (
        (
          "User_CoverPhotoBucket" is null
          and "User_CoverPhotoPath" is null
          and "User_CoverPhotoMimeType" is null
          and "User_CoverPhotoSizeBytes" is null
          and "User_CoverPhotoUpdatedAt" is null
        )
        or
        (
          "User_CoverPhotoBucket" = 'profile-photos'
          and "User_CoverPhotoPath" is not null
          and "User_CoverPhotoMimeType" in ('image/jpeg', 'image/png', 'image/webp')
          and "User_CoverPhotoSizeBytes" between 1 and 5242880
          and "User_CoverPhotoUpdatedAt" is not null
        )
      );
  end if;
end
$$;

create or replace function public.get_current_user_cover_photo()
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
    workspace_user."User_CoverPhotoBucket"::text,
    workspace_user."User_CoverPhotoPath"::text,
    workspace_user."User_CoverPhotoMimeType"::text,
    workspace_user."User_CoverPhotoSizeBytes",
    workspace_user."User_CoverPhotoUpdatedAt"
  from public."cmp_Users" as workspace_user
  where workspace_user."Auth_User_ID" = (select auth.uid())
    and workspace_user."User_CoverPhotoPath" is not null;
$$;

revoke all on function public.get_current_user_cover_photo() from public, anon;
grant execute on function public.get_current_user_cover_photo() to authenticated;

create or replace function public.set_current_user_cover_photo(
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
    raise exception 'The cover photo bucket is invalid.';
  end if;

  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'The cover photo type is invalid.';
  end if;

  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 5242880 then
    raise exception 'The cover photo size is invalid.';
  end if;

  if p_path !~ (
    '^'
    || v_auth_user_id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp)$'
  ) then
    raise exception 'The cover photo path is invalid.';
  end if;

  if (
    (p_mime_type = 'image/jpeg' and right(p_path, 4) <> '.jpg')
    or (p_mime_type = 'image/png' and right(p_path, 4) <> '.png')
    or (p_mime_type = 'image/webp' and right(p_path, 5) <> '.webp')
  ) then
    raise exception 'The cover photo extension does not match its type.';
  end if;

  if not exists (
    select 1
    from storage.objects
    where bucket_id = p_bucket
      and name = p_path
  ) then
    raise exception 'Upload the cover photo before saving its metadata.';
  end if;

  update public."cmp_Users"
  set
    "User_CoverPhotoBucket" = p_bucket,
    "User_CoverPhotoPath" = p_path,
    "User_CoverPhotoMimeType" = p_mime_type,
    "User_CoverPhotoSizeBytes" = p_size_bytes,
    "User_CoverPhotoUpdatedAt" = now()
  where "Auth_User_ID" = v_auth_user_id;

  if not found then
    raise exception 'The signed-in account is not linked to a Multideck user profile.';
  end if;

  return query
  select
    workspace_user."User_CoverPhotoBucket"::text,
    workspace_user."User_CoverPhotoPath"::text,
    workspace_user."User_CoverPhotoMimeType"::text,
    workspace_user."User_CoverPhotoSizeBytes",
    workspace_user."User_CoverPhotoUpdatedAt"
  from public."cmp_Users" as workspace_user
  where workspace_user."Auth_User_ID" = v_auth_user_id;
end
$$;

revoke all on function public.set_current_user_cover_photo(text, text, text, bigint) from public, anon;
grant execute on function public.set_current_user_cover_photo(text, text, text, bigint) to authenticated;

create or replace function public.clear_current_user_cover_photo(p_expected_path text)
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
    "User_CoverPhotoBucket" = null,
    "User_CoverPhotoPath" = null,
    "User_CoverPhotoMimeType" = null,
    "User_CoverPhotoSizeBytes" = null,
    "User_CoverPhotoUpdatedAt" = null
  where "Auth_User_ID" = v_auth_user_id
    and "User_CoverPhotoPath" = p_expected_path;

  return found;
end
$$;

revoke all on function public.clear_current_user_cover_photo(text) from public, anon;
grant execute on function public.clear_current_user_cover_photo(text) to authenticated;

commit;
