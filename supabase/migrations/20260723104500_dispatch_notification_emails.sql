begin;

do $$
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'multideck_notification_webhook_secret'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'base64'),
      'multideck_notification_webhook_secret',
      'Authenticates database-created notification emails with the tenant Edge Function.'
    );
  end if;
end;
$$;

create or replace function public."Comm_GetNotificationWebhookSecret"()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'multideck_notification_webhook_secret'
  limit 1;
$$;

revoke all on function public."Comm_GetNotificationWebhookSecret"() from public, anon, authenticated;
grant execute on function public."Comm_GetNotificationWebhookSecret"() to service_role;

create or replace function public."Comm_DispatchNotificationEmail"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  edge_function_url text;
  webhook_secret text;
begin
  select decrypted_secret
  into edge_function_url
  from vault.decrypted_secrets
  where name = 'multideck_notification_email_endpoint'
  limit 1;

  select decrypted_secret
  into webhook_secret
  from vault.decrypted_secrets
  where name = 'multideck_notification_webhook_secret'
  limit 1;

  if edge_function_url is null or webhook_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := edge_function_url,
    body := jsonb_build_object(
      'action', 'dispatch',
      'notificationId', new."CommNotif_ID"
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-multideck-notification-secret', webhook_secret
    ),
    timeout_milliseconds := 10000
  );

  return new;
end;
$$;

revoke all on function public."Comm_DispatchNotificationEmail"() from public, anon, authenticated;

drop trigger if exists "Comm_Notifications_DispatchEmail" on public."Comm_Notifications";
create trigger "Comm_Notifications_DispatchEmail"
after insert on public."Comm_Notifications"
for each row
execute function public."Comm_DispatchNotificationEmail"();

commit;
