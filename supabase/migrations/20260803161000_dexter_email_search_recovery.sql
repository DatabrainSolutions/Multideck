-- Recover likely sender-address typos without weakening the other search clues.
-- The existing five-argument function remains available during a rolling Edge
-- Function deployment; the new runtime selects this overload by named args.
create extension if not exists pg_trgm with schema extensions;

create or replace function public.multideck_dexter_search_email(
  p_providers text[],
  p_query text,
  p_after timestamptz,
  p_before timestamptz,
  p_take integer,
  p_sender text,
  p_has_attachment boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_query text := left(btrim(coalesce(p_query, '')), 300);
  v_sender text := left(lower(btrim(coalesce(p_sender, ''))), 320);
  v_take integer := greatest(1, least(coalesce(p_take, 10), 20));
  v_providers text[];
  v_result jsonb;
begin
  select * into v_context from public._multideck_dexter_context();
  if not public._multideck_dexter_has_permission(v_context.user_id, 'Email.Read')
     or not public._multideck_dexter_has_permission(v_context.user_id, 'Email.AIRead') then
    raise exception 'You do not have permission to use email with Dexter.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct lower(btrim(provider))), array[]::text[])
  into v_providers
  from unnest(coalesce(p_providers, array[]::text[])) provider
  where lower(btrim(provider)) in ('gmail', 'outlook');

  if cardinality(v_providers) = 0
     or cardinality(v_providers) <> cardinality(coalesce(p_providers, array[]::text[])) then
    raise exception 'Choose Gmail, Outlook, or both as the email source.' using errcode = '22023';
  end if;
  if v_query = '' then
    raise exception 'Enter an email search term.' using errcode = '22023';
  end if;
  if p_after is not null and p_before is not null and p_after >= p_before then
    raise exception 'The email search date range is invalid.' using errcode = '22023';
  end if;

  with permitted_mailboxes as materialized (
    select *
    from public._multideck_dexter_email_mailboxes(v_context.user_id, v_context.company_id)
    where provider = any(v_providers)
  ),
  parameters as (
    select
      websearch_to_tsquery('simple'::regconfig, v_query) as search_query,
      to_tsquery(
        'simple'::regconfig,
        replace(plainto_tsquery('simple'::regconfig, v_query)::text, ' & ', ' | ')
      ) as fallback_query,
      nullif(v_sender, '') as sender_query,
      position('@' in v_sender) > 1 as sender_is_address,
      split_part(v_sender, '@', 1) as sender_local,
      split_part(v_sender, '@', 2) as sender_domain,
      plainto_tsquery('simple'::regconfig, v_sender) as sender_name_query,
      lower(v_query) = v_sender as query_repeats_sender
  ),
  base_candidates as (
    select
      message.*,
      permitted.provider,
      mailbox."CommMailbox_LastSyncedAt" as synced_at,
      coalesce(mailbox."CommMailbox_IndexStatus", 'pending') as index_status,
      search_document."AIDexterEmailSearch_Document" as search_vector,
      parameters.*
    from public."Comm_Messages" message
    join permitted_mailboxes permitted
      on permitted.mailbox_id = message."CommMessage_MailboxID"
    join public."Comm_Mailboxes" mailbox
      on mailbox."CommMailbox_ID" = message."CommMessage_MailboxID"
    join public."AI_DexterEmailSearchDocuments" search_document
      on search_document."AIDexterEmailSearch_MessageID" = message."CommMessage_ID"
    cross join parameters
    where not message."CommMessage_IsDeleted"
      and not message."CommMessage_IsDraft"
      and not message."CommMessage_IsSpam"
      and (p_has_attachment is distinct from true or message."CommMessage_HasAttachments")
      and (
        p_after is null
        or coalesce(
          message."CommMessage_MessageDate",
          message."CommMessage_ReceivedAt",
          message."CommMessage_SentAt",
          message."CommMessage_CreatedAt"
        ) >= p_after
      )
      and (
        p_before is null
        or coalesce(
          message."CommMessage_MessageDate",
          message."CommMessage_ReceivedAt",
          message."CommMessage_SentAt",
          message."CommMessage_CreatedAt"
        ) < p_before
      )
      and not exists (
        select 1
        from public."Comm_MessageFolders" membership
        join public."Comm_MailFolders" folder
          on folder."CommMailFolder_ID" = membership."CommMessageFolder_FolderID"
        where membership."CommMessageFolder_MessageID" = message."CommMessage_ID"
          and folder."CommMailFolder_RoleCode" in ('drafts', 'spam', 'trash')
      )
      and (
        search_document."AIDexterEmailSearch_Document" @@ parameters.search_query
        or search_document."AIDexterEmailSearch_Document" @@ parameters.fallback_query
        or (parameters.sender_query is not null and parameters.query_repeats_sender)
      )
  ),
  candidates as (
    select
      base_candidate.*,
      sender_match.address as matched_sender_address,
      sender_match.display_name as matched_sender_name,
      sender_match.exact_address as sender_exact,
      sender_match.exact_name as sender_name_exact,
      sender_match.local_similarity as sender_local_similarity,
      sender_match.fuzzy_address as sender_fuzzy
    from base_candidates base_candidate
    left join lateral (
      select
        scored.address,
        scored.display_name,
        scored.exact_address,
        scored.exact_name,
        scored.local_similarity,
        scored.sender_is_address
          and scored.sender_domain = scored.address_domain
          and greatest(length(scored.sender_local), length(scored.address_local)) >= 5
          and (
            scored.local_similarity >= 0.65
            or (
              scored.local_similarity >= 0.45
              and scored.candidate_has_attachment
              and scored.query_exact
            )
          ) as fuzzy_address
      from (
        select
          recipient."CommRecipient_Address" as address,
          recipient."CommRecipient_DisplayNameSnapshot" as display_name,
          base_candidate.sender_is_address,
          base_candidate.sender_local,
          base_candidate.sender_domain,
          base_candidate."CommMessage_HasAttachments" as candidate_has_attachment,
          base_candidate.search_vector @@ base_candidate.search_query as query_exact,
          split_part(lower(recipient."CommRecipient_NormalizedAddress"), '@', 1) as address_local,
          split_part(lower(recipient."CommRecipient_NormalizedAddress"), '@', 2) as address_domain,
          lower(recipient."CommRecipient_NormalizedAddress") = base_candidate.sender_query as exact_address,
          not base_candidate.sender_is_address
            and to_tsvector(
              'simple'::regconfig,
              coalesce(recipient."CommRecipient_DisplayNameSnapshot", '') || ' ' ||
              coalesce(recipient."CommRecipient_NormalizedAddress", '')
            ) @@ base_candidate.sender_name_query as exact_name,
          case
            when base_candidate.sender_is_address
              then extensions.similarity(
                base_candidate.sender_local,
                split_part(lower(recipient."CommRecipient_NormalizedAddress"), '@', 1)
              )
            else 0
          end as local_similarity
        from public."Comm_MessageRecipients" recipient
        where recipient."CommRecipient_MessageID" = base_candidate."CommMessage_ID"
          and recipient."CommRecipient_RecipientTypeCode" = 'from'
      ) scored
      order by scored.exact_address desc, scored.exact_name desc, scored.local_similarity desc, scored.address
      limit 1
    ) sender_match on base_candidate.sender_query is not null
  ),
  matches as (
    select
      candidate."CommMessage_ID" as message_id,
      candidate."CommMessage_ThreadID" as thread_id,
      candidate."CommMessage_MailboxID" as mailbox_id,
      candidate.provider,
      coalesce(nullif(candidate."CommMessage_Subject", ''), '(No subject)') as subject,
      left(coalesce(candidate."CommMessage_BodyPreview", candidate."CommMessage_BodyText", ''), 1000) as preview,
      coalesce(
        candidate."CommMessage_MessageDate",
        candidate."CommMessage_ReceivedAt",
        candidate."CommMessage_SentAt",
        candidate."CommMessage_CreatedAt"
      ) as occurred_at,
      candidate."CommMessage_HasAttachments" as has_attachments,
      candidate.synced_at,
      candidate.index_status,
      candidate.matched_sender_address,
      candidate.matched_sender_name,
      candidate.sender_local_similarity,
      case
        when candidate.sender_query is null and candidate.search_vector @@ candidate.search_query then 'exact'
        when (candidate.sender_exact or candidate.sender_name_exact)
          and candidate.search_vector @@ candidate.search_query then 'exact'
        when candidate.sender_fuzzy
          and candidate.search_vector @@ candidate.search_query then 'corrected_sender'
        when candidate.sender_exact or candidate.sender_name_exact then 'strong_candidate'
        when candidate.sender_fuzzy then 'possible_sender'
        else 'broad_candidate'
      end as match_quality,
      case
        when candidate.sender_query is null and candidate.search_vector @@ candidate.search_query
          then 100 + least(ts_rank_cd(candidate.search_vector, candidate.search_query), 10)
        when (candidate.sender_exact or candidate.sender_name_exact)
          and candidate.search_vector @@ candidate.search_query
          then 200 + least(ts_rank_cd(candidate.search_vector, candidate.search_query), 10)
        when candidate.sender_fuzzy
          and candidate.search_vector @@ candidate.search_query
          then 160 + candidate.sender_local_similarity * 10 + least(ts_rank_cd(candidate.search_vector, candidate.search_query), 10)
        when candidate.sender_exact or candidate.sender_name_exact
          then 130 + least(ts_rank_cd(candidate.search_vector, candidate.fallback_query), 0.99)
        when candidate.sender_fuzzy
          then 110 + candidate.sender_local_similarity * 10 + least(ts_rank_cd(candidate.search_vector, candidate.fallback_query), 0.99)
        else 10 * ts_rank_cd(
          to_tsvector('simple'::regconfig, coalesce(candidate."CommMessage_Subject", '')),
          candidate.fallback_query
        ) + least(ts_rank_cd(candidate.search_vector, candidate.fallback_query), 0.99)
      end as search_rank
    from candidates candidate
    where candidate.sender_query is null
      or candidate.sender_exact
      or candidate.sender_name_exact
      or candidate.sender_fuzzy
  ),
  thread_matches as (
    select distinct on (matches.thread_id)
      matches.*
    from matches
    order by matches.thread_id, matches.search_rank desc, matches.occurred_at desc, matches.message_id desc
  ),
  ordered as (
    select *
    from thread_matches
    order by search_rank desc, occurred_at desc, thread_id
    limit v_take + 1
  ),
  output_rows as (
    select
      jsonb_build_object(
        'threadId', ordered.thread_id,
        'matchMessageId', ordered.message_id,
        'mailboxId', ordered.mailbox_id,
        'provider', ordered.provider,
        'subject', ordered.subject,
        'preview', ordered.preview,
        'occurredAt', ordered.occurred_at,
        'hasAttachments', ordered.has_attachments,
        'matchQuality', ordered.match_quality,
        'matchedSender', case when ordered.matched_sender_address is null then null else jsonb_build_object(
          'address', ordered.matched_sender_address,
          'displayName', ordered.matched_sender_name,
          'role', 'from',
          'similarity', round(ordered.sender_local_similarity::numeric, 2)
        ) end,
        'syncedAt', ordered.synced_at,
        'indexStatus', ordered.index_status,
        'stale', ordered.synced_at is null
          or ordered.synced_at < now() - interval '30 minutes'
          or ordered.index_status = 'error',
        'participants', coalesce((
          select jsonb_agg(participant_row.value order by participant_row.sort_address)
          from (
            select distinct on (recipient."CommRecipient_NormalizedAddress")
              jsonb_build_object(
                'address', recipient."CommRecipient_Address",
                'displayName', recipient."CommRecipient_DisplayNameSnapshot",
                'role', recipient."CommRecipient_RecipientTypeCode"
              ) as value,
              recipient."CommRecipient_NormalizedAddress" as sort_address
            from public."Comm_MessageRecipients" recipient
            where recipient."CommRecipient_MessageID" = ordered.message_id
            order by recipient."CommRecipient_NormalizedAddress", recipient."CommRecipient_RecipientTypeCode"
          ) participant_row
        ), '[]'::jsonb),
        '_citation', jsonb_build_object(
          'title', ordered.subject,
          'url', '/inbox?provider=' || ordered.provider || '&mailbox=' || ordered.mailbox_id || '&thread=' || ordered.thread_id,
          'description', case ordered.provider when 'gmail' then 'Gmail email thread' else 'Outlook email thread' end
        )
      ) as value,
      ordered.search_rank,
      ordered.occurred_at,
      ordered.thread_id
    from ordered
    order by ordered.search_rank desc, ordered.occurred_at desc, ordered.thread_id
    limit v_take
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(output_rows.value order by output_rows.search_rank desc, output_rows.occurred_at desc, output_rows.thread_id), '[]'::jsonb),
    'hasMore', (select count(*) from ordered) > v_take,
    'query', v_query,
    'sender', nullif(v_sender, ''),
    'hasAttachment', p_has_attachment is true
  )
  into v_result
  from output_rows;

  return coalesce(v_result, jsonb_build_object(
    'items', '[]'::jsonb,
    'hasMore', false,
    'query', v_query,
    'sender', nullif(v_sender, ''),
    'hasAttachment', p_has_attachment is true
  ));
end;
$$;

revoke all on function public.multideck_dexter_search_email(
  text[], text, timestamptz, timestamptz, integer, text, boolean
) from public, anon;
grant execute on function public.multideck_dexter_search_email(
  text[], text, timestamptz, timestamptz, integer, text, boolean
) to authenticated;
