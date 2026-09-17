begin;
-- An ISO date is a time window, never a title search. Explicit timezone keeps
-- local midnight and DST boundaries accurate for background calendar briefs.
create function public._dexter_calendar_window(p_search text) returns table(starts_at timestamptz,ends_at timestamptz) language sql stable set search_path=pg_catalog as $$
 select case when btrim(p_search) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(@[A-Za-z_]+(/[A-Za-z0-9_+-]+)*)?$' then split_part(btrim(p_search),'@',1)::date::timestamp at time zone coalesce(nullif(split_part(btrim(p_search),'@',2),''),'UTC') end,
 case when btrim(p_search) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(@[A-Za-z_]+(/[A-Za-z0-9_+-]+)*)?$' then (split_part(btrim(p_search),'@',1)::date+1)::timestamp at time zone coalesce(nullif(split_part(btrim(p_search),'@',2),''),'UTC') end;
$$;
revoke all on function public._dexter_calendar_window(text) from public,anon,authenticated;
create or replace function public.multideck_dexter_domain_calendar(p_company_id uuid, p_search text, p_take integer)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  with search_window as materialized (select * from public._dexter_calendar_window(p_search))
  select coalesce(jsonb_agg(row.data order by row.start_at), '[]'::jsonb)
  from (
    select meeting."CALMeeting_StartAt" as start_at,
      jsonb_strip_nulls(jsonb_build_object(
        'recordId', meeting."CALMeeting_ID", 'recordType', 'meeting',
        'title', meeting."CALMeeting_Title", 'startAt', meeting."CALMeeting_StartAt",
        'endAt', meeting."CALMeeting_EndAt", 'timeZone', meeting."CALMeeting_TimeZone",
        'status', meeting."CALMeeting_StatusCode", 'provider', meeting."CALMeeting_ProviderCode",
        'leadId', meeting."CALMeeting_LeadID", 'accountId', meeting."CALMeeting_AccountID",
        'route', '/calendar?meeting=' || meeting."CALMeeting_ID"
      )) as data
    from public."CAL_Meetings" meeting
    cross join search_window bounds
    where meeting."CALMeeting_CompanyID" = p_company_id
      and meeting."CALMeeting_OrganiserUserID" = (
        select profile."User_ID"
        from public."cmp_Users" profile
        where profile."Company_ID" = p_company_id
          and profile."Auth_User_ID" = auth.uid()
        limit 1
      )
      and meeting."CALMeeting_StatusCode" <> 'cancelled'
      and (case when bounds.starts_at is not null then meeting."CALMeeting_StartAt"<bounds.ends_at and meeting."CALMeeting_EndAt">bounds.starts_at
       else nullif(btrim(coalesce(p_search,'')),'') is null or meeting."CALMeeting_ID"::text=btrim(p_search) or (meeting."CALMeeting_Title" ilike '%'||btrim(p_search)||'%') end)
    order by meeting."CALMeeting_StartAt"
    limit greatest(1, least(coalesce(p_take,10),25))
  ) row;
$$;
create or replace function public.multideck_dexter_domain_external_events(p_company_id uuid, p_search text, p_take integer)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  with search_window as materialized (select * from public._dexter_calendar_window(p_search))
  select coalesce(jsonb_agg(row.data order by row.start_at), '[]'::jsonb)
  from (
    select event."CALProviderEvent_StartAt" as start_at,
      jsonb_strip_nulls(jsonb_build_object(
        'recordId', event."CALProviderEvent_ID", 'recordType', 'external_event',
        'title', case when event."CALProviderEvent_IsPrivate" then 'Busy' else coalesce(event."CALProviderEvent_Title",'Busy') end,
        'startAt', event."CALProviderEvent_StartAt", 'endAt', event."CALProviderEvent_EndAt",
        'source', connection."CALConnection_ProviderCode", 'private', event."CALProviderEvent_IsPrivate",
        'joinUrl', event."CALProviderEvent_JoinURL",
        'canEdit', connection."CALConnection_StatusCode" in ('connected','syncing')
          and connection."CALConnection_ProviderCode" in ('google','microsoft')
          and event."CALProviderEvent_IsOrganiser",
        'canRespond', connection."CALConnection_StatusCode" in ('connected','syncing')
          and connection."CALConnection_ProviderCode" in ('google','microsoft')
          and not event."CALProviderEvent_IsOrganiser"
          and event."CALProviderEvent_ResponseCode" is not null,
        'response', event."CALProviderEvent_ResponseCode",
        'route', '/calendar?date=' || to_char(event."CALProviderEvent_StartAt" at time zone 'UTC','YYYY-MM-DD')
      )) as data
    from public."CAL_ProviderEvents" event
    join public."CAL_ProviderConnections" connection on connection."CALConnection_ID"=event."CALProviderEvent_ConnectionID"
      and connection."CALConnection_CompanyID"=event."CALProviderEvent_CompanyID"
      and connection."CALConnection_UserID"=event."CALProviderEvent_OwnerUserID"
    cross join search_window bounds
    where event."CALProviderEvent_CompanyID" = p_company_id
      and event."CALProviderEvent_OwnerUserID" = (
        select profile."User_ID"
        from public."cmp_Users" profile
        where profile."Company_ID" = p_company_id
          and profile."Auth_User_ID" = auth.uid()
        limit 1
      )
      and event."CALProviderEvent_MeetingID" is null
      and event."CALProviderEvent_IsCancelled" = false
      and event."CALProviderEvent_EndAt" > now() - interval '1 day'
      and (case when bounds.starts_at is not null then event."CALProviderEvent_StartAt"<bounds.ends_at and event."CALProviderEvent_EndAt">bounds.starts_at
       else nullif(btrim(coalesce(p_search,'')),'') is null or event."CALProviderEvent_ID"::text=btrim(p_search) or (event."CALProviderEvent_IsPrivate" = false and event."CALProviderEvent_Title" ilike '%'||btrim(p_search)||'%') end)
    order by event."CALProviderEvent_StartAt"
    limit greatest(1, least(coalesce(p_take,10),25))
  ) row;
$$;
commit;
