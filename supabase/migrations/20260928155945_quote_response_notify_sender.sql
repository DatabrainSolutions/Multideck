-- The person who issued a customer quote also needs its response, even when
-- someone else created the quote. Preserve the existing owner notification.
create or replace function quote_api.notify_quote_response_sender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender_id uuid;
  owner_id uuid;
  quote_ref text;
begin
  select link.created_by into sender_id
  from quote_api.customer_response_links link
  join public."cmp_Users" sender
    on sender."User_ID" = link.created_by
   and sender."Company_ID" = new.company_id
   and sender."User_AccessStatus" = 'active'
  where link.response_link_id = new.response_link_id
    and link.company_id = new.company_id
    and link.quote_id = new.quote_id
    and link.delivery_status_code = 'sent';

  if sender_id is null then return new; end if;

  select coalesce(quote."CusQuoteHeader_SalesOwnerID", quote."CusQuoteHeader_CreatedBy"),
         coalesce(quote."CusQuoteHeader_CustomerReference", 'Q-' || quote."CusQuoteHeader_Number")
    into owner_id, quote_ref
  from public."CusQuote_Header" quote
  where quote."CusQuoteHeader_ID" = new.quote_id
    and not quote."CusQuoteHeader_IsDeleted";

  if not found or sender_id = owner_id then return new; end if;

  insert into public."Comm_Notifications" (
    "CommNotif_UserID", "CommNotif_Title", "CommNotif_Body", "CommNotif_TargetTable",
    "CommNotif_TargetID", "CommNotif_LinkTypeCode", "CommNotif_MetadataJSON", "CommNotif_CreatedBy"
  ) values (
    sender_id, quote_ref || ' customer response',
    case new.decision_code
      when 'accepted' then 'The customer accepted this quote. Its booking is ready.'
      when 'declined' then 'The customer declined this quote and supplied a reason.'
      else 'The customer asked for changes to this quote.'
    end,
    'CusQuote_Header', new.quote_id, 'quote_response',
    jsonb_strip_nulls(jsonb_build_object(
      'event_type', 'quote_response',
      'action_url', '/quotes/' || quote_ref,
      'action_label', 'Open quote',
      'eyebrow', 'Customer quote response',
      'decision', new.decision_code,
      'decline_reason_code', new.decline_reason_code,
      'response_id', new.response_id
    )), null
  );
  return new;
end;
$$;

revoke all on function quote_api.notify_quote_response_sender() from public, anon, authenticated;

create trigger quote_response_notify_sender
after insert on quote_api.customer_responses
for each row execute function quote_api.notify_quote_response_sender();
