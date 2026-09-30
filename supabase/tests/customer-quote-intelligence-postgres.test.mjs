import assert from 'node:assert/strict'
import test from 'node:test'
import { withProductPostgres } from './local-product-postgres.mjs'
import { currentFunction } from './operational-access-source.mjs'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('customer quote evidence excludes unrelated, deleted, future and old records before its limit; publication finishes unchanged refreshes', () => {
  withProductPostgres((sql, ok) => {
    const run = statement => { const result = sql(statement); ok(result); return result.stdout }
    run(`
      create table public."cmp_Offices"("Office_ID" uuid,"Company_ID" uuid);
      create table public."CusQuote_Header"(
        "CusQuoteHeader_ID" uuid primary key,"CusQuoteHeader_Number" integer,
        "CusQuoteHeader_CustomerID" uuid,"CusQuoteHeader_LifecycleCode" text default 'draft',
        "CusQuoteHeader_JobID" uuid,"CusQuoteHeader_CurrencyCode" text default 'GBP',
        "CusQuoteHeader_LoadingPoint" text,"CusQuoteHeader_OriginExtra" text,
        "CusQuoteHeader_DischargePoint" text,"CusQuoteHeader_DestinationExtra" text,
        "CusQuoteHeader_ModeCode" text,"CusQuoteHeader_ShipmentTypeCode" text,
        "CusQuoteHeader_Incoterm" text,"CusQuoteHeader_ShipmentFactsJSON" jsonb,
        "CusQuoteHeader_CreatedDate" timestamptz default now(),"CusQuoteHeader_LastEditedDate" timestamptz,
        "CusQuoteHeader_ValidTo" date,"CusQuoteHeader_Deadline" date,
        "CusQuoteHeader_OrgOfficeID" uuid,"OrgOffice_ID" uuid,"CusQuoteHeader_IsDeleted" boolean default false
      );
      create table public."FIN_Settings"("FINSET_BaseCurrencyCode" text,"FINSET_OrgOfficeID" uuid,"FINSET_UpdatedAt" timestamptz,"FINSET_ID" uuid);
      create table public."FIN_ExchangeRates"("FINRate_MidRate" numeric,"FINRate_IsApproved" boolean,
        "FINRate_FromCurrencyCode" text,"FINRate_ToCurrencyCode" text,"FINRate_RateDate" date,
        "FINRate_IsOfficial" boolean,"FINRate_ImportedAt" timestamptz,"FINRate_ID" uuid);
      create table public."CusQuote_Lines"("CusQuoteHeader_ID" uuid,"CusQuoteLine_CostAmountLocal" numeric,
        "CusQuoteLine_RevenueAmountLocal" numeric,"CusQuoteLine_CostROE" numeric,"CusQuoteLine_RevenueROE" numeric);
      create table public."CusQuote_Events"("CusQuoteHeader_ID" uuid,"CusQuoteEvent_TypeCode" text,"CusQuoteEvent_OccurredAt" timestamptz);
      create table public."CusQuote_Intelligence"("CusQuoteIntelligence_QuoteID" uuid primary key,"Company_ID" uuid,
        "CusQuoteIntelligence_StateCode" text,"CusQuoteIntelligence_DeterministicJSON" jsonb,
        "CusQuoteIntelligence_InputFingerprint" text,"CusQuoteIntelligence_EvidenceFingerprint" text,
        "CusQuoteIntelligence_AlgorithmVersion" text,"CusQuoteIntelligence_CalculatedAt" timestamptz,"CusQuoteIntelligence_UpdatedAt" timestamptz);
      ${currentFunction('public','quote_intelligence_evidence').sql}
      ${currentFunction('public','quote_intelligence_publish_snapshot').sql}
      revoke all on function public.quote_intelligence_evidence(uuid,uuid) from public,anon,authenticated;
      grant execute on function public.quote_intelligence_evidence(uuid,uuid) to service_role;
      revoke all on function public.quote_intelligence_publish_snapshot(uuid,uuid,timestamptz,jsonb,timestamptz) from public,anon,authenticated;
      grant execute on function public.quote_intelligence_publish_snapshot(uuid,uuid,timestamptz,jsonb,timestamptz) to service_role;
      insert into public."cmp_Offices" values('${id(1)}','${id(11)}'),('${id(2)}','${id(12)}');
      insert into public."CusQuote_Header"("CusQuoteHeader_ID","CusQuoteHeader_Number","CusQuoteHeader_CustomerID","CusQuoteHeader_OrgOfficeID")
        values('${id(20)}',20,'${id(30)}','${id(1)}'),('${id(21)}',21,'${id(30)}','${id(1)}'),
        ('${id(22)}',22,'${id(30)}','${id(2)}'),('${id(23)}',23,null,'${id(1)}');
      -- More unrelated recent quotes than the cap must not crowd out the customer's older quote.
      insert into public."CusQuote_Header"("CusQuoteHeader_ID","CusQuoteHeader_Number","CusQuoteHeader_CustomerID","CusQuoteHeader_OrgOfficeID")
        select gen_random_uuid(),n,'${id(31)}','${id(1)}' from generate_series(100,400) n;
      update public."CusQuote_Header" set "CusQuoteHeader_CreatedDate"=now()-interval '1 month' where "CusQuoteHeader_ID"='${id(21)}';
      insert into public."CusQuote_Lines" values('${id(21)}',100,125,1,1);
      do $$ declare bundle jsonb; snapshot jsonb; published jsonb; revision timestamptz; calculated timestamptz;
      begin
        bundle:=public.quote_intelligence_evidence('${id(11)}','${id(20)}');
        assert jsonb_array_length(bundle->'quotes')=1;
        assert bundle->'quotes'->0->>'id'='${id(21)}';
        assert (bundle->'quotes'->0->>'cost')::numeric=100;
        assert (bundle->'quotes'->0->>'fxComplete')::boolean;
        assert bundle->'jobs'='[]'::jsonb and bundle->'rates'='[]'::jsonb;
        assert public.quote_intelligence_evidence('${id(12)}','${id(20)}')->'target'='null'::jsonb;
        assert public.quote_intelligence_evidence('${id(11)}','${id(23)}')->'quotes'='[]'::jsonb;
        update public."CusQuote_Lines" set "CusQuoteLine_CostROE"=0;
        assert not (public.quote_intelligence_evidence('${id(11)}','${id(20)}')->'quotes'->0->>'fxComplete')::boolean;
        update public."CusQuote_Header" set "CusQuoteHeader_CurrencyCode"='USD' where "CusQuoteHeader_ID"='${id(20)}';
        assert not (public.quote_intelligence_evidence('${id(11)}','${id(20)}')->'target'->>'fxComplete')::boolean;
        update public."CusQuote_Header" set "CusQuoteHeader_IsDeleted"=true where "CusQuoteHeader_ID"='${id(21)}';
        assert public.quote_intelligence_evidence('${id(11)}','${id(20)}')->'quotes'='[]'::jsonb;
        update public."CusQuote_Header" set "CusQuoteHeader_IsDeleted"=false,"CusQuoteHeader_CreatedDate"=now()+interval '1 day' where "CusQuoteHeader_ID"='${id(21)}';
        assert public.quote_intelligence_evidence('${id(11)}','${id(20)}')->'quotes'='[]'::jsonb;
        update public."CusQuote_Header" set "CusQuoteHeader_CreatedDate"=now()-interval '25 months' where "CusQuoteHeader_ID"='${id(21)}';
        assert public.quote_intelligence_evidence('${id(11)}','${id(20)}')->'quotes'='[]'::jsonb;
        assert not has_function_privilege('anon','public.quote_intelligence_evidence(uuid,uuid)','execute');
        assert not has_function_privilege('authenticated','public.quote_intelligence_publish_snapshot(uuid,uuid,timestamptz,jsonb,timestamptz)','execute');
        select "CusQuoteHeader_CreatedDate" into revision from public."CusQuote_Header" where "CusQuoteHeader_ID"='${id(20)}';
        snapshot:='{"state":"building_baseline","aiEligible":false,"algorithmVersion":"test","inputFingerprint":"same","evidenceFingerprint":"same"}';
        published:=public.quote_intelligence_publish_snapshot('${id(11)}','${id(20)}',revision,snapshot,clock_timestamp());
        calculated:=(published->>'CusQuoteIntelligence_CalculatedAt')::timestamptz;
        published:=public.quote_intelligence_publish_snapshot('${id(11)}','${id(20)}',revision,snapshot,clock_timestamp());
        assert (published->>'CusQuoteIntelligence_CalculatedAt')::timestamptz=calculated, 'Settled calculations must remain a no-op';
        update public."CusQuote_Intelligence" set "CusQuoteIntelligence_StateCode"='updating';
        published:=public.quote_intelligence_publish_snapshot('${id(11)}','${id(20)}',revision,snapshot,clock_timestamp());
        assert published->>'CusQuoteIntelligence_StateCode'='building_baseline', 'Unchanged refresh did not settle';
        published:=public.quote_intelligence_publish_snapshot('${id(11)}','${id(20)}',revision-interval '1 day','{"state":"ready"}',clock_timestamp());
        assert published->>'CusQuoteIntelligence_StateCode'='building_baseline', 'Stale revision overwrote the calculation';
        begin
          perform public.quote_intelligence_publish_snapshot('${id(12)}','${id(20)}',revision,snapshot,clock_timestamp());
          raise exception 'Foreign company published a snapshot';
        exception when insufficient_privilege then null; end;
      end $$;
    `)
  })
})
