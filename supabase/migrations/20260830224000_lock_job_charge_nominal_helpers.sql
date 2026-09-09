begin;

revoke all on function public._multideck_finance_default_job_charge_nominals() from public,anon,authenticated;
revoke all on function public._multideck_finance_remap_job_charge_nominals() from public,anon,authenticated;

commit;
