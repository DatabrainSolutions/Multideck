begin;

update public."sys_AIDexterActions"
set
  "AIDexterAction_HasExternalEffect" = true,
  "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'review_phone_call_suggestion';

do $$
begin
  if not exists (
    select 1
    from public."sys_AIDexterActions" action
    where action."AIDexterAction_Code" = 'review_phone_call_suggestion'
      and action."AIDexterAction_HasExternalEffect" = true
  ) then
    raise exception 'The phone-call review action registry entry is missing.';
  end if;
end;
$$;

commit;

