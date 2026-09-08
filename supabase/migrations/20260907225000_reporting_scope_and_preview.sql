begin;
set local lock_timeout='5s';
-- Match the CRM register's real pipeline/fixture boundary.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('report_api.source_rows(uuid,text)'::regprocedure);
  definition:=replace(definition,'where own."Company_ID"=u."Company_ID" and not p."CRMOppty_IsDeleted";',
    'where own."Company_ID"=u."Company_ID" and public._multideck_crm_deal_is_operator_visible(p."CRMOppty_ID",u."Company_ID");');
  execute definition;
end $$;

-- Limit dense daily preview buckets without inventing zero values beyond the
-- loaded range. Whole-period metrics continue to aggregate every source row.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('report_api.query(uuid,jsonb,integer)'::regprocedure);
  definition:=replace(definition,'end) d) buckets','end) d limit maximum) buckets');
  definition:=replace(definition,'''total'',jsonb_array_length(result->''rows'')',
    '''total'',(select count(*) from generate_series(case when chosen=''month'' then date_trunc(''month'',lower(span)) else lower(span)::timestamp end,(upper(span)-1)::timestamp,case when chosen=''month'' then interval ''1 month'' else interval ''1 day'' end))');
  execute definition;
end $$;

create function report_api.can_read_run(actor uuid, target report_api.runs) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare u public."cmp_Users"; r report_api.reports;
begin
  u:=report_api.context(actor);
  if target.company_id is distinct from u."Company_ID" or target.owner_id is distinct from u."User_ID" then return false;end if;
  r.company_id:=target.company_id;r.owner_id:=target.owner_id;r.visibility:='private';r.archived_at:=null;r.definition:=target.definition;
  return report_api.can_read(actor,r);
end $$;
revoke all on function report_api.can_read_run(uuid,report_api.runs) from public,anon,authenticated;
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.reporting_workspace(text,jsonb)'::regprocedure);
  definition:=replace(definition,'h.owner_id=u."User_ID" and report_api.can_read(auth.uid(),r)','h.owner_id=u."User_ID" and report_api.can_read_run(auth.uid(),h)');
  execute definition;
end $$;
commit;
