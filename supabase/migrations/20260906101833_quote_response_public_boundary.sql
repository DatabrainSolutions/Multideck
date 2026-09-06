begin;

-- Existing service-only RPC remains the sole token/origin gate. Never expose
-- quote_api through PostgREST just to fetch customer-facing branding.
create or replace function public.quote_customer_response_view(
  requested_token_hash text,
  requested_response_origin text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  source_view jsonb;
  saved_quote jsonb;
  summary jsonb;
  prices jsonb;
  company_id uuid;
  result jsonb;
begin
  source_view := quote_api.customer_response_view(requested_token_hash, requested_response_origin);
  -- The call above validates the private token and exact response origin,
  -- including terminal link states, before any brand context is returned.
  select link.company_id into strict company_id
  from quote_api.customer_response_links link
  where link.token_hash = requested_token_hash
    and link.response_origin = requested_response_origin;

  if source_view->>'state' in ('expired', 'revoked') then
    result := jsonb_build_object('state', source_view->>'state');
  elsif source_view->>'state' = 'responded' then
    result := jsonb_build_object('state', 'responded', 'decision', source_view->>'decision', 'respondedAt', source_view->>'respondedAt');
  elsif source_view->>'state' = 'active' then
    saved_quote := source_view#>'{quote,snapshot,quote}';
    if jsonb_typeof(saved_quote) is distinct from 'object' then saved_quote := '{}'::jsonb; end if;
    select coalesce(jsonb_object_agg(field.key, field.value), '{}'::jsonb) into summary
    from jsonb_each(saved_quote) field
    where field.key in ('currency', 'loadingPoint', 'dischargePoint', 'validTo')
      and jsonb_typeof(field.value) = 'string';

    select coalesce(jsonb_agg(line.summary order by line.position), '[]'::jsonb) into prices
    from (
      select charge.position,
        (select coalesce(jsonb_object_agg(field.key, field.value), '{}'::jsonb)
         from jsonb_each(charge.value) field
         where (field.key = 'sellCurrency' and jsonb_typeof(field.value) = 'string')
           or (field.key in ('sellAmount', 'sellLocal') and
             (jsonb_typeof(field.value) = 'number' or
               (jsonb_typeof(field.value) = 'string' and field.value#>>'{}' ~ '^-?[0-9]+(\.[0-9]+)?$')))) as summary
      from jsonb_array_elements(case when jsonb_typeof(saved_quote->'charges') = 'array'
        then saved_quote->'charges' else '[]'::jsonb end) with ordinality charge(value, position)
      where jsonb_typeof(charge.value) = 'object'
        and charge.value->'showToCustomer' is distinct from 'false'::jsonb
    ) line;

    result := jsonb_build_object(
      'state', 'active', 'expiresAt', source_view->'expiresAt', 'documentId', source_view->'documentId',
      'quote', jsonb_build_object(
        'id', source_view#>'{quote,id}', 'reference', source_view#>'{quote,reference}',
        'versionNumber', source_view#>'{quote,versionNumber}',
        'snapshot', jsonb_build_object('quote', summary || jsonb_build_object('charges', prices))
      )
    );
  else
    raise exception 'This quote link is no longer available.' using errcode = 'P0002';
  end if;

  -- Server-only context. The Edge Function's explicit public projection removes
  -- this field before responding; it is not a client-selected tenant identifier.
  return result || jsonb_build_object('_brandingCompanyId', company_id);
end;
$$;

revoke all on function public.quote_customer_response_view(text,text) from public, anon, authenticated;
grant execute on function public.quote_customer_response_view(text,text) to service_role;

commit;
