-- Align Booking handover with the current declaration editor; preserve original snapshots.
-- No grants, RLS, existing declaration data, submission or provider changes.
do $patch$
declare definition text; before_text text; after_text text; party text;
begin
 definition := pg_get_functiondef('booking_api.send_to_customs(uuid,uuid,uuid)'::regprocedure);
 before_text := $old$'exporter', exporter_identifier, 'exporterName'$old$;
 after_text := $new$'bookingHandoffUiVersion', 2, 'exporter', exporter_row."JobParty_NameSnapshot", 'exporterEori', coalesce(exporter_identifier, ''), 'exporterName'$new$;
 if strpos(definition,before_text)=0 then raise exception 'Unexpected handover exporter mapping'; end if;
 definition := replace(definition,before_text,after_text);
 before_text := $old$'importer', importer_identifier, 'importerName'$old$;
 after_text := $new$'importer', importer_row."JobParty_NameSnapshot", 'importerEori', coalesce(importer_identifier, ''), 'importerName'$new$;
 if strpos(definition,before_text)=0 then raise exception 'Unexpected handover importer mapping'; end if;
 definition := replace(definition,before_text,after_text);
 before_text := $old$'consignee', importer_identifier, 'consigneeName'$old$;
 after_text := $new$'consignee', importer_row."JobParty_NameSnapshot", 'consigneeEori', coalesce(importer_identifier, ''), 'consigneeName'$new$;
 if strpos(definition,before_text)=0 then raise exception 'Unexpected handover consignee mapping'; end if;
 execute replace(definition,before_text,after_text);
 definition := pg_get_functiondef('booking_api.save_job_customs_draft(uuid,uuid,jsonb)'::regprocedure);
 foreach party in array array['exporter','importer','declarant'] loop
   before_text := format('nullif(btrim(p_draft->>%L),%L)',party,'');
   after_text := format('nullif(btrim(case when p_draft ? %L then p_draft->>%L else p_draft->>%L end),%L)',party||'Eori',party||'Eori',party,'');
   if strpos(definition,before_text)=0 then raise exception 'Unexpected draft identifier mapping: %',party; end if;
   definition := replace(definition,before_text,after_text);
 end loop;
 execute definition;
end;
$patch$;
