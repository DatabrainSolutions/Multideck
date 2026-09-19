-- Per-project control state. Deployment tooling must bind the verified Cloud
-- identity explicitly; a browser request can never establish that binding.
create schema if not exists private;
create table private.cloud_product_state (
  singleton boolean primary key default true check (singleton),
  tenant_id uuid not null unique,
  revision bigint not null default 0 check (revision >= 0),
  features text[] not null default '{}' check (features <@ array['icustoms']::text[]),
  jenkar_phone_verified boolean not null default false,
  updated_at timestamptz not null default now()
);
create table private.cloud_product_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  revision bigint not null,
  previous_features text[] not null,
  features text[] not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, revision)
);
alter table private.cloud_product_state enable row level security;
alter table private.cloud_product_events enable row level security;
-- Override inherited default grants too: BYPASSRLS does not bypass SQL grants.
revoke all on private.cloud_product_state, private.cloud_product_events from public, anon, authenticated, service_role;
revoke all on sequence private.cloud_product_events_id_seq from public, anon, authenticated, service_role;
grant usage on schema private to service_role;
grant select on private.cloud_product_state to service_role;
grant update (features, revision, updated_at) on private.cloud_product_state to service_role;
grant select, insert on private.cloud_product_events to service_role;
grant usage, select on sequence private.cloud_product_events_id_seq to service_role;
create policy cloud_product_server_state on private.cloud_product_state to service_role using (true) with check (true);
create policy cloud_product_server_events_read on private.cloud_product_events for select to service_role using (true);
create policy cloud_product_server_events_append on private.cloud_product_events for insert to service_role with check (true);

create function public.multideck_cloud_apply_features(p_tenant_id uuid, p_revision bigint, p_features text[])
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s private.cloud_product_state%rowtype; normalized text[];
begin
  if p_revision is null or p_revision < 1 or p_revision > 9007199254740991 or p_features is null
    or array_position(p_features, null) is not null
    or not (p_features <@ array['icustoms']::text[]) then
    raise exception 'Invalid feature request' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct f order by f), '{}'::text[]) into normalized from unnest(p_features) f;
  select * into s from private.cloud_product_state where singleton for update;
  if not found or s.tenant_id is distinct from p_tenant_id then
    raise exception 'Customer identity is not configured or does not match' using errcode = '42501';
  end if;
  if p_revision < s.revision or (p_revision = s.revision and normalized <> s.features) then
    raise exception 'Feature revision conflict' using errcode = '40001';
  end if;
  if p_revision > s.revision then
    insert into private.cloud_product_events(tenant_id, revision, previous_features, features)
      values(s.tenant_id, p_revision, s.features, normalized);
    update private.cloud_product_state set features = normalized, revision = p_revision, updated_at = now() where singleton;
  end if;
  return jsonb_build_object('tenantId', s.tenant_id, 'revision', p_revision, 'features', normalized);
end $$;
revoke all on function public.multideck_cloud_apply_features(uuid,bigint,text[]) from public, anon, authenticated;
grant execute on function public.multideck_cloud_apply_features(uuid,bigint,text[]) to service_role;

create function public.multideck_cloud_product_access(p_feature text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce((select case p_feature
    when 'icustoms' then 'icustoms' = any(features)
    when 'jenkar_phone' then jenkar_phone_verified
    else false end from private.cloud_product_state where singleton), false)
$$;
revoke all on function public.multideck_cloud_product_access(text) from public, anon, authenticated;
grant execute on function public.multideck_cloud_product_access(text) to service_role;
