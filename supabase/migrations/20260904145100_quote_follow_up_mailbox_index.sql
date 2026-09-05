begin;

create index if not exists customer_response_links_delivery_mailbox_idx
  on quote_api.customer_response_links (delivery_mailbox_id);

commit;
