-- Schedule the authenticated prepared-PDF cleanup when tenant provisioning has
-- supplied the function URL and service-role JWT in Vault.

begin;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'customs-invoice-preview-cleanup-hourly';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;

  if exists (select 1 from vault.decrypted_secrets where name = 'customs_invoice_cleanup_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'customs_invoice_cleanup_service_role') then
    perform cron.schedule(
      'customs-invoice-preview-cleanup-hourly',
      '7 * * * *',
      $schedule$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'customs_invoice_cleanup_url'),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'customs_invoice_cleanup_service_role')
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 120000
        );
      $schedule$
    );
  end if;
end $$;

commit;
