begin;

alter table public."cmp_Users"
  add column if not exists "User_JobTitle" varchar(120),
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

commit;
