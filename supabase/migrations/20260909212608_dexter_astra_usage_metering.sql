begin;
-- OpenAI GPT-6 Astra standard token rates, verified 9 September 2026:
-- USD per million: input 10, cache read 1, cache write 12.50, output 50.
-- Retain the ledger's existing fixed 0.8 GBP/USD estimate policy. Historical
-- rows are not repriced. Reserve at the cache-write rate until usage is known.
create or replace function public._multideck_dexter_astra_usage_gbp(
  input_tokens integer, output_tokens integer, cached_tokens integer default 0, cache_write_tokens integer default 0
) returns numeric language plpgsql immutable set search_path=pg_catalog as $$
declare i integer:=greatest(coalesce(input_tokens,0),0);o integer:=greatest(coalesce(output_tokens,0),0);
  cached integer:=greatest(coalesce(cached_tokens,0),0);written integer:=greatest(coalesce(cache_write_tokens,0),0);
begin
  if cached+written>i then raise exception 'Invalid provider cache usage.' using errcode='22023';end if;
  return round(((i-cached-written)*8::numeric+cached*0.8::numeric+written*10::numeric)
    *case when i>272000 then 2 else 1 end/1000000
    +o*40::numeric*case when i>272000 then 1.5 else 1 end/1000000,6);
end $$;

-- Extend rather than reinterpret the existing lane rates.
create or replace function public._multideck_dexter_estimated_usage_gbp(p_model text,p_input_tokens integer,p_output_tokens integer)
returns numeric language sql immutable security invoker set search_path=pg_catalog as $$
  select case when lower(p_model)='gpt-6-astra' then public._multideck_dexter_astra_usage_gbp(
    p_input_tokens,p_output_tokens,0,greatest(coalesce(p_input_tokens,0),0))
  else round((greatest(coalesce(p_input_tokens,0),0)::numeric*case when lower(coalesce(p_model,'fast'))='worker' then 2.00 else 0.80 end
    +greatest(coalesce(p_output_tokens,0),0)::numeric*case when lower(coalesce(p_model,'fast'))='worker' then 12.00 else 4.80 end)/1000000,6) end;
$$;

do $patch$
declare definition text; marker text; signature regprocedure;
begin
  signature:='public.multideck_dexter_reserve_model_egress(uuid,uuid,uuid,text,text,text,jsonb,integer,bigint,integer,integer)'::regprocedure;
  definition:=pg_get_functiondef(signature);
  marker:='case when lower(p_model) like ''%terra%'' then ''worker'' else ''fast'' end';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review current model reservation pricing';end if;
  execute replace(definition,marker,'case when lower(p_model)=''gpt-6-astra'' then ''gpt-6-astra'' when lower(p_model) like ''%terra%'' then ''worker'' else ''fast'' end');
  signature:='public.multideck_dexter_settle_model_egress(uuid,uuid,uuid,text,text,integer,integer,text)'::regprocedure;
  definition:=pg_get_functiondef(signature);
  marker:='case when lower(v_row."AIDexterEgress_Model") like ''%terra%'' then ''worker'' else ''fast'' end';
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review current model settlement pricing';end if;
  execute replace(definition,marker,'case when lower(v_row."AIDexterEgress_Model")=''gpt-6-astra'' then ''gpt-6-astra'' when lower(v_row."AIDexterEgress_Model") like ''%terra%'' then ''worker'' else ''fast'' end');
end $patch$;

alter table public."AI_DexterModelEgressAudit"
  add column if not exists "AIDexterEgress_CachedInputUnits" integer not null default 0,
  add column if not exists "AIDexterEgress_CacheWriteInputUnits" integer not null default 0;

create or replace function public.multideck_dexter_settle_responses_egress(
  p_reservation_id uuid,p_company_id uuid,p_user_id uuid,p_outcome text,p_response_id text,p_usage jsonb,p_error_code text
) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare entry public."AI_DexterModelEgressAudit";i integer;o integer;cached integer;written integer;cost numeric;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'server_only' using errcode='42501';end if;
  select * into entry from public."AI_DexterModelEgressAudit" where "AIDexterEgress_ID"=p_reservation_id
    and "AIDexterEgress_CompanyID"=p_company_id and "AIDexterEgress_UserID"=p_user_id for update;
  if not found or entry."AIDexterEgress_Outcome"<>'attempted' then return;end if;
  if entry."AIDexterEgress_Provider"<>'openai' then raise exception 'Wrong provider reservation.' using errcode='22023';end if;
  i:=greatest(coalesce((p_usage->>'input_tokens')::integer,0),0);
  o:=greatest(coalesce((p_usage->>'output_tokens')::integer,0),0);
  cached:=greatest(coalesce((p_usage#>>'{input_tokens_details,cached_tokens}')::integer,0),0);
  written:=greatest(coalesce((p_usage#>>'{input_tokens_details,cache_write_tokens}')::integer,0),0);
  if lower(entry."AIDexterEgress_Model")='gpt-6-astra' then cost:=public._multideck_dexter_astra_usage_gbp(i,o,cached,written);end if;
  perform public.multideck_dexter_settle_model_egress(p_reservation_id,p_company_id,p_user_id,p_outcome,p_response_id,i,o,p_error_code);
  update public."AI_DexterModelEgressAudit" set "AIDexterEgress_CachedInputUnits"=cached,"AIDexterEgress_CacheWriteInputUnits"=written,
    "AIDexterEgress_ActualCostGBP"=coalesce(cost,"AIDexterEgress_ActualCostGBP") where "AIDexterEgress_ID"=p_reservation_id;
end $$;
revoke all on function public.multideck_dexter_settle_responses_egress(uuid,uuid,uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.multideck_dexter_settle_responses_egress(uuid,uuid,uuid,text,text,jsonb,text) to service_role;
revoke all on function public._multideck_dexter_astra_usage_gbp(integer,integer,integer,integer) from public,anon,authenticated;
grant execute on function public._multideck_dexter_astra_usage_gbp(integer,integer,integer,integer) to service_role;
commit;
