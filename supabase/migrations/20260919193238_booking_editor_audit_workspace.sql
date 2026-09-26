begin;
set local lock_timeout='5s';

-- Use the same layered workspace as the UI. The older private projection omits
-- operational Details overrides and therefore cannot prove their before/after values.
do $patch$
declare definition text; before_snapshot text;
begin
 definition:=pg_get_functiondef('public.booking_workflow_save(uuid,uuid,jsonb)'::regprocedure);
 if position('booking_api.audit_business_value(booking_api.workspace(' in definition)=0 then
   raise exception 'Review Booking editor audit workspace before applying.';
 end if;
 definition:=replace(definition,'booking_api.workspace(caller_auth_user_id,job."Job_BookingReference")','public.booking_workflow_workspace(caller_auth_user_id,job."Job_BookingReference")');
 before_snapshot:=$line$before_value:=booking_api.audit_business_value(public.booking_workflow_workspace(caller_auth_user_id,job."Job_BookingReference") - array['events','documents','declarations','charges','sourceQuote']);$line$;
 if position(before_snapshot in definition)=0 then raise exception 'Review Booking before-snapshot anchor.';end if;
 definition:=replace(definition,before_snapshot,'');
 definition:=replace(definition,'if payload ? ''operationsOwnerId''',before_snapshot||E'\n if payload ? ''operationsOwnerId''');
 -- The UI projection supplies the saved owner's display name on new records even
-- when legacy JSON has none. Accept that unchanged value, never an arbitrary name.
 definition:=replace(definition,$old$(payload ? 'editableDetails' and payload#>'{editableDetails,ownerName}' is distinct from job."Job_EditableDetailsJSON"->'ownerName')$old$,
 $new$(payload->'editableDetails' ? 'ownerName' and payload#>'{editableDetails,ownerName}' is distinct from before_value#>'{booking,editableDetails,ownerName}')$new$);
 execute definition;
end $patch$;
commit;
