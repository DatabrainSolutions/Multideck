update public."CRM_ContactCardAutomations" automation
set "Automation_LastRunAt" = latest.last_run_at
from (
  select "ContactCard_ID", max("Exchange_At") as last_run_at
  from public."CRM_ContactCardExchanges"
  where "Exchange_AutomationOutcome" = 'ran'
  group by "ContactCard_ID"
) latest
where automation."ContactCard_ID" = latest."ContactCard_ID";
