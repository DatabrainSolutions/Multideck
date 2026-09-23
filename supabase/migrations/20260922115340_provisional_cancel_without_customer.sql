-- Cancelling an incomplete Provisional is not activation. Preserve the customer
-- requirement for every live/completed Booking, including ordinary cancellations.
begin;
set local lock_timeout='5s';
do $$
declare current_definition text;
begin
 select pg_get_constraintdef(oid) into current_definition from pg_constraint
 where conrelid='public."Job_Header"'::regclass and conname='CK_Job_Header_customer_after_draft';
 if current_definition is distinct from 'CHECK (((("Job_Status")::text = ''draft''::text) OR ("Job_Customer" IS NOT NULL)))' then
  raise exception 'Unexpected Booking customer constraint; review before replacing.';
 end if;
end $$;
alter table public."Job_Header" drop constraint "CK_Job_Header_customer_after_draft";
alter table public."Job_Header" add constraint "CK_Job_Header_customer_after_draft"
 check ("Job_Status"='draft' or "Job_Customer" is not null
   or ("Job_Status"='cancelled' and "Job_ProvisionalCancelled" is true)) not valid;
alter table public."Job_Header" validate constraint "CK_Job_Header_customer_after_draft";
commit;
