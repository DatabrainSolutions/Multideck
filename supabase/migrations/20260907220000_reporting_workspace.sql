begin;
set local lock_timeout = '5s';

create schema if not exists report_api;
revoke all on schema report_api from public, anon, authenticated;

create table report_api.reports (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public."cmp_Company"("Company_ID"),
  owner_id uuid not null references public."cmp_Users"("User_ID"), name text not null check(length(btrim(name)) between 1 and 160),
  visibility text not null default 'private' check(visibility in ('private','workspace')),
  definition jsonb not null, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz
);
create index on report_api.reports(company_id, updated_at desc);
create table report_api.runs (
  id uuid primary key, report_id uuid not null references report_api.reports(id), company_id uuid not null,
  owner_id uuid not null references public."cmp_Users"("User_ID"), name text not null, report_version integer not null,
  definition jsonb not null, status text not null check(status in ('ready','failed')),
  snapshot jsonb, error text, created_at timestamptz not null default now(), schedule_id uuid,
  check((status='ready' and snapshot is not null and error is null) or (status='failed' and snapshot is null and error is not null))
);
create index on report_api.runs(owner_id,created_at desc);
create table report_api.schedules (
  id uuid primary key default gen_random_uuid(), report_id uuid not null references report_api.reports(id),
  owner_id uuid not null references public."cmp_Users"("User_ID"), company_id uuid not null,
  frequency text not null check(frequency in ('daily','weekly','monthly')),
  timezone text not null, local_time time not null, weekday integer not null default 1 check(weekday between 0 and 6),
  monthday integer not null default 1 check(monthday between 1 and 28),
  paused boolean not null default false, next_run_at timestamptz not null, last_run_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on report_api.schedules(next_run_at) where not paused;
create table report_api.audit (
  id bigint generated always as identity primary key, company_id uuid not null, actor_id uuid not null,
  report_id uuid not null, action text not null, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table report_api.reports enable row level security;
alter table report_api.runs enable row level security;
alter table report_api.schedules enable row level security;
alter table report_api.audit enable row level security;
revoke all on all tables in schema report_api from public, anon, authenticated;

create function report_api.context(actor uuid) returns public."cmp_Users"
language plpgsql stable security definer set search_path='' as $$
declare u public."cmp_Users";
begin
  select * into u from public."cmp_Users" where "Auth_User_ID"=actor and "Company_ID" is not null
    and coalesce("User_AccessStatus",'active')='active';
  if not found then raise exception 'Sign in with an active Multideck account to use Reports.' using errcode='42501'; end if;
  return u;
end $$;

-- The catalogue is also the field allowlist. No client-supplied SQL, table names or joins.
create function report_api.catalogue() returns jsonb language sql immutable set search_path='' as $$
select '[
 {"id":"jobs","label":"Jobs","permission":"Bookings.Read","description":"One row per job. Dates and routing come from the job record; deleted jobs are excluded.","defaultDate":"created","fields":[
  {"id":"reference","label":"Job reference","type":"text"},{"id":"customer","label":"Customer","type":"text"},
  {"id":"created","label":"Created date","type":"date"},{"id":"ready","label":"Ready date","type":"date"},{"id":"delivery","label":"Required delivery date","type":"date"},
  {"id":"closed","label":"Closed date","type":"date"},{"id":"status","label":"Status","type":"text"},
  {"id":"mode","label":"Transport mode","type":"text"},{"id":"direction","label":"Direction","type":"text"},
  {"id":"origin","label":"Origin","type":"text"},{"id":"destination","label":"Destination","type":"text"},
  {"id":"office","label":"Office","type":"text"},{"id":"owner","label":"Owner","type":"text"},
  {"id":"customerReference","label":"Customer reference","type":"text"},{"id":"supplierReference","label":"Supplier reference","type":"text"},
  {"id":"tracking","label":"Tracking status","type":"text"},{"id":"currency","label":"Goods currency","type":"text"},
  {"id":"goodsValue","label":"Shipment goods value","type":"money"}]},
 {"id":"sales","label":"Invoiced sales","permission":"Finance.Receivables.View","description":"One row per approved, submitted or posted sales invoice or credit note. Net amounts exclude VAT, include any duty and disbursements, and subtract credit notes. Original invoice currency; no conversion. This is invoiced sales, not cash receipts or booked revenue.","defaultDate":"date","fields":[
  {"id":"reference","label":"Invoice reference","type":"text"},{"id":"customer","label":"Customer","type":"text"},
  {"id":"date","label":"Invoice date","type":"date"},{"id":"accountingDate","label":"Accounting date","type":"date"},
  {"id":"due","label":"Due date","type":"date"},{"id":"status","label":"Status","type":"text"},
  {"id":"type","label":"Document type","type":"text"},{"id":"currency","label":"Invoice currency","type":"text"},
  {"id":"net","label":"Net invoiced sales","type":"money"},{"id":"tax","label":"VAT / tax","type":"money"},
  {"id":"gross","label":"Gross invoiced sales","type":"money"},{"id":"outstanding","label":"Outstanding amount","type":"money"}]},
 {"id":"quotes","label":"Quotes","permission":"Quotes.Read","description":"One row per quote, using its current lifecycle and customer. Draft and submitted versions are not counted as separate quotes.","defaultDate":"created","fields":[
  {"id":"reference","label":"Quote reference","type":"text"},{"id":"customer","label":"Customer","type":"text"},
  {"id":"created","label":"Created date","type":"date"},{"id":"validTo","label":"Valid until","type":"date"},
  {"id":"status","label":"Lifecycle","type":"text"},{"id":"mode","label":"Transport mode","type":"text"},
  {"id":"direction","label":"Direction","type":"text"},{"id":"customerReference","label":"Customer reference","type":"text"}]},
 {"id":"opportunities","label":"Opportunities","permission":"CRM.Read","description":"One row per opportunity. Expected and weighted values are sales forecasts, not invoiced sales.","defaultDate":"created","fields":[
  {"id":"reference","label":"Opportunity","type":"text"},{"id":"customer","label":"Customer","type":"text"},
  {"id":"created","label":"Created date","type":"date"},{"id":"expectedClose","label":"Expected close date","type":"date"},
  {"id":"won","label":"Won date","type":"date"},{"id":"stage","label":"Stage","type":"text"},{"id":"status","label":"Status","type":"text"},
  {"id":"owner","label":"Owner","type":"text"},{"id":"mode","label":"Transport mode","type":"text"},
  {"id":"currency","label":"Currency","type":"text"},{"id":"expectedValue","label":"Expected value","type":"money"},
  {"id":"weightedValue","label":"Weighted value","type":"money"}]}]'::jsonb
$$;

create function report_api.source_rows(actor uuid, source text) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
declare u public."cmp_Users"; required text;
begin
  u:=report_api.context(actor);
  select x->>'permission' into required from jsonb_array_elements(report_api.catalogue()) x where x->>'id'=source;
  if required is null or not booking_api.has_permission(actor,required) then
    raise exception 'You do not have access to this report data.' using errcode='42501'; end if;
  if source='jobs' then return query
    select jsonb_build_object('id',j."Job_ID",'sourceUrl','/bookings/'||lower(j."Job_BookingReference"),
      'reference',coalesce(j."Job_BookingReference",j."Job_Number"::text),'customer',o."Org_Name",'created',j."Job_CreatedDate"::date,
      'ready',j."Job_ReadyDate",'delivery',j."Job_RequiredDeliveryDate",'closed',j."Job_ClosedDate",'status',j."Job_Status",
      'mode',j."Job_TransportModeSummary",'direction',j."Job_Direction",'origin',j."Job_OriginNameSnapshot",'destination',j."Job_DestinationNameSnapshot",
      'office',f."Office_Name",'owner',concat_ws(' ',own."User_Firstname",own."User_Lastname"),
      'customerReference',j."Job_CustomerReference",'supplierReference',j."Job_SupplierReference",'tracking',j."Job_TrackingStatus",
      'goodsValue',j."Job_GoodsValueAmount",'currency',j."Job_GoodsValueCurrencyCode")
    from public."Job_Header" j join public."cmp_Offices" f on f."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
    left join public."Org_Master" o on o."Org_id"=j."Job_Customer"
    left join public."cmp_Users" own on own."User_ID"=j."Job_OperationsOwnerID" and own."Company_ID"=u."Company_ID"
    where f."Company_ID"=u."Company_ID" and not j."Job_IsDeleted";
  elsif source='sales' then return query
    select jsonb_build_object('id',d."FINDoc_ID",'sourceUrl','/finance/receivables/'||d."FINDoc_ID",
      'reference',d."FINDoc_Number",'customer',o."Org_Name",'date',d."FINDoc_DocumentDate",'accountingDate',d."FINDoc_AccountingDate",'due',d."FINDoc_DueDate",
      'status',d."FINDoc_StatusCode",'type',case when d."FINDoc_TypeCode"='credit_note' then 'Credit note' else 'Sales invoice' end,
      'currency',d."FINDoc_CurrencyCodeSnapshot",'net',d."FINDoc_NetAmount"*s.sign,'tax',d."FINDoc_TaxAmount"*s.sign,
      'gross',d."FINDoc_GrossAmount"*s.sign,'outstanding',d."FINDoc_OutstandingAmount"*s.sign)
    from public."FIN_Documents" d join public."cmp_LegalEntities" e on e."LegalEntity_ID"=d."FINDoc_LegalEntityID"
    left join public."Org_Master" o on o."Org_id"=d."FINDoc_PartyOrgID"
    cross join lateral (select case when d."FINDoc_TypeCode"='credit_note' then -1 else 1 end sign) s
    where e."Company_ID"=u."Company_ID" and d."FINDoc_TypeCode" in ('sl_invoice','credit_note')
      and d."FINDoc_StatusCode" in ('approved','submitted','posted');
  elsif source='quotes' then return query
    select jsonb_build_object('id',q."CusQuoteHeader_ID",'sourceUrl','/quotes/'||q."CusQuoteHeader_ID",
      'reference',q."CusQuoteHeader_Number",'customer',coalesce(q."CusQuoteHeader_CustomerNameSnapshot",o."Org_Name"),
      'created',q."CusQuoteHeader_CreatedDate"::date,'validTo',q."CusQuoteHeader_ValidTo",'status',q."CusQuoteHeader_LifecycleCode",
      'mode',q."CusQuoteHeader_ModeCode",'direction',q."CusQuoteHeader_Direction",'customerReference',q."CusQuoteHeader_CustomerReference")
    from public."CusQuote_Header" q join public."cmp_Offices" f on f."Office_ID"=coalesce(q."CusQuoteHeader_OrgOfficeID",q."OrgOffice_ID")
    left join public."Org_Master" o on o."Org_id"=q."CusQuoteHeader_CustomerID"
    where f."Company_ID"=u."Company_ID" and not q."CusQuoteHeader_IsDeleted";
  elsif source='opportunities' then return query
    select jsonb_build_object('id',p."CRMOppty_ID",'sourceUrl','/crm/deals/'||p."CRMOppty_ID",'reference',p."CRMOppty_Name",'customer',o."Org_Name",
      'created',p."CRMOppty_CreatedAt"::date,'expectedClose',p."CRMOppty_ExpectedCloseDate",'won',p."CRMOppty_WonAt"::date,
      'stage',p."CRMOppty_StageCode",'status',p."CRMOppty_StatusCode",'owner',concat_ws(' ',own."User_Firstname",own."User_Lastname"),
      'mode',p."CRMOppty_ModeCode",'currency',p."CRMOppty_CurrencyCode",'expectedValue',p."CRMOppty_ExpectedValueAmount",'weightedValue',p."CRMOppty_WeightedValueAmount")
    from public."CRM_Opportunities" p join public."cmp_Users" own on own."User_ID"=p."CRMOppty_OwnerUserID"
    left join public."Org_Master" o on o."Org_id"=p."CRMOppty_OrgID"
    where own."Company_ID"=u."Company_ID" and not p."CRMOppty_IsDeleted";
  end if;
end $$;

create function report_api.date_range(period jsonb, at_date date default current_date) returns daterange
language plpgsql immutable set search_path='' as $$
declare first_day date; last_day date;
begin
  case period->>'preset'
    when 'last12months' then first_day:=(at_date-interval '12 months')::date; last_day:=at_date+1;
    when 'last2months' then first_day:=(date_trunc('month',at_date)-interval '2 months')::date;last_day:=date_trunc('month',at_date)::date;
    when 'lastmonth' then first_day:=(date_trunc('month',at_date)-interval '1 month')::date;last_day:=date_trunc('month',at_date)::date;
    when 'thismonth' then first_day:=date_trunc('month',at_date)::date;last_day:=at_date+1;
    when 'custom' then first_day:=(period->>'start')::date;last_day:=(period->>'end')::date+1;
    else raise exception 'Choose a report period.' using errcode='22023';
  end case;
  if first_day is null or last_day is null or first_day>=last_day or last_day-first_day>3660 then
    raise exception 'Choose a valid date range of no more than ten years.' using errcode='22023';end if;
  return daterange(first_day,last_day,'[)');
end $$;

create function report_api.query(actor uuid, spec jsonb, row_limit integer default 200) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cat jsonb; fields jsonb; field jsonb; rule jsonb; key text; kind text; predicate text:=''; clauses text[]:='{}';
  selected text[]; chosen text; measure text; aggregate_sql text; group_sql text; where_sql text; query_sql text;
  span daterange; result jsonb; total bigint; maximum integer:=least(10000,greatest(1,row_limit)); previous jsonb; prev_spec jsonb;
begin
  select x into cat from jsonb_array_elements(report_api.catalogue()) x where x->>'id'=spec->>'source';
  if cat is null then raise exception 'Choose a data source.' using errcode='22023';end if;
  -- Always check access even when there are no matching source rows.
  perform report_api.context(actor);
  if not booking_api.has_permission(actor,cat->>'permission') then raise exception 'You do not have access to this report data.' using errcode='42501';end if;
  fields:=cat->'fields';span:=report_api.date_range(spec->'period');
  if not exists(select 1 from jsonb_array_elements(fields) f where f->>'id'=spec->>'dateField' and f->>'type'='date') then
    raise exception 'Choose which date the report uses.' using errcode='22023';end if;
  if jsonb_typeof(spec->'columns') is distinct from 'array' or jsonb_array_length(spec->'columns') not between 1 and 30 then
    raise exception 'Choose at least one column, up to 30.' using errcode='22023';end if;
  selected:=array(select jsonb_array_elements_text(spec->'columns'));
  foreach key in array selected loop
    if not exists(select 1 from jsonb_array_elements(fields) f where f->>'id'=key) then raise exception 'A selected column is unavailable.' using errcode='22023';end if;
  end loop;
  if jsonb_typeof(coalesce(spec->'filters','[]'))<>'array' or jsonb_array_length(coalesce(spec->'filters','[]'))>20 then
    raise exception 'Use up to 20 filters.' using errcode='22023';end if;
  for rule in select * from jsonb_array_elements(coalesce(spec->'filters','[]')) loop
    key:=rule->>'field'; select f->>'type' into kind from jsonb_array_elements(fields) f where f->>'id'=key;
    if kind is null or length(coalesce(rule->>'value',''))>500 then raise exception 'Check the selected filter.' using errcode='22023';end if;
    if rule->>'op'='empty' then predicate:=format('(r->>%L is null or r->>%L='''')',key,key);
    elsif rule->>'op'='notEmpty' then predicate:=format('(r->>%L is not null and r->>%L<>'''')',key,key);
    elsif rule->>'op' in ('eq','neq','contains') then
      predicate:=case rule->>'op' when 'eq' then format('lower(coalesce(r->>%L,''''))=lower(%L)',key,rule->>'value')
        when 'neq' then format('lower(coalesce(r->>%L,''''))<>lower(%L)',key,rule->>'value')
        else format('strpos(lower(coalesce(r->>%L,'''')),lower(%L))>0',key,rule->>'value') end;
    elsif rule->>'op' in ('gte','lte') and kind in ('date','money','number') then
      if kind='date' then perform (rule->>'value')::date; else perform (rule->>'value')::numeric; end if;
      predicate:=format('(r->>%L)::%s %s %L::%s',key,case when kind='date' then 'date' else 'numeric' end,
        case when rule->>'op'='gte' then '>=' else '<=' end,rule->>'value',case when kind='date' then 'date' else 'numeric' end);
    else raise exception 'Choose a supported filter condition.' using errcode='22023';end if;
    clauses:=array_append(clauses,predicate);
  end loop;
  where_sql:=format('(r->>%L)::date >= $3 and (r->>%L)::date < $4',spec->>'dateField',spec->>'dateField');
  if cardinality(clauses)>0 then where_sql:=where_sql||' and ('||array_to_string(clauses,case when spec->>'filterMatch'='any' then ' or ' else ' and ' end)||')';end if;
  if nullif(spec->>'documentCustomer','') is not null then
    where_sql:=where_sql||format(' and lower(r->>''customer'')=lower(%L)',spec->>'documentCustomer');
  end if;
  if nullif(spec->>'currency','') is not null then
    if spec->>'currency' !~ '^[A-Z]{3}$' then raise exception 'Use a three-letter currency code.' using errcode='22023';end if;
    where_sql:=where_sql||format(' and r->>''currency''=%L',spec->>'currency');
  end if;
  query_sql:='with source as materialized (select r from report_api.source_rows($1,$2) r where '||where_sql||') ';
  if spec->>'mode'='summary' then
    measure:=coalesce(spec->>'measure','count');chosen:=spec->>'groupBy';
    if measure='count' then aggregate_sql:='count(*)::numeric';
    else
      select f into field from jsonb_array_elements(fields) f where f->>'id'=measure and f->>'type' in ('money','number');
      if field is null then raise exception 'Choose a number to measure.' using errcode='22023';end if;
      if field->>'type'='money' and nullif(spec->>'currency','') is null then raise exception 'Choose one currency before adding monetary amounts.' using errcode='22023';end if;
      if coalesce(spec->>'aggregation','sum') not in ('sum','avg','min','max') then raise exception 'Choose sum, average, minimum or maximum.' using errcode='22023';end if;
      aggregate_sql:=format('coalesce(%s((r->>%L)::numeric),0)',coalesce(spec->>'aggregation','sum'),measure);
    end if;
    if chosen='month' then group_sql:=format('to_char((r->>%L)::date,''YYYY-MM'')',spec->>'dateField');
    elsif chosen='day' then group_sql:=format('r->>%L',spec->>'dateField');
    elsif chosen='total' then group_sql:='''Total''::text';
    elsif exists(select 1 from jsonb_array_elements(fields) f where f->>'id'=chosen) then group_sql:=format('coalesce(nullif(r->>%L,''''),''Unspecified'')',chosen);
    else raise exception 'Choose how to group the result.' using errcode='22023';end if;
    execute query_sql||format(', grouped as (select %s label,%s value,count(*) records from source group by 1),
      output as (select * from grouped order by label limit %s)
      select jsonb_build_object(''rows'',coalesce((select jsonb_agg(to_jsonb(output)) from output),''[]''),
      ''total'',(select count(*) from grouped),''recordCount'',(select count(*) from source),''value'',(select %s from source))',group_sql,aggregate_sql,maximum,aggregate_sql)
      into result using actor,spec->>'source',lower(span),upper(span);
    if chosen in ('month','day') then
      -- Include zero months/days, so the absence of invoices is not hidden in a trend.
      select result||jsonb_build_object('rows',coalesce(jsonb_agg(jsonb_build_object('label',label,'value',coalesce(row->'value','0'::jsonb),'records',coalesce(row->'records','0'::jsonb)) order by label),'[]')) into result
      from (select to_char(d,case when chosen='month' then 'YYYY-MM' else 'YYYY-MM-DD' end) label
        from generate_series(case when chosen='month' then date_trunc('month',lower(span)) else lower(span)::timestamp end,
          (upper(span)-1)::timestamp,case when chosen='month' then interval '1 month' else interval '1 day' end) d) buckets
      left join lateral (select x row from jsonb_array_elements(result->'rows') x where x->>'label'=buckets.label) matches on true;
      result:=result||jsonb_build_object('total',jsonb_array_length(result->'rows'));
    end if;
  elsif spec->>'mode'='rows' then
    key:=coalesce(spec#>>'{sort,field}',spec->>'dateField');select f->>'type' into kind from jsonb_array_elements(fields) f where f->>'id'=key;
    if kind is null then raise exception 'Choose a valid sort column.' using errcode='22023';end if;
    group_sql:=case when kind in ('money','number') then format('(r->>%L)::numeric',key) else format('r->>%L',key) end;
    execute query_sql||format(', output as (select (select jsonb_object_agg(k,v) from jsonb_each(r) e(k,v) where k=any($5) or k in (''id'',''sourceUrl'')) row
      from source order by %s %s nulls last,r->>''id'' limit %s)
      select jsonb_build_object(''rows'',coalesce((select jsonb_agg(row) from output),''[]''),''total'',(select count(*) from source),''recordCount'',(select count(*) from source))',
      group_sql,case when spec#>>'{sort,direction}'='asc' then 'asc' else 'desc' end,maximum)
      into result using actor,spec->>'source',lower(span),upper(span),selected;
  else raise exception 'Choose individual rows or a summary.' using errcode='22023';end if;
  if (result->>'total')::integer>maximum and row_limit>=10000 then raise exception 'This report exceeds 10,000 rows. Narrow the period or summarise before generating a snapshot.' using errcode='54000';end if;
  if spec->>'compare'='previous' and spec->>'mode'='summary' then
    prev_spec:=spec||jsonb_build_object('compare','none','groupBy','total','period',jsonb_build_object('preset','custom',
      'start',lower(span)-(upper(span)-lower(span)),'end',lower(span)-1));
    if spec#>>'{period,preset}' in ('last2months','lastmonth') then prev_spec:=prev_spec||jsonb_build_object('period',jsonb_build_object('preset','custom',
      'start',(lower(span)-case when spec#>>'{period,preset}'='last2months' then interval '2 months' else interval '1 month' end)::date,'end',lower(span)-1));end if;
    previous:=report_api.query(actor,prev_spec,maximum);
    result:=result||jsonb_build_object('comparison',jsonb_build_object('value',previous->'value','start',previous->'start','end',previous->'end',
      'change',(result->>'value')::numeric-(previous->>'value')::numeric,
      'percent',case when (previous->>'value')::numeric<>0 then round(((result->>'value')::numeric-(previous->>'value')::numeric)/abs((previous->>'value')::numeric)*100,2) end));
  end if;
  return result||jsonb_build_object('source',cat->>'id','description',cat->>'description','start',lower(span),'end',upper(span)-1,
    'generatedAt',now(),'columns',case when spec->>'mode'='summary' then '[{"id":"label","label":"Group","type":"text"},{"id":"value","label":"Value","type":"number"},{"id":"records","label":"Records","type":"number"}]'::jsonb
      else (select jsonb_agg(f order by array_position(selected,f->>'id')) from jsonb_array_elements(fields) f where f->>'id'=any(selected)) end,
    'truncated',(result->>'total')::integer>maximum);
end $$;

create function report_api.render(actor uuid, definition jsonb, maximum integer default 200) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare b jsonb; spec jsonb; output jsonb:='[]';
begin
  if octet_length(definition::text)>131072 or definition->>'version' is distinct from '1' or coalesce(definition->>'kind','') not in ('table','chart','document') then
    raise exception 'This report definition is not supported.' using errcode='22023';end if;
  if definition->>'kind' in ('table','chart') then
    return jsonb_build_object('kind',definition->>'kind','query',report_api.query(actor,definition->'query',maximum));end if;
  perform report_api.date_range(definition->'period');
  if jsonb_typeof(definition->'blocks') is distinct from 'array' or jsonb_array_length(definition->'blocks') not between 1 and 24 then
    raise exception 'Add between one and 24 document sections.' using errcode='22023';end if;
  for b in select * from jsonb_array_elements(definition->'blocks') loop
    if length(coalesce(b->>'title',''))>160 or length(coalesce(b->>'text',''))>12000 then raise exception 'Shorten the document section.' using errcode='22023';end if;
    if b->>'kind'='text' then output:=output||jsonb_build_array(b);
    elsif b->>'kind' in ('table','chart') then
      spec:=b->'query';
      if coalesce(b->>'useDocumentPeriod','true')='true' then spec:=spec||jsonb_build_object('period',definition->'period');end if;
      if nullif(definition->>'customer','') is not null and coalesce(b->>'useDocumentCustomer','true')='true' then
        -- Document customer is always an AND condition, including blocks with an ANY filter group.
        spec:=spec||jsonb_build_object('documentCustomer',definition->>'customer');
      end if;
      output:=output||jsonb_build_array(b||jsonb_build_object('query',spec,'result',report_api.query(actor,spec,maximum)));
    else raise exception 'Choose a table, chart or text section.' using errcode='22023';end if;
  end loop;
  return jsonb_build_object('kind','document','blocks',output,'generatedAt',now());
end $$;

create function report_api.can_read(actor uuid, target report_api.reports) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare u public."cmp_Users"; src text; required text;
begin
  u:=report_api.context(actor);
  if target.company_id is distinct from u."Company_ID" or target.archived_at is not null or (target.owner_id<>u."User_ID" and target.visibility<>'workspace') then return false;end if;
  for src in select target.definition#>>'{query,source}' where target.definition->>'kind'<>'document'
    union select b#>>'{query,source}' from jsonb_array_elements(coalesce(target.definition->'blocks','[]')) b where b->>'kind'<>'text' loop
    select x->>'permission' into required from jsonb_array_elements(report_api.catalogue()) x where x->>'id'=src;
    if required is null or not booking_api.has_permission(actor,required) then return false;end if;
  end loop;
  return true;
end $$;

create function report_api.run(actor uuid, target uuid, run_id uuid, scheduled uuid default null) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare u public."cmp_Users"; r report_api.reports; snapshot jsonb; problem text; saved report_api.runs;
begin
  u:=report_api.context(actor);
  select * into r from report_api.reports where id=target;
  if not found or not report_api.can_read(actor,r) then raise exception 'This report is unavailable or your data access has changed.' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended(run_id::text,0));
  select * into saved from report_api.runs where id=run_id;
  if found then
    if saved.owner_id<>u."User_ID" or saved.report_id<>target then raise exception 'This run is unavailable.' using errcode='42501';end if;
    return to_jsonb(saved);end if;
  begin
    snapshot:=report_api.render(actor,r.definition,10000);
    if octet_length(snapshot::text)>20000000 then raise exception 'This snapshot is too large. Reduce the report or split it into smaller reports.';end if;
  exception when others then problem:=sqlerrm;
  end;
  insert into report_api.runs(id,report_id,company_id,owner_id,name,report_version,definition,status,snapshot,error,schedule_id)
    values(run_id,r.id,r.company_id,u."User_ID",r.name,r.version,r.definition,case when problem is null then 'ready' else 'failed' end,
      case when problem is null then snapshot end,problem,scheduled) returning * into saved;
  insert into report_api.audit(company_id,actor_id,report_id,action,detail) values(r.company_id,u."User_ID",r.id,'run',jsonb_build_object('runId',run_id,'status',saved.status));
  return to_jsonb(saved);
end $$;

create function report_api.next_time(frequency text, zone text, local_time time, weekday integer, monthday integer, after_time timestamptz)
returns timestamptz language plpgsql stable set search_path='' as $$
declare d date; candidate timestamptz;
begin
  if frequency not in ('daily','weekly','monthly') or weekday not between 0 and 6 or monthday not between 1 and 28
    or not exists(select 1 from pg_timezone_names where name=zone) then raise exception 'Check the schedule frequency, date and timezone.' using errcode='22023';end if;
  for i in 0..63 loop
    d:=(after_time at time zone zone)::date+i;candidate:=(d+local_time) at time zone zone;
    if candidate>after_time and (frequency='daily' or (frequency='weekly' and extract(dow from d)=weekday) or (frequency='monthly' and extract(day from d)=monthday)) then return candidate;end if;
  end loop;
  raise exception 'A next run could not be calculated.';
end $$;

create function report_api.save(actor uuid,payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare u public."cmp_Users";r report_api.reports;
begin
  u:=report_api.context(actor);
    if length(btrim(coalesce(payload->>'name',''))) not between 1 and 160 or coalesce(payload->>'visibility','private') not in ('private','workspace') then raise exception 'Give the report a name and choose who can view it.' using errcode='22023';end if;
    perform report_api.render(actor,payload->'definition',1);
    if nullif(payload->>'id','') is null then
      insert into report_api.reports(company_id,owner_id,name,visibility,definition)
        values(u."Company_ID",u."User_ID",btrim(payload->>'name'),coalesce(payload->>'visibility','private'),payload->'definition') returning * into r;
    else
      select * into r from report_api.reports where id=(payload->>'id')::uuid for update;
      if not found or r.owner_id<>u."User_ID" or r.company_id<>u."Company_ID" or r.archived_at is not null then raise exception 'Only the report owner can edit it. Save your own copy.' using errcode='42501';end if;
      if r.version is distinct from (payload->>'version')::integer then raise exception 'This report has changed since you opened it. Save a copy to keep your changes, or reopen the latest version.' using errcode='40001';end if;
      update report_api.reports set name=btrim(payload->>'name'),visibility=payload->>'visibility',definition=payload->'definition',version=version+1,updated_at=now() where id=r.id returning * into r;
    end if;
    insert into report_api.audit(company_id,actor_id,report_id,action,detail) values(u."Company_ID",u."User_ID",r.id,'save',jsonb_build_object('version',r.version,'visibility',r.visibility));
    return to_jsonb(r);
end $$;

create function public.reporting_workspace(action text, payload jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
#variable_conflict use_column
declare u public."cmp_Users"; r report_api.reports; s report_api.schedules; result jsonb; identifier uuid; next_at timestamptz;
begin
  u:=report_api.context(auth.uid());
  if action='list' then return jsonb_build_object('userId',u."User_ID",'catalogue',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(report_api.catalogue()) x where booking_api.has_permission(auth.uid(),x->>'permission')),
    'reports',(select coalesce(jsonb_agg(to_jsonb(r) order by r.updated_at desc),'[]') from report_api.reports r where report_api.can_read(auth.uid(),r)),
    'schedules',(select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('name',r.name) order by s.next_run_at),'[]') from report_api.schedules s join report_api.reports r on r.id=s.report_id where s.owner_id=u."User_ID" and s.company_id=u."Company_ID"),
    'runs',(select coalesce(jsonb_agg(x order by x->>'created_at' desc),'[]') from (select to_jsonb(h)-'snapshot'-'definition' x from report_api.runs h join report_api.reports r on r.id=h.report_id where h.owner_id=u."User_ID" and report_api.can_read(auth.uid(),r) order by h.created_at desc limit 100) selected));
  elsif action='preview' then return report_api.render(auth.uid(),payload->'definition',200);
  elsif action='save' then return report_api.save(auth.uid(),payload);
  elsif action='run' then return report_api.run(auth.uid(),(payload->>'id')::uuid,(payload->>'runId')::uuid);
  elsif action='get_run' then
    select h.definition into result from report_api.runs h join report_api.reports r on r.id=h.report_id
      where h.id=(payload->>'id')::uuid and h.owner_id=u."User_ID" and report_api.can_read(auth.uid(),r);
    if not found then raise exception 'This saved snapshot is unavailable.' using errcode='42501';end if;
    -- Recheck historical sources too: an edited report must not grant access to an older finance snapshot.
    r.company_id:=u."Company_ID";r.owner_id:=u."User_ID";r.visibility:='private';r.definition:=result;r.archived_at:=null;
    if not report_api.can_read(auth.uid(),r) then raise exception 'Your access to this snapshot data has changed.' using errcode='42501';end if;
    select to_jsonb(h) into result from report_api.runs h where id=(payload->>'id')::uuid;return result;
  elsif action='schedule' then
    select * into r from report_api.reports where id=(payload->>'reportId')::uuid;
    if not found or not report_api.can_read(auth.uid(),r) then raise exception 'Choose an available saved report.' using errcode='42501';end if;
    next_at:=report_api.next_time(payload->>'frequency',payload->>'timezone',(payload->>'localTime')::time,coalesce((payload->>'weekday')::integer,1),coalesce((payload->>'monthday')::integer,1),now());
    if nullif(payload->>'id','') is not null then
      select * into s from report_api.schedules where id=(payload->>'id')::uuid for update;
      if not found or s.owner_id<>u."User_ID" or s.company_id<>u."Company_ID" then raise exception 'This schedule is unavailable.' using errcode='42501';end if;
      if s.updated_at is distinct from (payload->>'updatedAt')::timestamptz then raise exception 'This schedule changed. Reopen it before saving.' using errcode='40001';end if;
      update report_api.schedules set report_id=r.id,frequency=payload->>'frequency',timezone=payload->>'timezone',local_time=(payload->>'localTime')::time,
        weekday=coalesce((payload->>'weekday')::integer,1),monthday=coalesce((payload->>'monthday')::integer,1),paused=coalesce((payload->>'paused')::boolean,false),next_run_at=next_at,updated_at=now() where id=s.id returning * into s;
    else
      insert into report_api.schedules(report_id,owner_id,company_id,frequency,timezone,local_time,weekday,monthday,next_run_at)
        values(r.id,u."User_ID",u."Company_ID",payload->>'frequency',payload->>'timezone',(payload->>'localTime')::time,
          coalesce((payload->>'weekday')::integer,1),coalesce((payload->>'monthday')::integer,1),next_at) returning * into s;
    end if;
    insert into report_api.audit(company_id,actor_id,report_id,action,detail) values(u."Company_ID",u."User_ID",r.id,'schedule',to_jsonb(s));
    return to_jsonb(s);
  elsif action='archive' then
    select * into r from report_api.reports where id=(payload->>'id')::uuid for update;
    if not found or r.owner_id<>u."User_ID" or r.company_id<>u."Company_ID" then raise exception 'Only the report owner can archive it.' using errcode='42501';end if;
    update report_api.reports set archived_at=now(),updated_at=now() where id=r.id;
    update report_api.schedules set paused=true,updated_at=now() where report_id=r.id;
    insert into report_api.audit(company_id,actor_id,report_id,action) values(u."Company_ID",u."User_ID",r.id,'archive');
    return jsonb_build_object('archived',true);
  end if;
  raise exception 'This reporting action is unavailable.' using errcode='22023';
end $$;

-- No LLM or external email is involved in scheduled snapshots. Each run rechecks the owner's access.
create function report_api.process_due() returns integer language plpgsql volatile security definer set search_path='' as $$
declare s report_api.schedules; actor uuid; result jsonb; processed integer:=0; r report_api.reports;
begin
  for s in select * from report_api.schedules where not paused and next_run_at<=now() order by next_run_at limit 5 for update skip locked loop
    begin
      select "Auth_User_ID" into actor from public."cmp_Users" where "User_ID"=s.owner_id and "Company_ID"=s.company_id;
      result:=report_api.run(actor,s.report_id,gen_random_uuid(),s.id);
    exception when others then
      select * into r from report_api.reports where id=s.report_id;
      insert into report_api.runs(id,report_id,company_id,owner_id,name,report_version,definition,status,error,schedule_id)
        values(gen_random_uuid(),r.id,s.company_id,s.owner_id,r.name,r.version,r.definition,'failed','The report could not run. Reopen it and check your current data access.',s.id);
      update report_api.schedules set paused=true where id=s.id;
    end;
    update report_api.schedules set last_run_at=now(),next_run_at=report_api.next_time(s.frequency,s.timezone,s.local_time,s.weekday,s.monthday,now()),updated_at=now() where id=s.id;
    processed:=processed+1;
  end loop;
  return processed;
end $$;

revoke all on all functions in schema report_api from public,anon,authenticated;
revoke all on function public.reporting_workspace(text,jsonb) from public,anon;
grant execute on function public.reporting_workspace(text,jsonb) to authenticated;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('multideck-report-snapshots','* * * * *','select report_api.process_due()');
  end if;
end $$;
commit;
