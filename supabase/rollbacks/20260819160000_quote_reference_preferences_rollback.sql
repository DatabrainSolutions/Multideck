drop trigger if exists "TR_CusQuote_Header_reference_guard" on public."CusQuote_Header";
drop function if exists quote_api.ensure_quote_reference();
drop function if exists quote_api.clean_reference_prefix(text, text);
drop function if exists public.quote_workflow_open_quote(uuid);
drop function if exists public.quote_workflow_get_reference_settings(uuid);
drop function if exists public.quote_workflow_save_reference_settings(uuid, text, text);
drop table if exists quote_api.reference_settings;
