begin;

create or replace function public._multideck_finance_posting_line_job_dimension_guard()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if new."FINPostLine_Dimension1ID" is not null
     and exists(select 1 from public."Job_Header" job where job."Job_ID"=new."FINPostLine_Dimension1ID")
     and not exists(select 1 from public."FIN_DimensionValues" dimension where dimension."FINDim_ID"=new."FINPostLine_Dimension1ID") then
    new."FINPostLine_JobID":=coalesce(new."FINPostLine_JobID",new."FINPostLine_Dimension1ID");
    new."FINPostLine_Dimension1ID":=null;
  end if;
  return new;
end; $$;
revoke all on function public._multideck_finance_posting_line_job_dimension_guard() from public,anon,authenticated;

commit;
