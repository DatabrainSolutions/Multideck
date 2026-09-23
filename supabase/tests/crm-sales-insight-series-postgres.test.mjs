import test from 'node:test'
import {readFileSync} from 'node:fs'
import {withProductPostgres} from './local-product-postgres.mjs'
import {createCrmSalesFixture} from './crm-sales-fixture.mjs'

const migration=readFileSync(new URL('../migrations/20260922161000_crm_sales_insight_series.sql',import.meta.url),'utf8')
const fixture=(sql,ok)=>{
  createCrmSalesFixture(sql,ok)
  ok(sql(migration))
  ok(sql(`create function test_monday() returns timestamptz language sql stable as $$select date_trunc('week',now() at time zone 'UTC') at time zone 'UTC'$$;
    create function stamp_events(n int,at_time timestamptz) returns void language sql as $$update "CRM_DealEvents" set occurred_at=at_time where deal_id=fid(n) and kind='changed' and occurred_at=now()$$;`))
}

test('weekly CRM history uses recorded decisions, retains reopened losses, and groups UTC calendar weeks',()=>withProductPostgres((sql,ok)=>{
  fixture(sql,ok)
  ok(sql(`begin;
    -- Imported observations establish coverage, but never count as fresh deals/decisions.
    update "CRM_DealEvents" set kind='observed',occurred_at=test_monday()-interval '21 days'+interval '12 hours';
    update "CRM_DealEvents" set occurred_at=now()-interval '300 days' where deal_id=fid(5);
    update "CRM_DealEvents" set kind='created',occurred_at=test_monday()-interval '14 days'+interval '10 hours' where deal_id=fid(4);
    set role authenticated;select login(2);
    select multideck_crm_lose_deal(fid(1),deal_version(1),'{"reasonCode":"price"}');
    reset role;select stamp_events(1,test_monday()-interval '7 days 1 second');
    set role authenticated;
    select multideck_crm_reopen_deal(fid(1),deal_version(1),fid(210),'New budget');
    reset role;select stamp_events(1,test_monday()-interval '7 days');
    set role authenticated;
    select multideck_crm_lose_deal(fid(1),deal_version(1),'{"reasonCode":"timing"}');
    reset role;select stamp_events(1,test_monday()-interval '7 days'+interval '1 hour');
    set role authenticated;
    select multideck_crm_reopen_deal(fid(1),deal_version(1),fid(210),'Date agreed');
    reset role;select stamp_events(1,test_monday()-interval '7 days'+interval '2 hours');
    set role authenticated;
    select multideck_crm_lose_deal(fid(1),deal_version(1),'{"reasonCode":"cancelled"}');
    reset role;select stamp_events(1,test_monday()-interval '7 days'+interval '3 hours');
    set role authenticated;
    select multideck_crm_reopen_deal(fid(1),deal_version(1),fid(210),'Customer returned');
    reset role;select stamp_events(1,test_monday()-interval '7 days'+interval '4 hours');
    set role authenticated;
    select multideck_crm_update_deal(fid(2),deal_version(2),'{"opportunityTypeCode":"spot_shipment"}');
    select multideck_crm_win_deal(fid(2),fid(212),'Customer accepted');
    reset role;select stamp_events(2,test_monday()-interval '6 days');
    set local time zone 'Pacific/Auckland';
    set role authenticated;
    do $$declare s jsonb:=multideck_crm_get_sales_insights(30);t jsonb;previous_week jsonb;begin
      t:=s->'trend';
      perform test_assert(t->>'timeZone'='UTC' and t->>'interval'='week','explicit UTC weekly metric');
      perform test_assert((t->>'coverageStartsAt')::timestamptz=test_monday()-interval '21 days'+interval '12 hours','foreign earlier history does not extend coverage');
      perform test_assert((t->'buckets'->0->>'start')::timestamptz=(t->>'coverageStartsAt')::timestamptz,'first bucket begins at actual observation');
      perform test_assert((t->'buckets'->0->>'isPartial')::boolean,'coverage cuts the first week');
      perform test_assert((t->'buckets'->-1->>'isPartial')::boolean,'as-of cuts the last week');
      perform test_assert((select sum((b->>'won')::int) from jsonb_array_elements(t->'buckets') b)=1,'one actual win');
      perform test_assert((select sum((b->>'lost')::int) from jsonb_array_elements(t->'buckets') b)=3,'all prior losses remain after reopening');
      perform test_assert((select sum((b->>'created')::int) from jsonb_array_elements(t->'buckets') b)=1,'observed imports do not count as created');
      perform test_assert((select sum((b->>'entered')::int) from jsonb_array_elements(t->'buckets') b)=4,'new open deal plus three reopens are entries');
      select b into previous_week from jsonb_array_elements(t->'buckets') b where (b->>'start')::timestamptz=test_monday()-interval '7 days';
      perform test_assert((previous_week->>'lost')::int=2,'Sunday and Monday are separate UTC weeks even in non-UTC session');
      perform test_assert(jsonb_array_length(previous_week->'lostDealIds')=1 and previous_week->'lostDealIds'->>0=fid(1)::text,'counts events but source deal IDs stay distinct');
      perform test_assert((previous_week->>'entered')::int=3,'Monday boundary included once');
      perform test_assert(not(previous_week->>'isPartial')::boolean,'complete calendar week identified');
      perform test_assert((s->'summary'->>'closedDeals')::int=1 and (s->'summary'->>'winRatePct')::numeric=100,'current closed denominator excludes reopened losses');
      perform test_assert(s->'definitions'->>'trendFilters' like '%current owner%','historical ownership is not claimed');
      perform test_assert(not(s::text like '%'||fid(5)::text||'%'),'no foreign deal anywhere in snapshot');
      perform test_assert(query_insights()->0->'trend'=multideck_crm_get_sales_insights(90)->'trend','Dexter receives canonical series with same access');
    end $$;
    reset role;
    do $$declare old jsonb:=_multideck_crm_get_sales_insights_before_series_20260922(30,null,null);new jsonb:=multideck_crm_get_sales_insights(30);begin
      perform test_assert((new-array['trend','stages','definitions'])=(old-array['stages','definitions']),'all pre-existing snapshot keys unchanged');
      perform test_assert((select jsonb_agg(s-array['minimumDays','lowerQuartileDays','upperQuartileDays','maximumDays']) from jsonb_array_elements(new->'stages') s)=old->'stages','stage additions preserve original fields and order');
    end $$;
    rollback;`))
}))

test('CRM trend excludes pre-period and undated history without filling invented prehistory',()=>withProductPostgres((sql,ok)=>{
  fixture(sql,ok)
  ok(sql(`begin;
    update "CRM_DealEvents" set kind='observed',occurred_at=now()-interval '60 days';
    set role authenticated;select login(2);
    select multideck_crm_lose_deal(fid(1),deal_version(1),'{"reasonCode":"price"}');
    reset role;select stamp_events(1,now()-interval '40 days');
    set role authenticated;
    select multideck_crm_reopen_deal(fid(1),deal_version(1),fid(210),'Now interested');
    reset role;select stamp_events(1,now()-interval '39 days');
    -- Legacy closure lacks a dated decision; retain it as one imported observation.
    update "CRM_Opportunities" set "CRMOppty_StatusCode"='lost',"CRMOppty_StageCode"='lost',"CRMOppty_PipelineStageID"=fid(213) where "CRMOppty_ID"=fid(3);
    delete from "CRM_DealEvents" where deal_id=fid(3);
    insert into "CRM_DealEvents"(company_id,deal_id,kind,occurred_at,after_data)
      select '20000000-0000-0000-0000-000000000001',"CRMOppty_ID",'observed',now()-interval '10 days',_multideck_crm_deal_sales_snapshot(d) from "CRM_Opportunities" d where "CRMOppty_ID"=fid(3);
    set role authenticated;
    do $$declare s jsonb:=multideck_crm_get_sales_insights(30);begin
      perform test_assert((s->'trend'->>'from')::timestamptz=now()-interval '30 days','known coverage before period is clipped to period');
      perform test_assert((select sum((b->>'won')::int+(b->>'lost')::int+(b->>'created')::int+(b->>'entered')::int) from jsonb_array_elements(s->'trend'->'buckets') b)=0,'pre-period decisions and undated initial loss do not appear in recent trend');
      perform test_assert((s->'coverage'->>'undatedClosedDeals')::int=1,'undated closure remains disclosed separately');
    end $$;
    reset role;
    delete from "CRM_DealEvents" where company_id='20000000-0000-0000-0000-000000000001';
    set role authenticated;
    do $$declare t jsonb:=multideck_crm_get_sales_insights(365)->'trend';begin
      perform test_assert(t->'coverageStartsAt'='null'::jsonb and t->'from'='null'::jsonb and t->'buckets'='[]'::jsonb,'no measured history has no fabricated zero weeks');
    end $$;
    reset role;
    insert into "CRM_DealEvents"(company_id,deal_id,kind,occurred_at,after_data)
      select '20000000-0000-0000-0000-000000000001',"CRMOppty_ID",'created',now(),_multideck_crm_deal_sales_snapshot(d) from "CRM_Opportunities" d where "CRMOppty_ID"=fid(4);
    set role authenticated;
    do $$declare t jsonb:=multideck_crm_get_sales_insights(365)->'trend';begin
      perform test_assert(jsonb_array_length(t->'buckets')=1,'one observation does not imply a year of zero history');
      perform test_assert((t->'buckets'->0->>'created')::int=1,'event at exact snapshot instant is included');
    end $$;
    rollback;`))
}))

test('CRM stage age distributions use the complete measured cohort and exclude unknown entry times',()=>withProductPostgres((sql,ok)=>{
  fixture(sql,ok)
  ok(sql(`begin;
    update "CRM_DealEvents" set kind='observed',occurred_at=now()-case deal_id when fid(1) then interval '1 day' when fid(2) then interval '3 days' when fid(3) then interval '7 days' else interval '9 days' end;
    set role authenticated;select login(3);
    do $$declare s jsonb:=multideck_crm_get_sales_insights(30)->'stages'->0;begin
      perform test_assert((s->>'minimumDays')::numeric=1 and (s->>'lowerQuartileDays')::numeric=2.5 and (s->>'medianDays')::numeric=5 and (s->>'upperQuartileDays')::numeric=7.5 and (s->>'maximumDays')::numeric=9,'interpolated quartiles have correct values');
      perform test_assert((s->>'sampleSize')::int=4,'same measured cohort as existing median');
    end $$;
    reset role;delete from "CRM_DealEvents" where deal_id=fid(4);
    set role authenticated;
    do $$declare s jsonb:=multideck_crm_get_sales_insights(30)->'stages'->0;begin
      perform test_assert((s->>'sampleSize')::int=3 and (s->>'openDeals')::int=4,'unknown entry remains open but not measured');
      perform test_assert((s->>'lowerQuartileDays')::numeric=2 and (s->>'upperQuartileDays')::numeric=5 and (s->>'maximumDays')::numeric=7,'unknown time is not treated as zero');
      perform test_assert(multideck_crm_get_sales_insights(30)->'stages'->1->'minimumDays'='null'::jsonb,'empty stage distribution has no invented zero');
    end $$;
    reset role;
    -- A large real SQL cohort proves that quartiles are not computed from the 100 evidence rows.
    insert into "CRM_Opportunities"("CRMOppty_ID","CRMOppty_OrgID","CRMOppty_OwnerUserID","CRMOppty_Name","CRMOppty_PipelineID","CRMOppty_PipelineStageID","CRMOppty_CreatedBy","CRMOppty_UpdatedBy")
      select fid(1000+n),fid(100),'00000000-0000-0000-0000-000000000001','Measured deal '||n,fid(200),fid(210),'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001' from generate_series(1,104) n;
    update "CRM_DealEvents" set kind='observed',occurred_at=now()-interval '20 days' where deal_id>=fid(1001) and deal_id<=fid(1104);
    set role authenticated;
    do $$declare s jsonb:=multideck_crm_get_sales_insights(30)->'stages'->0;begin
      perform test_assert((s->>'sampleSize')::int=107 and jsonb_array_length(s->'deals')=100,'complete sample exceeds evidence preview');
      perform test_assert((s->>'minimumDays')::numeric=1 and (s->>'maximumDays')::numeric=20,'range includes youngest entries omitted by descending evidence limit');
    end $$;
    rollback;`))
}))

test('CRM series preserves shared read access, current-owner filtering and foreign/revoked denial',()=>withProductPostgres((sql,ok)=>{
  fixture(sql,ok)
  ok(sql(`begin;
    insert into "CRM_Pipelines"("CRMPipeline_ID","Company_ID","CRMPipeline_Name") values(fid(220),'20000000-0000-0000-0000-000000000001','Renewals');
    insert into "CRM_PipelineStages"("CRMPipelineStage_ID","CRMPipeline_ID","Company_ID","CRMPipelineStage_Name","CRMPipelineStage_SortOrder","CRMPipelineStage_ProbabilityPct","CRMPipelineStage_IsConversion") values(fid(221),fid(220),'20000000-0000-0000-0000-000000000001','Review',1,20,false);
    set role authenticated;select login(2);
    select multideck_crm_lose_deal(fid(1),deal_version(1),'{"reasonCode":"price"}');
    select multideck_crm_reopen_deal(fid(1),deal_version(1),fid(210),'Customer returned');
    select multideck_crm_update_deal(fid(1),deal_version(1),'{"ownerId":"00000000-0000-0000-0000-000000000002"}');
    select login(3);
    do $$declare s jsonb:=multideck_crm_get_sales_insights(90,null,'00000000-0000-0000-0000-000000000002');begin
      perform test_assert((select sum((b->>'lost')::int) from jsonb_array_elements(s->'trend'->'buckets') b)=1,'read-only colleague sees newly assigned shared history');
      perform test_assert(s->'trend'->>'filterBasis'='current_owner_and_pipeline','filter basis is explicit');
      perform test_assert((select sum((b->>'lost')::int) from jsonb_array_elements(multideck_crm_get_sales_insights(90,null,'00000000-0000-0000-0000-000000000001')->'trend'->'buckets') b)=0,'historic owner does not retain attribution in current-owner filter');
    end $$;
    select login(2);select multideck_crm_move_deal_stage(fid(1),fid(220),fid(221));
    select login(3);
    select test_assert((select sum((b->>'lost')::int) from jsonb_array_elements(multideck_crm_get_sales_insights(90,fid(220),null)->'trend'->'buckets') b)=1,'current pipeline owns the visible deal history');
    select test_assert((select sum((b->>'lost')::int) from jsonb_array_elements(multideck_crm_get_sales_insights(90,fid(200),null)->'trend'->'buckets') b)=0,'prior pipeline does not double-attribute historic events');
    select expect_denied($q$select multideck_crm_get_sales_insights(90,fid(201),null)$q$,'22023');
    select expect_denied($q$select multideck_crm_get_sales_insights(90,null,'00000000-0000-0000-0000-000000000005')$q$,'22023');
    select expect_denied($q$select multideck_crm_get_sales_insights(7)$q$,'22023');
    select expect_denied($q$select _multideck_crm_get_sales_insights_before_series_20260922(90,null,null)$q$,'42501');
    select expect_denied($q$select * from "CRM_DealEvents"$q$,'42501');
    select login(5);
    do $$declare s jsonb:=multideck_crm_get_sales_insights();begin
      perform test_assert(s::text like '%'||fid(5)::text||'%' and not(s::text like '%'||fid(1)::text||'%'),'foreign operator sees own company only');
    end $$;
    reset role;update "cmp_Users" set "User_AccessStatus"='inactive' where "User_ID"='00000000-0000-0000-0000-000000000001';
    set role authenticated;select login(2);
    select test_assert((multideck_crm_get_sales_insights()->'summary'->>'openDeals')::int=4,'creator deactivation preserves shared records and series');
    select login(1);select expect_denied($q$select multideck_crm_get_sales_insights()$q$,'42501');
    reset role;delete from "cmp_Users_Roles" where "User_ID"='00000000-0000-0000-0000-000000000002';
    set role authenticated;select login(2);select expect_denied($q$select multideck_crm_get_sales_insights()$q$,'42501');
    select expect_denied($q$select query_insights()$q$,'42501');
    reset role;update "cmp_Users" set "Auth_User_ID"=null where "User_ID"='00000000-0000-0000-0000-000000000003';
    set role authenticated;select login(3);select expect_denied($q$select multideck_crm_get_sales_insights()$q$,'42501');
    reset role;set role anon;select expect_denied($q$select multideck_crm_get_sales_insights()$q$,'42501');
    rollback;`))
  }))

test('CRM trend bounds evidence without truncating counts and counts the exact Monday as-of once',()=>withProductPostgres((sql,ok)=>{
  fixture(sql,ok)
  ok(sql(`begin;
    -- Freeze the existing snapshot clock to a calendar boundary in this disposable fixture.
    -- The series implementation is unchanged and takes its as-of from that real snapshot.
    do $$declare definition text;begin
      select pg_get_functiondef('public._multideck_crm_get_sales_insights_before_series_20260922(integer,uuid,uuid)'::regprocedure) into definition;
      execute replace(definition,'now()','public.test_monday()');
    end $$;
    update "CRM_DealEvents" set occurred_at=test_monday()-interval '1 day';
    insert into "CRM_Opportunities"("CRMOppty_ID","CRMOppty_OrgID","CRMOppty_OwnerUserID","CRMOppty_Name","CRMOppty_PipelineID","CRMOppty_PipelineStageID","CRMOppty_CreatedBy","CRMOppty_UpdatedBy")
      select fid(2000+n),fid(100),'00000000-0000-0000-0000-000000000001','New deal '||n,fid(200),fid(210),'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001' from generate_series(1,501) n;
    update "CRM_DealEvents" set occurred_at=test_monday() where deal_id>=fid(2001) and deal_id<=fid(2501);
    set role authenticated;select login(2);
    do $$declare t jsonb:=multideck_crm_get_sales_insights(30)->'trend';b jsonb;begin
      b:=t->'buckets'->-1;
      perform test_assert((select sum((x->>'created')::int) from jsonb_array_elements(t->'buckets') x)=505,'Monday boundary event is never counted in both adjacent weeks');
      perform test_assert((b->>'created')::int=501 and jsonb_array_length(b->'createdDealIds')=500,'complete event count with bounded distinct evidence');
      perform test_assert((b->>'evidenceTruncated')::boolean and (t->>'evidenceLimit')::int=500,'bounded evidence is disclosed');
      perform test_assert((b->>'start')::timestamptz=test_monday() and (b->>'end')::timestamptz=test_monday() and (b->>'isPartial')::boolean,'just-started current week is explicitly partial');
    end $$;
    rollback;`))
}))
