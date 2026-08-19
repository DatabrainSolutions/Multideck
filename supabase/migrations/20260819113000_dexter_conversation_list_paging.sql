begin;

create extension if not exists pg_trgm with schema extensions;

create index if not exists "IX_AI_Conversations_DexterPage"
  on public."AI_Conversations" (
    "AICNV_CompanyID",
    "AICNV_OwnerUserID",
    "AICNV_UpdatedAt" desc,
    "AICNV_ID" desc
  )
  where "AICNV_Channel" = 'chat'
    and "AICNV_EndedAt" is null
    and "AICNV_DomainCode" in ('multideck', 'warehouse');

create index if not exists "IX_AI_Conversations_DexterTitleSearch"
  on public."AI_Conversations" using gin (
    (lower(coalesce("AICNV_Title", ''))) extensions.gin_trgm_ops
  )
  where "AICNV_Channel" = 'chat'
    and "AICNV_EndedAt" is null
    and "AICNV_DomainCode" in ('multideck', 'warehouse');

create index if not exists "IX_AI_Messages_DexterContentSearch"
  on public."AI_Messages" using gin (
    (lower("AIMSG_ContentText")) extensions.gin_trgm_ops
  )
  where "AIMSG_ContentText" is not null;

create or replace function public.multideck_dexter_list_conversations_page(
  p_query text default null,
  p_limit integer default 25,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, extensions
as $$
declare
  v_context record;
  v_query text := left(lower(btrim(coalesce(p_query, ''))), 200);
  v_pattern text;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 1000000);
  v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  v_pattern := '%' || replace(replace(replace(v_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';

  with matched_ids as materialized (
    select conversation."AICNV_ID" as id
    from public."AI_Conversations" conversation
    where v_query = ''
      and conversation."AICNV_CompanyID" = v_context.company_id
      and conversation."AICNV_OwnerUserID" = v_context.user_id
      and conversation."AICNV_Channel" = 'chat'
      and conversation."AICNV_EndedAt" is null
      and conversation."AICNV_DomainCode" in ('multideck', 'warehouse')
    union
    select conversation."AICNV_ID" as id
    from public."AI_Conversations" conversation
    where v_query <> ''
      and conversation."AICNV_CompanyID" = v_context.company_id
      and conversation."AICNV_OwnerUserID" = v_context.user_id
      and conversation."AICNV_Channel" = 'chat'
      and conversation."AICNV_EndedAt" is null
      and conversation."AICNV_DomainCode" in ('multideck', 'warehouse')
      and lower(coalesce(conversation."AICNV_Title", '')) like v_pattern escape E'\\'
    union
    select conversation."AICNV_ID" as id
    from public."AI_Conversations" conversation
    join public."AI_Messages" message
      on message."AIMSG_ConversationID" = conversation."AICNV_ID"
    where v_query <> ''
      and conversation."AICNV_CompanyID" = v_context.company_id
      and conversation."AICNV_OwnerUserID" = v_context.user_id
      and conversation."AICNV_Channel" = 'chat'
      and conversation."AICNV_EndedAt" is null
      and conversation."AICNV_DomainCode" in ('multideck', 'warehouse')
      and lower(message."AIMSG_ContentText") like v_pattern escape E'\\'
  ),
  page as (
    select
      conversation."AICNV_ID" as id,
      coalesce(conversation."AICNV_Title", 'Dexter conversation') as title,
      coalesce(conversation."AICNV_SummaryText", '') as summary,
      conversation."AICNV_UpdatedAt" as updated_at,
      case
        when v_query = '' then null
        else coalesce(
          (
            select left(regexp_replace(message."AIMSG_ContentText", '[[:space:]]+', ' ', 'g'), 240)
            from public."AI_Messages" message
            where message."AIMSG_ConversationID" = conversation."AICNV_ID"
              and lower(message."AIMSG_ContentText") like v_pattern escape E'\\'
            order by message."AIMSG_CreatedAt" desc, message."AIMSG_ID" desc
            limit 1
          ),
          coalesce(conversation."AICNV_SummaryText", '')
        )
      end as match_snippet
    from public."AI_Conversations" conversation
    join matched_ids on matched_ids.id = conversation."AICNV_ID"
    order by conversation."AICNV_UpdatedAt" desc, conversation."AICNV_ID" desc
    offset v_offset
    limit v_limit
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'id', page.id,
          'title', page.title,
          'summary', page.summary,
          'updatedAt', page.updated_at,
          'matchSnippet', page.match_snippet
        ))
        order by page.updated_at desc, page.id desc
      )
      from page
    ), '[]'::jsonb),
    'total', (select count(*) from matched_ids),
    'offset', v_offset,
    'limit', v_limit,
    'hasMore', v_offset + (select count(*) from page) < (select count(*) from matched_ids)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.multideck_dexter_list_conversations_page(text, integer, integer) from public, anon;
grant execute on function public.multideck_dexter_list_conversations_page(text, integer, integer) to authenticated, service_role;

comment on function public.multideck_dexter_list_conversations_page(text, integer, integer) is
  'Returns an exact owner-private Dexter conversation page with bounded title and message search. This changes existing read transport only and adds no new write or Watching capability.';

commit;
