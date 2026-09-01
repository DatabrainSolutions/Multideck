begin;

alter table public."FIN_PostingLines"
  add column if not exists "FINPostLine_JobID" uuid references public."Job_Header"("Job_ID") on delete set null;

create index if not exists "IX_FIN_PostingLines_job" on public."FIN_PostingLines"("FINPostLine_JobID","FINPostLine_BatchID");

-- Earlier management-journal functions supplied their job reference through
-- Dimension1. Preserve a real finance dimension when one exists; otherwise
-- move an exact Job_Header identifier into the dedicated job field before FK
-- checks run. This keeps old function versions safe during rolling upgrades.
create or replace function public._multideck_finance_posting_line_job_dimension_guard()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
  if new."FINPostLine_Dimension1ID" is not null
     and exists(select 1 from public."Job_Header" job where job."Job_ID"=new."FINPostLine_Dimension1ID")
     and not exists(select 1 from public."FIN_DimensionValues" dimension where dimension."FINDimValue_ID"=new."FINPostLine_Dimension1ID") then
    new."FINPostLine_JobID":=coalesce(new."FINPostLine_JobID",new."FINPostLine_Dimension1ID");
    new."FINPostLine_Dimension1ID":=null;
  end if;
  return new;
end; $$;
revoke all on function public._multideck_finance_posting_line_job_dimension_guard() from public,anon,authenticated;
drop trigger if exists "TR_FIN_PostingLines_job_dimension_guard" on public."FIN_PostingLines";
create trigger "TR_FIN_PostingLines_job_dimension_guard"
before insert or update of "FINPostLine_Dimension1ID","FINPostLine_JobID" on public."FIN_PostingLines"
for each row execute function public._multideck_finance_posting_line_job_dimension_guard();

commit;
