begin;

revoke all on function public._multideck_phone_call_action_watch_source_change() from public, anon, authenticated;
revoke all on function public._multideck_phone_call_review_watch_source_change() from public, anon, authenticated;
revoke all on function public._multideck_phone_call_watch_source_change() from public, anon, authenticated;

grant execute on function public._multideck_phone_call_action_watch_source_change() to service_role;
grant execute on function public._multideck_phone_call_review_watch_source_change() to service_role;
grant execute on function public._multideck_phone_call_watch_source_change() to service_role;

commit;
