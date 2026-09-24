begin;
set local lock_timeout = '5s';

-- Preserve the snapshot contract and its validated, shared-operator boundary.
alter function public.multideck_crm_get_sales_insights(integer,uuid,uuid)
  rename to _multideck_crm_get_sales_insights_before_series_20260922;

create function public.multideck_crm_get_sales_insights(
  p_days integer default 90, p_pipeline_id uuid default null, p_owner_id uuid default null
)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog,public,auth as $$
declare
  ctx record;
  snapshot jsonb;
  series jsonb;
  stage_distribution jsonb;
  since timestamptz;
  as_of timestamptz;
begin
  snapshot := public._multideck_crm_get_sales_insights_before_series_20260922(p_days,p_pipeline_id,p_owner_id);
  select * into ctx from public._multideck_crm_sales_context(false);
  since := (snapshot->'period'->>'from')::timestamptz;
  as_of := (snapshot->'period'->>'to')::timestamptz;

  with visible as materialized (
    select d."CRMOppty_ID" id,d."CRMOppty_PipelineStageID" stage_id,
      public._multideck_crm_deal_outcome(d) outcome
    from public."CRM_Opportunities" d
    join public."CRM_Pipelines" p on p."CRMPipeline_ID"=d."CRMOppty_PipelineID"
    join public."CRM_PipelineStages" s on s."CRMPipelineStage_ID"=d."CRMOppty_PipelineStageID"
    where p."Company_ID"=ctx.company_id and s."Company_ID"=ctx.company_id
      and public._multideck_crm_deal_is_operator_visible(d."CRMOppty_ID",ctx.company_id)
      and (p_pipeline_id is null or d."CRMOppty_PipelineID"=p_pipeline_id)
      and (p_owner_id is null or d."CRMOppty_OwnerUserID"=p_owner_id)
  ), coverage as (
    select min(e.occurred_at) started_at
    from public."CRM_DealEvents" e join visible d on d.id=e.deal_id
    where e.company_id=ctx.company_id and e.occurred_at<=as_of
  ), bounds as (
    select started_at,case when started_at is not null then greatest(since,started_at) end from_at
    from coverage
  ), weeks as (
    -- Generate calendar Mondays without depending on the session time zone/DST.
    select w at time zone 'UTC' week_start,
      (w+interval '7 days') at time zone 'UTC' week_end,
      b.from_at
    from bounds b cross join lateral generate_series(
      date_trunc('week',b.from_at at time zone 'UTC'),
      date_trunc('week',as_of at time zone 'UTC'),interval '7 days'
    ) w
    where b.from_at is not null
  ), buckets as (
    select greatest(week_start,from_at) start_at,least(week_end,as_of) end_at,
      week_start<from_at or week_end>as_of is_partial,week_end>as_of includes_as_of
    from weeks
  ), classified as materialized (
    select e.deal_id,e.occurred_at,
      e.kind='changed' and e.after_data->>'outcome'='won'
        and e.before_data->>'outcome' is distinct from 'won' won,
      e.kind='changed' and e.after_data->>'outcome'='lost'
        and e.before_data->>'outcome' is distinct from 'lost' lost,
      e.kind='created' created,
      e.kind<>'observed' and e.after_data->>'outcome'='open'
        and (e.before_data is null
          or e.before_data->>'stageId' is distinct from e.after_data->>'stageId'
          or e.before_data->>'outcome' is distinct from 'open') entered
    from public."CRM_DealEvents" e join visible d on d.id=e.deal_id
    where e.company_id=ctx.company_id and e.occurred_at>=since and e.occurred_at<=as_of
  ), counts as (
    select b.start_at,b.end_at,b.is_partial,
      count(*) filter(where e.won) won,count(*) filter(where e.lost) lost,
      count(*) filter(where e.created) created,count(*) filter(where e.entered) entered,
      array_agg(distinct e.deal_id order by e.deal_id) filter(where e.won) won_ids,
      array_agg(distinct e.deal_id order by e.deal_id) filter(where e.lost) lost_ids,
      array_agg(distinct e.deal_id order by e.deal_id) filter(where e.created) created_ids,
      array_agg(distinct e.deal_id order by e.deal_id) filter(where e.entered) entered_ids,
      array_agg(distinct e.deal_id order by e.deal_id)
        filter(where e.won or e.lost or e.created or e.entered) deal_ids
    from buckets b left join classified e
      on e.occurred_at>=b.start_at
      and (e.occurred_at<b.end_at or (b.includes_as_of and e.occurred_at=as_of))
    group by b.start_at,b.end_at,b.is_partial
  ), measured_stages as (
    select d.stage_id,greatest(0,extract(epoch from(as_of-entry.started_at))/86400) days
    from visible d
    join lateral (
      select max(e.occurred_at) started_at from public."CRM_DealEvents" e
      where e.company_id=ctx.company_id and e.deal_id=d.id and e.occurred_at<=as_of
        and e.after_data->>'stageId'=d.stage_id::text
        and (e.before_data is null
          or e.before_data->>'stageId' is distinct from e.after_data->>'stageId'
          or (e.before_data->>'outcome' is distinct from 'open' and e.after_data->>'outcome'='open'))
    ) entry on entry.started_at is not null
    where d.outcome='open'
  ), distributions as (
    select stage_id,round(min(days)::numeric,1) minimum_days,
      round((percentile_cont(0.25) within group(order by days))::numeric,1) lower_quartile_days,
      round((percentile_cont(0.75) within group(order by days))::numeric,1) upper_quartile_days,
      round(max(days)::numeric,1) maximum_days
    from measured_stages group by stage_id
  )
  select jsonb_build_object(
    'interval','week','timeZone','UTC',
    'coverageStartsAt',to_char(bounds.started_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'from',to_char(bounds.from_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'to',to_char(as_of at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'filterBasis','current_owner_and_pipeline','evidenceLimit',500,
    'metricDefinition','Recorded won and lost decisions, new deals and open-stage entries per UTC calendar week. Reopening retains earlier decisions and counts as a new open-stage entry. Initial imported observations are not decisions, new deals or entries. Counts are events, so a deal may appear more than once. Zero means no recorded events during measured coverage; earlier activity is unknown. Partial weeks are clipped to coverage, the selected period and the snapshot time.',
    'buckets',coalesce((select jsonb_agg(jsonb_build_object(
      'start',to_char(c.start_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'end',to_char(c.end_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'isPartial',c.is_partial,'won',c.won,'lost',c.lost,'created',c.created,'entered',c.entered,
      'wonDealIds',coalesce(to_jsonb(c.won_ids[1:500]),'[]'::jsonb),
      'lostDealIds',coalesce(to_jsonb(c.lost_ids[1:500]),'[]'::jsonb),
      'createdDealIds',coalesce(to_jsonb(c.created_ids[1:500]),'[]'::jsonb),
      'enteredDealIds',coalesce(to_jsonb(c.entered_ids[1:500]),'[]'::jsonb),
      'dealIds',coalesce(to_jsonb(c.deal_ids[1:500]),'[]'::jsonb),
      'evidenceTruncated',coalesce(cardinality(c.deal_ids)>500,false)
    ) order by c.start_at) from counts c),'[]'::jsonb)
  ),coalesce((select jsonb_agg(s.item||jsonb_build_object(
    'minimumDays',d.minimum_days,'lowerQuartileDays',d.lower_quartile_days,
    'upperQuartileDays',d.upper_quartile_days,'maximumDays',d.maximum_days
  ) order by s.position)
    from jsonb_array_elements(snapshot->'stages') with ordinality s(item,position)
    left join distributions d on d.stage_id=(s.item->>'id')::uuid),'[]'::jsonb)
  into series,stage_distribution from bounds;

  return snapshot||jsonb_build_object('trend',series,'stages',stage_distribution,
    'definitions',coalesce(snapshot->'definitions','{}'::jsonb)||jsonb_build_object(
      'trend',series->>'metricDefinition',
      'trendFilters','History is grouped using each visible deal''s current owner and pipeline, not its historical ownership. Recorded decisions can differ from the currently closed win-rate denominator.',
      'stageDistribution','Minimum, lower quartile, median, upper quartile and maximum observed time in the current stage, across all measured currently open deals. Unknown entry times are excluded. These are current ages, not time taken by completed deals, and are independent of the selected history period.'
    ));
end $$;

revoke all on function public._multideck_crm_get_sales_insights_before_series_20260922(integer,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.multideck_crm_get_sales_insights(integer,uuid,uuid) from public,anon;
grant execute on function public.multideck_crm_get_sales_insights(integer,uuid,uuid) to authenticated,service_role;

-- The existing Dexter adapter resolves the canonical RPC and inherits the same series.
update public."sys_AIDexterDataDomains"
set "AIDexterDomain_Description"='Measured sales snapshot, recorded weekly won/lost decisions and stage-age distributions. Includes evidence, partial-period coverage and current owner/pipeline filter definitions; no inferred prehistory.'
where "AIDexterDomain_Code"='sales_insights';

commit;
