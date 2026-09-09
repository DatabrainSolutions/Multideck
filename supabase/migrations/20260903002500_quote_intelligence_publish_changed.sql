-- Publish only changed deterministic evidence. Keep the worker/AI queue and
-- existing domain events intact; a repeated calculation must not emit another
-- realtime update or overwrite the worker's AI state.
begin;

create or replace function public.quote_intelligence_publish_snapshot(
  p_company_id uuid,
  p_quote_id uuid,
  p_quote_updated_at timestamptz,
  p_snapshot jsonb,
  p_calculated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_revision timestamptz;
  saved public."CusQuote_Intelligence";
begin
  select coalesce(quote."CusQuoteHeader_LastEditedDate", quote."CusQuoteHeader_CreatedDate")
  into current_revision
  from public."CusQuote_Header" quote
  join public."cmp_Offices" office
    on office."Office_ID" = coalesce(quote."CusQuoteHeader_OrgOfficeID", quote."OrgOffice_ID")
  where quote."CusQuoteHeader_ID" = p_quote_id
    and office."Company_ID" = p_company_id
    and not quote."CusQuoteHeader_IsDeleted"
  for share of quote;
  if not found then raise exception 'That quote is outside this workspace.' using errcode = '42501'; end if;

  if current_revision is not distinct from p_quote_updated_at then
    insert into public."CusQuote_Intelligence" as existing (
      "CusQuoteIntelligence_QuoteID", "Company_ID", "CusQuoteIntelligence_StateCode",
      "CusQuoteIntelligence_DeterministicJSON", "CusQuoteIntelligence_InputFingerprint",
      "CusQuoteIntelligence_EvidenceFingerprint", "CusQuoteIntelligence_AlgorithmVersion",
      "CusQuoteIntelligence_CalculatedAt", "CusQuoteIntelligence_UpdatedAt"
    ) values (
      p_quote_id, p_company_id, p_snapshot ->> 'state', p_snapshot,
      p_snapshot ->> 'inputFingerprint', p_snapshot ->> 'evidenceFingerprint',
      p_snapshot ->> 'algorithmVersion', p_calculated_at, p_calculated_at
    ) on conflict ("CusQuoteIntelligence_QuoteID") do update set
      "CusQuoteIntelligence_StateCode" = excluded."CusQuoteIntelligence_StateCode",
      "CusQuoteIntelligence_DeterministicJSON" = excluded."CusQuoteIntelligence_DeterministicJSON",
      "CusQuoteIntelligence_InputFingerprint" = excluded."CusQuoteIntelligence_InputFingerprint",
      "CusQuoteIntelligence_EvidenceFingerprint" = excluded."CusQuoteIntelligence_EvidenceFingerprint",
      "CusQuoteIntelligence_AlgorithmVersion" = excluded."CusQuoteIntelligence_AlgorithmVersion",
      "CusQuoteIntelligence_CalculatedAt" = excluded."CusQuoteIntelligence_CalculatedAt",
      "CusQuoteIntelligence_UpdatedAt" = excluded."CusQuoteIntelligence_UpdatedAt"
    where (existing."CusQuoteIntelligence_CalculatedAt" is null or existing."CusQuoteIntelligence_CalculatedAt" <= excluded."CusQuoteIntelligence_CalculatedAt")
      and existing."CusQuoteIntelligence_DeterministicJSON" is distinct from excluded."CusQuoteIntelligence_DeterministicJSON"
    returning * into saved;
  end if;

  if saved."CusQuoteIntelligence_QuoteID" is null then
    select * into saved from public."CusQuote_Intelligence"
    where "CusQuoteIntelligence_QuoteID" = p_quote_id and "Company_ID" = p_company_id;
  end if;
  return case when saved."CusQuoteIntelligence_QuoteID" is null then null else to_jsonb(saved) end;
end;
$$;

revoke all on function public.quote_intelligence_publish_snapshot(uuid, uuid, timestamptz, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.quote_intelligence_publish_snapshot(uuid, uuid, timestamptz, jsonb, timestamptz) to service_role;
commit;
