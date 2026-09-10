-- Conservative estimate until the edge replaces it with settled response costs.
-- No historical re-pricing and no changes to legacy Luna/Terra records.
do $patch$
declare definition text;marker text:='new."AIMSG_ContentJSON" ->> ''model''';
begin
 definition:=pg_get_functiondef('public._multideck_dexter_record_message_cost()'::regprocedure);
 if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then raise exception 'Review message cost trigger';end if;
 execute replace(definition,marker,'case when new."AIMSG_ContentJSON" #>> ''{metadata,providerModel}'' = ''gpt-6-astra'' then ''gpt-6-astra'' else new."AIMSG_ContentJSON" ->> ''model'' end');
end $patch$;
