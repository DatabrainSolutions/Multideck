-- GPT-6 Luna standard pricing: USD 0.10 input, 0.01 cache read,
-- 0.125 cache write and 0.50 output per million tokens (26 September 2026).
-- Keep the fixed 0.8 GBP/USD ledger policy and existing pooled budgets.
-- Only future calls change: historical provider labels and costs stay intact.
-- Chat and watch rule authoring share the upgraded agent; watch evaluation
-- remains deterministic, with no capability or permission changes.
begin;
create or replace function public._multideck_dexter_luna_usage_gbp(
  input_tokens integer, output_tokens integer, cached_tokens integer default 0, cache_write_tokens integer default 0
) returns numeric language plpgsql immutable set search_path=pg_catalog as $$
declare i integer:=greatest(coalesce(input_tokens,0),0);o integer:=greatest(coalesce(output_tokens,0),0);
  cached integer:=greatest(coalesce(cached_tokens,0),0);written integer:=greatest(coalesce(cache_write_tokens,0),0);
begin
  if cached+written>i then raise exception 'Invalid provider cache usage.' using errcode='22023';end if;
  return round(((i-cached-written)*0.08::numeric+cached*0.008::numeric+written*0.1::numeric)
    *case when i>272000 then 2 else 1 end/1000000
    +o*0.4::numeric*case when i>272000 then 1.5 else 1 end/1000000,6);
end $$;

create or replace function public._multideck_dexter_estimated_usage_gbp(p_model text,p_input_tokens integer,p_output_tokens integer)
returns numeric language sql immutable security invoker set search_path=pg_catalog as $$
  select case when lower(p_model)='gpt-6-luna' then public._multideck_dexter_luna_usage_gbp(
    p_input_tokens,p_output_tokens,0,greatest(coalesce(p_input_tokens,0),0))
  when lower(p_model)='gpt-6-astra' then public._multideck_dexter_astra_usage_gbp(
    p_input_tokens,p_output_tokens,0,greatest(coalesce(p_input_tokens,0),0))
  else round((greatest(coalesce(p_input_tokens,0),0)::numeric*case when lower(coalesce(p_model,'fast'))='worker' then 2.00 else 0.80 end
    +greatest(coalesce(p_output_tokens,0),0)::numeric*case when lower(coalesce(p_model,'fast'))='worker' then 12.00 else 4.80 end)/1000000,6) end;
$$;

do $patch$
declare definition text; marker text := $old$when lower(p_model)='gpt-6-astra' then 'gpt-6-astra'$old$;
begin
  definition := pg_get_functiondef('public.multideck_dexter_reserve_model_egress(uuid,uuid,uuid,text,text,text,jsonb,integer,bigint,integer,integer)'::regprocedure);
  if (length(definition)-length(replace(definition,marker,'')))/length(marker) <> 1 then
    raise exception 'Review Luna upgrade target: public.multideck_dexter_reserve_model_egress(uuid,uuid,uuid,text,text,text,jsonb,integer,bigint,integer,integer)';
  end if;
  execute replace(definition,marker,$new$when lower(p_model) in ('gpt-6-astra','gpt-6-luna') then lower(p_model)$new$);
end $patch$;

do $patch$
declare definition text; marker text := $old$when lower(v_row."AIDexterEgress_Model")='gpt-6-astra' then 'gpt-6-astra'$old$;
begin
  definition := pg_get_functiondef('public.multideck_dexter_settle_model_egress(uuid,uuid,uuid,text,text,integer,integer,text)'::regprocedure);
  if (length(definition)-length(replace(definition,marker,'')))/length(marker) <> 1 then
    raise exception 'Review Luna upgrade target: public.multideck_dexter_settle_model_egress(uuid,uuid,uuid,text,text,integer,integer,text)';
  end if;
  execute replace(definition,marker,$new$when lower(v_row."AIDexterEgress_Model") in ('gpt-6-astra','gpt-6-luna') then lower(v_row."AIDexterEgress_Model")$new$);
end $patch$;

do $patch$
declare definition text; marker text := $old$if lower(entry."AIDexterEgress_Model")='gpt-6-astra' then cost:=public._multideck_dexter_astra_usage_gbp(i,o,cached,written);end if;$old$;
begin
  definition := pg_get_functiondef('public.multideck_dexter_settle_responses_egress(uuid,uuid,uuid,text,text,jsonb,text)'::regprocedure);
  if (length(definition)-length(replace(definition,marker,'')))/length(marker) <> 1 then
    raise exception 'Review Luna upgrade target: public.multideck_dexter_settle_responses_egress(uuid,uuid,uuid,text,text,jsonb,text)';
  end if;
  execute replace(definition,marker,$new$if lower(entry."AIDexterEgress_Model")='gpt-6-astra' then cost:=public._multideck_dexter_astra_usage_gbp(i,o,cached,written);
  elsif lower(entry."AIDexterEgress_Model")='gpt-6-luna' then cost:=public._multideck_dexter_luna_usage_gbp(i,o,cached,written);end if;$new$);
end $patch$;

do $patch$
declare definition text; marker text := $old$new."AIMSG_ContentJSON" #>> '{metadata,providerModel}' = 'gpt-6-astra' then 'gpt-6-astra'$old$;
begin
  definition := pg_get_functiondef('public._multideck_dexter_record_message_cost()'::regprocedure);
  if (length(definition)-length(replace(definition,marker,'')))/length(marker) <> 1 then
    raise exception 'Review Luna upgrade target: public._multideck_dexter_record_message_cost()';
  end if;
  execute replace(definition,marker,$new$new."AIMSG_ContentJSON" #>> '{metadata,providerModel}' in ('gpt-6-astra','gpt-6-luna') then new."AIMSG_ContentJSON" #>> '{metadata,providerModel}'$new$);
end $patch$;

do $patch$
declare definition text; marker text := $old$('fast'::text, 1, 'gpt-5.6-luna'::text, 'medium'::text)$old$;
begin
  definition := pg_get_functiondef('public.multideck_dexter_get_usage()'::regprocedure);
  if (length(definition)-length(replace(definition,marker,'')))/length(marker) <> 1 then
    raise exception 'Review Luna upgrade target: public.multideck_dexter_get_usage()';
  end if;
  execute replace(definition,marker,$new$('fast'::text, 1, 'gpt-6-luna'::text, 'medium'::text)$new$);
end $patch$;

do $patch$
declare definition text; marker text := $old$('smart', 2, 'gpt-5.6-luna', 'high')$old$;
begin
  definition := pg_get_functiondef('public.multideck_dexter_get_usage()'::regprocedure);
  if (length(definition)-length(replace(definition,marker,'')))/length(marker) <> 1 then
    raise exception 'Review Luna upgrade target: public.multideck_dexter_get_usage()';
  end if;
  execute replace(definition,marker,$new$('smart', 2, 'gpt-6-luna', 'high')$new$);
end $patch$;

alter table public."Comm_ThreadSummaries"
  alter column "CommThreadSummary_ModelCode" set default 'gpt-6-luna';
revoke all on function public._multideck_dexter_luna_usage_gbp(integer,integer,integer,integer) from public,anon,authenticated;
grant execute on function public._multideck_dexter_luna_usage_gbp(integer,integer,integer,integer) to service_role;
commit;
