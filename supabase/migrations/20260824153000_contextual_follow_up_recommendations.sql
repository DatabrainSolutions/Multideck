-- One context-aware follow-up queue for Home and CRM.
--
-- The previous read model found broad candidates from email cadence and lead
-- age. Keep that audited, mailbox-scoped candidate builder private, then apply
-- stricter deterministic eligibility, deduplication and recommendation rules.
-- Ranking evidence stays inside this function. The browser receives the next
-- recommended action, never the internal reasons used to select or rank it.

begin;

alter function public.multideck_crm_get_follow_up_opportunities(text)
  rename to _multideck_crm_get_follow_up_candidates_v1;

revoke all on function public._multideck_crm_get_follow_up_candidates_v1(text)
  from public, anon, authenticated;

create or replace function public.multideck_crm_get_follow_up_opportunities(
  p_area text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_context record;
  v_candidates jsonb;
  v_result jsonb;
begin
  select * into v_context from public._multideck_crm_context();
  v_candidates := public._multideck_crm_get_follow_up_candidates_v1(p_area);

  with base_candidates as materialized (
    select candidate.item, candidate.ordinality::bigint as original_order
    from jsonb_array_elements(coalesce(v_candidates -> 'items', '[]'::jsonb))
      with ordinality as candidate(item, ordinality)
  ), due_first_responses as materialized (
    select jsonb_build_object(
      'id', 'lead:' || lead."CRMLead_ID"::text,
      'source', 'activity',
      'threadId', null,
      'mailboxId', null,
      'recordType', 'lead',
      'recordId', lead."CRMLead_ID",
      'companyName', coalesce(nullif(btrim(lead."CRMLead_CompanyName"), ''), organisation."Org_Name"),
      'personName', coalesce(nullif(btrim(lead."CRMLead_PersonName"), ''), nullif(btrim(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")), '')),
      'email', coalesce(nullif(lower(btrim(lead."CRMLead_Email")), ''), contact_email.email),
      'subject', 'First response due',
      'context', coalesce(nullif(btrim(lead."CRMLead_CustomerCentricNeed"), ''), nullif(btrim(lead."CRMLead_ServiceInterest"), ''), nullif(btrim(lead."CRMLead_TradeLane"), '')),
      'lastActivityAt', lead."CRMLead_CreatedAt",
      'lastDirection', null,
      'reasonCode', 'never_contacted',
      'dueAt', lead."CRMLead_FirstResponseDueAt",
      'daysWaiting', greatest(0, floor(extract(epoch from (now() - lead."CRMLead_CreatedAt")) / 86400)::integer),
      'stage', status."CRMLeadStatus_Name",
      'location', null,
      'canCreate', false,
      'outboundAttempts', 0
    ) as item,
    (100000 + row_number() over (order by lead."CRMLead_FirstResponseDueAt", lead."CRMLead_ID"))::bigint as original_order
    from public."CRM_Leads" lead
    join public."sys_CRMLeadStatuses" status
      on status."CRMLeadStatus_Code" = lead."CRMLead_StatusCode"
     and status."CRMLeadStatus_IsOpen"
    left join public."Org_Master" organisation on organisation."Org_id" = lead."CRMLead_OrgID"
    left join public."Org_Contacts" contact on contact."OrgContact_ID" = lead."CRMLead_PrimaryContactID"
    left join lateral (
      select lower(btrim(email."OrgContactEmail_Email")) as email
      from public."OrgContact_Emails" email
      where email."OrgContact_ID" = contact."OrgContact_ID"
      order by email."OrgContactEmail_Type", email."OrgContactEmail_ID"
      limit 1
    ) contact_email on true
    where lead."CRMLead_OwnerUserID" = v_context.user_id
      and not lead."CRMLead_IsDeleted"
      and lower(coalesce(lead."CRMLead_MetadataJSON" ->> 'isDemo', 'false')) <> 'true'
      and lead."CRMLead_FirstResponseDueAt" <= now()
      and coalesce(lead."CRMLead_FirstRespondedAt", lead."CRMLead_LastInteractionAt") is null
  ), due_deals as materialized (
    select jsonb_build_object(
      'id', 'deal:' || deal."CRMOppty_ID"::text,
      'source', 'activity',
      'threadId', null,
      'mailboxId', null,
      'recordType', 'deal',
      'recordId', deal."CRMOppty_ID",
      'companyName', organisation."Org_Name",
      'personName', nullif(btrim(concat_ws(' ', contact."OrgContact_FirstName", contact."OrgContact_LastName")), ''),
      'email', contact_email.email,
      'subject', deal."CRMOppty_Name",
      'context', coalesce(nullif(btrim(deal."CRMOppty_CustomerNeed"), ''), nullif(btrim(deal."CRMOppty_ServiceInterest"), ''), nullif(btrim(deal."CRMOppty_TradeLane"), '')),
      'lastActivityAt', coalesce(deal."CRMOppty_LastActivityAt", deal."CRMOppty_CreatedAt"),
      'lastDirection', null,
      'reasonCode', 'scheduled_due',
      'dueAt', deal."CRMOppty_NextActionDueAt",
      'daysWaiting', greatest(0, floor(extract(epoch from (now() - deal."CRMOppty_NextActionDueAt")) / 86400)::integer),
      'stage', coalesce(stage."CRMPipelineStage_Name", initcap(replace(deal."CRMOppty_StageCode", '_', ' '))),
      'location', null,
      'canCreate', false,
      'outboundAttempts', 0
    ) as item,
    (200000 + row_number() over (order by deal."CRMOppty_NextActionDueAt", deal."CRMOppty_ID"))::bigint as original_order
    from public."CRM_Opportunities" deal
    join public."Org_Master" organisation on organisation."Org_id" = deal."CRMOppty_OrgID"
    left join public."Org_Contacts" contact on contact."OrgContact_ID" = deal."CRMOppty_PrimaryContactID"
    left join lateral (
      select lower(btrim(email."OrgContactEmail_Email")) as email
      from public."OrgContact_Emails" email
      where email."OrgContact_ID" = contact."OrgContact_ID"
      order by email."OrgContactEmail_Type", email."OrgContactEmail_ID"
      limit 1
    ) contact_email on true
    left join public."CRM_PipelineStages" stage on stage."CRMPipelineStage_ID" = deal."CRMOppty_PipelineStageID"
    where deal."CRMOppty_OwnerUserID" = v_context.user_id
      and not deal."CRMOppty_IsDeleted"
      and deal."CRMOppty_NextActionDueAt" <= now()
      and deal."CRMOppty_WonAt" is null
      and deal."CRMOppty_LostAt" is null
      and lower(coalesce(deal."CRMOppty_StatusCode", 'open')) not in ('won', 'lost', 'closed', 'cancelled', 'canceled')
  ), due_quotes as materialized (
    select jsonb_build_object(
      'id', 'quote:' || quote."CusQuoteHeader_ID"::text,
      'source', 'activity',
      'threadId', null,
      'mailboxId', null,
      'recordType', 'quote',
      'recordId', quote."CusQuoteHeader_ID",
      'companyName', coalesce(customer."Org_Name", quote."CusQuoteHeader_CustomerNameSnapshot"),
      'personName', quote."CusQuoteHeader_ContactNameSnapshot",
      'email', nullif(lower(btrim(quote."CusQuoteHeader_ContactEmailSnapshot")), ''),
      'subject', 'Q-' || quote."CusQuoteHeader_Number"::text,
      'context', nullif(concat_ws(' to ', nullif(btrim(coalesce(quote."CusQuoteHeader_LoadingPoint", quote."CusQuoteHeader_OriginExtra")), ''), nullif(btrim(coalesce(quote."CusQuoteHeader_DischargePoint", quote."CusQuoteHeader_DestinationExtra")), '')), ''),
      'lastActivityAt', coalesce(quote."CusQuoteHeader_LastEditedDate", quote."CusQuoteHeader_CreatedDate"),
      'lastDirection', null,
      'reasonCode', 'scheduled_due',
      'dueAt', quote."CusQuoteHeader_FollowUpAt",
      'daysWaiting', greatest(0, floor(extract(epoch from (now() - quote."CusQuoteHeader_FollowUpAt")) / 86400)::integer),
      'stage', initcap(replace(quote."CusQuoteHeader_LifecycleCode", '_', ' ')),
      'location', null,
      'canCreate', false,
      'outboundAttempts', 0
    ) as item,
    (300000 + row_number() over (order by quote."CusQuoteHeader_FollowUpAt", quote."CusQuoteHeader_ID"))::bigint as original_order
    from public."CusQuote_Header" quote
    join public."cmp_Offices" office
      on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
     and office."Company_ID" = v_context.company_id
    left join public."Org_Master" customer on customer."Org_id" = quote."CusQuoteHeader_CustomerID"
    where not quote."CusQuoteHeader_IsDeleted"
      and coalesce(quote."CusQuoteHeader_SalesOwnerID", quote."CusQuoteHeader_CreatedBy") = v_context.user_id
      and quote."CusQuoteHeader_FollowUpAt" <= now()
      and quote."CusQuoteHeader_LifecycleCode" in ('sent', 'revised')
  ), candidate_items as materialized (
    select * from base_candidates
    union all select * from due_first_responses
    union all select * from due_deals
    union all select * from due_quotes
  ), enriched as materialized (
    select
      candidate.item,
      candidate.original_order,
      latest_message.message_id,
      latest_message.is_inbound,
      latest_message.has_attachments,
      latest_message.delivery_failed,
      lower(concat_ws(' ',
        candidate.item ->> 'context',
        latest_message.preview,
        latest_message.ai_intent,
        latest_message.ai_summary,
        thread_summary.summary_text
      )) as latest_text,
      lower(concat_ws(' ',
        candidate.item ->> 'subject',
        candidate.item ->> 'context',
        latest_message.preview,
        latest_message.ai_intent,
        latest_message.ai_summary,
        thread_summary.summary_text,
        lead."CRMLead_CustomerCentricNeed",
        lead."CRMLead_ServiceInterest",
        lead."CRMLead_TradeLane"
      )) as topic_text,
      lead."CRMLead_NextActionDueAt" as lead_next_action_due_at,
      lead."CRMLead_FirstResponseDueAt" as lead_first_response_due_at,
      lead."CRMLead_FirstRespondedAt" as lead_first_responded_at,
      lead."CRMLead_RatingCode" as lead_rating_code,
      lead."CRMLead_UrgencyCode" as lead_urgency_code,
      lead."CRMLead_SourceCode" as lead_source_code,
      lead."CRMLead_CustomerCentricNeed" as lead_customer_need,
      lead."CRMLead_ExpectedShipmentDate" as lead_expected_shipment_date
    from candidate_items candidate
    left join lateral (
      select
        message."CommMessage_ID" as message_id,
        message."CommMessage_IsInbound" as is_inbound,
        message."CommMessage_HasAttachments" as has_attachments,
        coalesce(nullif(btrim(message."CommMessage_BodyPreview"), ''), left(nullif(btrim(message."CommMessage_BodyText"), ''), 2000)) as preview,
        nullif(btrim(message."CommMessage_AIIntent"), '') as ai_intent,
        nullif(btrim(message."CommMessage_AISummary"), '') as ai_summary,
        exists (
          select 1
          from public."Comm_DeliveryEvents" delivery
          where delivery."CommDelivery_MessageID" = message."CommMessage_ID"
            and lower(delivery."CommDelivery_EventTypeCode") ~ '(bounce|fail|reject)'
        ) or lower(coalesce(message."CommMessage_StatusCode", '')) in ('failed', 'bounced', 'rejected') as delivery_failed
      from public."Comm_Messages" message
      where message."CommMessage_ThreadID" = nullif(candidate.item ->> 'threadId', '')::uuid
        and message."CommMessage_MailboxID" = nullif(candidate.item ->> 'mailboxId', '')::uuid
        and not message."CommMessage_IsDeleted"
        and not message."CommMessage_IsDraft"
      order by coalesce(message."CommMessage_MessageDate", message."CommMessage_ReceivedAt", message."CommMessage_SentAt", message."CommMessage_CreatedAt") desc,
        message."CommMessage_ID" desc
      limit 1
    ) latest_message on candidate.item ->> 'source' = 'email'
    left join lateral (
      select summary."CommThreadSummary_SummaryText" as summary_text
      from public."Comm_ThreadSummaries" summary
      where summary."CommThreadSummary_ThreadID" = nullif(candidate.item ->> 'threadId', '')::uuid
        and summary."CommThreadSummary_SupersededAt" is null
        and summary."CommThreadSummary_SourceLastMessageID" = latest_message.message_id
      order by summary."CommThreadSummary_GeneratedAt" desc
      limit 1
    ) thread_summary on latest_message.message_id is not null
    left join lateral (
      select lead_row.*
      from public."CRM_Leads" lead_row
      join public."sys_CRMLeadStatuses" lead_status
        on lead_status."CRMLeadStatus_Code" = lead_row."CRMLead_StatusCode"
       and lead_status."CRMLeadStatus_IsOpen"
      where lead_row."CRMLead_OwnerUserID" = v_context.user_id
        and not lead_row."CRMLead_IsDeleted"
        and lower(coalesce(lead_row."CRMLead_MetadataJSON" ->> 'isDemo', 'false')) <> 'true'
        and (
          (candidate.item ->> 'recordType' = 'lead' and lead_row."CRMLead_ID" = nullif(candidate.item ->> 'recordId', '')::uuid)
          or (
            nullif(lower(btrim(candidate.item ->> 'email')), '') is not null
            and lower(btrim(lead_row."CRMLead_Email")) = lower(btrim(candidate.item ->> 'email'))
          )
        )
      order by
        (candidate.item ->> 'recordType' = 'lead' and lead_row."CRMLead_ID" = nullif(candidate.item ->> 'recordId', '')::uuid) desc,
        lead_row."CRMLead_UpdatedAt" desc
      limit 1
    ) lead on true
  ), signals as materialized (
    select
      enriched.*,
      enriched.item ->> 'source' = 'email' and enriched.item ->> 'lastDirection' = 'inbound' as is_inbound_email,
      enriched.item ->> 'source' = 'email' and enriched.item ->> 'lastDirection' = 'outbound' as is_outbound_email,
      enriched.item ->> 'source' = 'activity' as is_crm_action,
      coalesce(enriched.latest_text, '') ~ '(^|[^a-z])(thank(s| you)|received|noted|okay|ok|perfect|great|sounds good|understood|will do|see you then|looking forward)([^a-z]|$)' as has_acknowledgement,
      coalesce(enriched.latest_text, '') ~ '(^|[^a-z])(not interested|no thank(s| you)|remove me|stop (emailing|contacting)|do not contact|don.t contact|close this out|no longer required|nothing further)([^a-z]|$)' as has_closed_conversation,
      coalesce(enriched.latest_text, '') ~ '(unsubscribe|automatic reply|auto.?reply|out of (the )?office|delivery status|undeliverable|mail delivery failed|password reset|verification code|newsletter|view in (your )?browser)' as has_automation,
      coalesce(enriched.latest_text, '') ~ '\?' or coalesce(enriched.latest_text, '') ~ '(^|[^a-z])(can|could|would|will) you([^a-z]|$)|(^|[^a-z])(please|let me know|confirm|advise|clarify|send|share|provide|need|when|where|what|which|how|why)([^a-z]|$)' as has_explicit_request,
      coalesce(enriched.topic_text, '') ~ '(^|[^a-z])(quote|quotation|rate|rates|price|pricing|cost|costs|proposal|tender)([^a-z]|$)' as has_pricing_context,
      coalesce(enriched.topic_text, '') ~ '(^|[^a-z])(collection|collect|delivery|deliver|eta|etd|arrival|depart|deadline|cut.?off|schedule|timing|when)([^a-z]|$)' as has_timing_context,
      coalesce(enriched.topic_text, '') ~ '(^|[^a-z])(document|documents|paperwork|invoice|packing list|certificate|customs|form|signature|signed|attachment)([^a-z]|$)' as has_document_context,
      coalesce(enriched.topic_text, '') ~ '(^|[^a-z])(issue|problem|concern|complaint|delay|late|missing|wrong|incorrect|damag|unable|cannot|can.t|urgent|escalat)([^a-z]|$)' as has_concern_context,
      coalesce(enriched.topic_text, '') ~ '(^|[^a-z])(meeting|call|demo|appointment|agreed|next step|next steps)([^a-z]|$)' as has_next_step_context,
      coalesce(enriched.lead_next_action_due_at <= now(), false) as has_explicit_lead_action,
      coalesce(enriched.lead_first_response_due_at <= now() and enriched.lead_first_responded_at is null, false) as has_due_first_response,
      (
        lower(coalesce(enriched.lead_rating_code, '')) in ('hot', 'qualified', 'high')
        or lower(coalesce(enriched.lead_urgency_code, '')) in ('hot', 'urgent', 'high', 'immediate')
        or lower(coalesce(enriched.lead_source_code, '')) in ('website', 'web', 'inbound', 'referral', 'contact_card', 'qr')
        or nullif(btrim(enriched.lead_customer_need), '') is not null
        or enriched.lead_expected_shipment_date between current_date and current_date + 30
      ) as has_high_intent_lead
    from enriched
  ), classified as materialized (
    select
      signals.*,
      case
        when signals.is_inbound_email and signals.has_pricing_context then 'answer_pricing'
        when signals.is_inbound_email and signals.has_timing_context then 'confirm_timing'
        when signals.is_inbound_email and signals.has_document_context and not coalesce(signals.has_attachments, false) then 'provide_documents'
        when signals.is_inbound_email and signals.has_concern_context then 'resolve_concern'
        when signals.is_inbound_email and coalesce(signals.has_attachments, false) then 'review_attachment'
        when signals.is_inbound_email and signals.has_explicit_request then 'answer_question'
        when signals.is_inbound_email then 'reply_next_step'
        when signals.is_outbound_email and signals.has_pricing_context then 'follow_up_quote'
        when signals.is_outbound_email and signals.has_document_context then 'follow_up_documents'
        when signals.is_outbound_email and signals.has_next_step_context then 'confirm_next_step'
        when signals.is_outbound_email and coalesce((signals.item ->> 'outboundAttempts')::integer, 0) >= 2 then 'follow_up_personally'
        when signals.is_outbound_email then 'follow_up_next_step'
        when signals.item ->> 'recordType' = 'quote' then 'follow_up_quote'
        when signals.item ->> 'reasonCode' = 'never_contacted' then 'make_first_contact'
        else 'complete_scheduled_action'
      end as recommendation_code,
      case
        when signals.is_inbound_email then 100
        when signals.is_crm_action and (signals.item ->> 'reasonCode' = 'scheduled_due' or signals.has_explicit_lead_action) then 88
        when signals.is_crm_action and signals.has_due_first_response then 84
        when signals.is_outbound_email then 62
        else 40
      end
      + least(coalesce((signals.item ->> 'daysWaiting')::integer, 0), 21)
      + case when signals.has_explicit_request then 12 else 0 end
      + case when signals.has_concern_context then 12 else 0 end
      + case when coalesce(signals.has_attachments, false) then 6 else 0 end
      + case when signals.has_timing_context then 5 else 0 end
      + case when signals.has_pricing_context then 5 else 0 end
      + case when signals.has_high_intent_lead then 8 else 0 end
      - least(coalesce((signals.item ->> 'outboundAttempts')::integer, 0) * 4, 8) as priority_score,
      case
        when signals.is_inbound_email then
          not signals.has_closed_conversation
          and not signals.has_automation
          and not (signals.has_acknowledgement and not signals.has_explicit_request and not signals.has_concern_context and not coalesce(signals.has_attachments, false))
        when signals.is_outbound_email then
          not coalesce(signals.delivery_failed, false)
          and not signals.has_closed_conversation
          and coalesce((signals.item ->> 'outboundAttempts')::integer, 0) between 1 and 2
        when signals.is_crm_action and signals.item ->> 'recordType' in ('deal', 'quote') then true
        when signals.is_crm_action and signals.has_explicit_lead_action then true
        when signals.is_crm_action and signals.item ->> 'reasonCode' = 'never_contacted' then
          signals.has_due_first_response or signals.has_high_intent_lead
        else false
      end as is_eligible
    from signals
  ), deduplicated as materialized (
    select classified.*,
      row_number() over (
        partition by coalesce(
          nullif(lower(btrim(classified.item ->> 'email')), ''),
          nullif(lower(btrim(concat_ws('|', classified.item ->> 'personName', classified.item ->> 'companyName'))), ''),
          nullif(lower(btrim(classified.item ->> 'companyName')), ''),
          classified.item ->> 'id'
        )
        order by classified.priority_score desc,
          nullif(classified.item ->> 'dueAt', '')::timestamptz asc nulls last,
          classified.original_order
      ) as person_rank
    from classified
    where classified.is_eligible
  ), final_items as materialized (
    select
      deduplicated.item || jsonb_build_object('recommendationCode', deduplicated.recommendation_code) as item,
      deduplicated.priority_score,
      deduplicated.original_order
    from deduplicated
    where deduplicated.person_rank = 1
    order by deduplicated.priority_score desc, deduplicated.original_order
    limit 50
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'cadence', coalesce(v_candidates -> 'cadence', jsonb_build_object('firstFollowUpDays', 3, 'secondFollowUpDays', 5)),
    'summary', jsonb_build_object(
      'total', count(*),
      'repliesDue', count(*) filter (where item ->> 'reasonCode' = 'reply_due'),
      'awaitingReply', count(*) filter (where item ->> 'reasonCode' in ('first_follow_up', 'second_follow_up')),
      'notInCrm', count(*) filter (where coalesce((item ->> 'canCreate')::boolean, false))
    ),
    'items', coalesce(jsonb_agg(item order by priority_score desc, original_order), '[]'::jsonb)
  ) into v_result
  from final_items;

  return v_result;
end;
$$;

comment on function public.multideck_crm_get_follow_up_opportunities(text) is
  'Context-aware personal follow-up queue shared by Home and CRM. It combines authorised email, explicit lead/deal next actions and quote follow-up dates; suppresses closures, acknowledgements, automation and failed delivery; returns a recommendation code but never the internal ranking reasons. The underlying email, leads, deals and quotes remain Dexter-readable and event-watchable. Exact dashboard ranking is deliberately not a Dexter domain and makes no recurring LLM calls.';

revoke all on function public.multideck_crm_get_follow_up_opportunities(text)
  from public, anon;
grant execute on function public.multideck_crm_get_follow_up_opportunities(text)
  to authenticated;

commit;
