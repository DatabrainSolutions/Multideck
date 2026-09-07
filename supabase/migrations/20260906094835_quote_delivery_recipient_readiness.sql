-- Shipment/commercial readiness is independent of a one-send delivery address.
-- The issue boundary still validates its resolved recipient before any link or
-- email is created. Do not copy manual recipients into Quote/CRM history.
do $migration$
declare
  target regprocedure := 'booking_api.readiness_before_goods_value_20260905(uuid)'::regprocedure;
  definition text := pg_get_functiondef(target);
  email_guard text := $guard$if nullif(btrim(quote_row."CusQuoteHeader_ContactEmailSnapshot"), '') is null then missing := array_append(missing, 'Customer email'); end if;$guard$;
  issue_definition text := pg_get_functiondef('public.quote_workflow_prepare_customer_response_v4(uuid,uuid,text,text,text,text,text,text,timestamptz)'::regprocedure);
begin
  if strpos(pg_get_functiondef('booking_api.quote_readiness(uuid)'::regprocedure), 'booking_api.readiness_before_goods_value_20260905(') = 0
     or strpos(issue_definition, 'if requested_recipient_email is null') = 0
     or strpos(issue_definition, 'Enter a valid customer email address.') = 0 then
    raise exception 'Quote recipient/readiness boundaries changed; review this migration before applying.';
  end if;
  if (length(definition) - length(replace(definition, email_guard, ''))) / length(email_guard) <> 1 then
    raise exception 'Expected exactly one saved-contact email readiness guard; review before applying.';
  end if;
  execute replace(definition, email_guard,
    '-- Delivery validates the selected saved/manual recipient; a saved contact email is not a shipment requirement.');
end $migration$;

-- CREATE OR REPLACE preserves the existing function identity and ACL. This
-- migration changes no records, grants, RLS, submission or event/watch writes.
