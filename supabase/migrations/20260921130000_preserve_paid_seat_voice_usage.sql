-- Preserve the voice category while using the new paid-seat category implementation.
begin;
do $patch$
begin
 execute replace(pg_get_functiondef('public._multideck_usage_categories(uuid)'::regprocedure),
   'FUNCTION public._multideck_usage_categories(', 'FUNCTION public._multideck_usage_categories_before_voice(');
end $patch$;
create or replace function public._multideck_usage_categories(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb; minutes numeric; included numeric;
begin
  result:=public._multideck_usage_categories_before_voice(p_company_id);
  select coalesce(sum(seconds),0)/60 into minutes from public."AI_DexterVoiceSessions"
    where company_id=p_company_id and ended_at is not null and created_at>=date_trunc('month',now())
      and created_at<date_trunc('month',now())+interval '1 month';
  included:=coalesce((result->>'seatCount')::integer,25)*5*extract(day from date_trunc('month',now())+interval '1 month - 1 day');
  return jsonb_set(result,'{categories}',(result->'categories')||jsonb_build_array(jsonb_build_object(
    'id','voice','label','Voice','description','Speak to Dexter. Five minutes per person each day; voice costs also count towards AI usage.',
    'unit','minutes','included',included,'used',round(minutes,1),'extra',greatest(minutes-included,0),
    'usedPercent',round(minutes/nullif(included,0)*100,2),'enabled',true,'dataState','live')));
end $$;
revoke all on function public._multideck_usage_categories(uuid),public._multideck_usage_categories_before_voice(uuid) from public,anon,authenticated;

commit;
