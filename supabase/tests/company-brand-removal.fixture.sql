-- Only run in an empty disposable database, never a linked tenant project.
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table public."cmp_Brands" (
  "Brand_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null,
  "Brand_Name" text not null,
  "Brand_DisplayName" text,
  "Brand_IsDefault" boolean not null default true,
  "Brand_IsActive" boolean not null default true,
  "Brand_CreatedAt" timestamptz not null default now(),
  "Brand_TemplateSettingsJSON" jsonb not null default '{}'
);
create table public."cmp_Users" (
  "User_ID" uuid primary key default gen_random_uuid(),
  "Company_ID" uuid not null,
  "Auth_User_ID" uuid unique,
  "User_AccentPreset" text
);
create publication supabase_realtime;
