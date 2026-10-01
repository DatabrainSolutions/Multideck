-- A separate Draft-only transport projection. Does not publish layouts or
-- enable legal Originals, copies, signatures, customs/security declarations.
begin;
set local lock_timeout = '5s';

create function document_api.transport_document_source(caller_auth_user_id uuid, requested_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor record; job record; source jsonb; parties jsonb; routes jsonb; cargo jsonb; equipment jsonb; allocations jsonb;
begin
  select u."User_ID",u."Company_ID" into strict actor from public."cmp_Users" u
  where u."Auth_User_ID"=caller_auth_user_id and u."User_AccessStatus"='active';
  if not document_api.has_permission(caller_auth_user_id,'Documents.Generate')
    or not booking_api.has_permission(caller_auth_user_id,'Bookings.Read') then
    raise exception 'Transport document access is not authorised.' using errcode='42501'; end if;
  select j.* into strict job from public."Job_Header" j
  join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID")
    and o."Company_ID"=actor."Company_ID" and o."Office_IsActive"
  join public."cmp_Users_Offices" uo on uo."Office_ID"=o."Office_ID" and uo."User_ID"=actor."User_ID"
  where j."Job_ID"=requested_job_id and not j."Job_IsDeleted";
  if lower(job."Job_Status")='cancelled' then raise exception 'Reopen the Booking before creating a transport Draft.' using errcode='55000'; end if;
  select coalesce(jsonb_object_agg(role,value),'{}') into parties from (
    select distinct on (p."JobParty_Role") p."JobParty_Role" role,
      jsonb_build_object('name',p."JobParty_NameSnapshot",'address',p."JobParty_AddressSnapshot",
        'countryCode',p."JobParty_CountryCodeSnapshot") value
    from public."Job_Parties" p where p."JobParty_JobID"=requested_job_id
      and p."JobParty_Role" in ('shipper','consignor','consignee','notify','delivery_agent')
    order by p."JobParty_Role",p."JobParty_IsPrimary" desc,p."JobParty_Sequence",p."JobParty_ID"
  ) saved;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r."JobRoute_ID",'sequence',r."JobRoute_OrderNo",'mode',r."JobRoute_ModeCode",
    'origin',jsonb_build_object('name',r."JobRoute_OriginNameSnapshot",'unlocode',r."JobRoute_OriginUNLocode",'iataCode',origin_airport.iata),
    'destination',jsonb_build_object('name',r."JobRoute_DestinationNameSnapshot",'unlocode',r."JobRoute_DestinationUNLocode",'iataCode',destination_airport.iata),
    'plannedDepartureAt',r."JobRoute_PlannedDepartureAt",'plannedArrivalAt',r."JobRoute_PlannedArrivalAt",
    'vessel',r."JobRoute_Vessel",'voyageNumber',r."JobRoute_VoyageNumber",'flightNumber',r."JobRoute_FlightNumber",
    'carrierName',c."Org_Name",'carrierAddressLine1',null,'carrierAddressCity',null,
    'carrierBookingReference',r."JobRoute_CarrierBookingReference",'masterTransportReference',r."JobRoute_MasterTransportReference",
    'houseTransportReference',r."JobRoute_HouseTransportReference",'isMainCarriage',r."JobRoute_IsMainCarriage"
  ) order by r."JobRoute_OrderNo",r."JobRoute_ID"),'[]') into routes
  from public."Job_Routing" r left join public."Org_Master" c on c."Org_id"=r."JobRoute_Carrier"
  -- Only an explicit, active airport reference with one unambiguous code is
  -- usable. Never derive an IATA code by chopping letters from a UN/LOCODE.
  left join lateral (select min(l."RL_IATA") iata from public."sys_RefUNLOCO" l
    where l."RL_Code"=r."JobRoute_OriginUNLocode" and l."RL_IsActive" and l."RL_HasAirport"
      and l."RL_IATA" ~ '^[A-Z]{3}$' having count(distinct l."RL_IATA")=1) origin_airport on true
  left join lateral (select min(l."RL_IATA") iata from public."sys_RefUNLOCO" l
    where l."RL_Code"=r."JobRoute_DestinationUNLocode" and l."RL_IsActive" and l."RL_HasAirport"
      and l."RL_IATA" ~ '^[A-Z]{3}$' having count(distinct l."RL_IATA")=1) destination_airport on true
  where r."Job_ID"=requested_job_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',c."JobCargo_ID",'lineNumber',c."JobCargo_LineNo",
    'commodity',c."JobCargo_Commodity",'description',c."JobCargo_Description",'packageQuantity',c."JobCargo_PackageQty"::text,
    'packageType',c."JobCargo_PackageTypeCodeSnapshot",'grossWeight',c."JobCargo_GrossKilos"::text,
    'chargeableWeight',c."JobCargo_ChargeableWeightKg"::text,'volume',c."JobCargo_VolumeCBM"::text,
    'marksAndNumbers',coalesce(nullif(c."JobCargo_CargoJSON"->>'marksAndNumbers',''),c."JobCargo_MarksNumbers"),
    'hsCode',c."JobCargo_HSCode",'isHazardous',c."JobCargo_IsHazardous",
    'handling',case when quote_api.cargo_handling(c."JobCargo_CargoJSON"->>'handlingDetailsJson') ? 'fragile' then 'Fragile' end
  ) order by c."JobCargo_LineNo",c."JobCargo_ID"),'[]') into cargo
  from public."Job_Cargo" c where c."JobCargo_JobID"=requested_job_id and not c."JobCargo_IsDeleted";
  select coalesce(jsonb_agg(jsonb_build_object('id',e."JobContainers_ID",'kind',e."JobContainer_EquipmentKind",
    'number',e."JobContainer_Number",'type',e."JobContainer_TypeCodeSnapshot",'seal',e."JobContainer_JSON"->>'sealNumber',
    'packages',e."JobContainer_JSON"->>'packages','packageType',e."JobContainer_JSON"->>'packageType',
    'grossWeight',e."JobContainer_GrossKilos"::text,'verifiedGrossMass',e."JobContainer_VGMKilos"::text,
    'volume',e."JobContainer_JSON"->>'volumeCbm'
  ) order by e."JobContainer_CreatedAt",e."JobContainers_ID"),'[]') into equipment
  from public."Job_Containers" e where e."Job_ID"=requested_job_id and not e."JobContainer_IsDeleted";
  select coalesce(jsonb_agg(jsonb_build_object('cargoId',a.cargo_id,'containerId',a.container_id,'routeId',a.route_id,
    'packageQuantity',a.package_quantity::text,'grossWeight',a.gross_weight_kg::text,'volume',a.volume_cbm::text
  ) order by a.created_at,a.id),'[]') into allocations
  from booking_api.cargo_equipment_allocations a
  join public."Job_Cargo" c on c."JobCargo_ID"=a.cargo_id and c."JobCargo_JobID"=requested_job_id and not c."JobCargo_IsDeleted"
  join public."Job_Containers" e on e."JobContainers_ID"=a.container_id and e."Job_ID"=requested_job_id and not e."JobContainer_IsDeleted"
  where a.job_id=requested_job_id and not a.is_deleted;
  source:=jsonb_build_object('jobId',requested_job_id,'companyId',actor."Company_ID",
    'company',jsonb_build_object('name',(select c."Company_Name" from public."cmp_Company" c where c."Company_ID"=actor."Company_ID")),
    'job',jsonb_build_object('bookingReference',job."Job_BookingReference",'collectionAddress',job."Job_CollectionAddress",
      'deliveryAddress',job."Job_DeliveryAddress",'shipperReference',job."Job_EditableDetailsJSON"->>'shipperReference',
      'chargeableWeightOverride',job."Job_EditableDetailsJSON"->>'chargeableWeightKg'),
    'shipper',coalesce(parties->'shipper',parties->'consignor'),'consignee',parties->'consignee',
    'notify',parties->'notify','deliveryAgent',parties->'delivery_agent','routing',routes,'cargo',cargo,'equipment',equipment,'allocations',allocations);
  return source||jsonb_build_object('reviewToken',md5(source::text));
exception when no_data_found or too_many_rows then
  raise exception 'Transport document access is not authorised.' using errcode='42501';
end $$;

create function document_api.freeze_transport_document_draft(
  caller_auth_user_id uuid, requested_render_job_id uuid, expected_review_token text,
  expected_source_hash text, mapped_dataset jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_id uuid; render record; source jsonb; issue jsonb; snapshot jsonb;
begin
  select u."User_ID" into strict actor_id from public."cmp_Users" u
  where u."Auth_User_ID"=caller_auth_user_id and u."User_AccessStatus"='active';
  select r.*,t."DOCBT_Code" code,v."DOCBTV_TemplateSnapshotJSON"#>>'{source,sha256}' source_hash into strict render
  from public."DOCB_RenderJobs" r join public."DOCB_DocumentTemplates" t on t."DOCBT_ID"=r."DOCBRJ_TemplateID"
  join public."DOCB_TemplateVersions" v on v."DOCBTV_ID"=r."DOCBRJ_TemplateVersionID" and v."DOCBTV_StatusCode"='published'
  where r."DOCBRJ_ID"=requested_render_job_id and r."DOCBRJ_CreatedBy"=actor_id and r."DOCBRJ_StatusCode"='rendering'
    and r."DOCBRJ_OutputFormatCode"='pdf' and t."DOCBT_IsActive" and t."DOCBT_StatusCode"='published'
    and t."DOCBT_Code" in ('FIATA_BOL_REFERENCE','JE2648771_FBL_MULTIMODAL_CTRS_A4260714093859','MAWB','MNG_AWB')
  for update of r;
  source:=document_api.transport_document_source(caller_auth_user_id,render."DOCBRJ_JobID");
  if expected_review_token is null or expected_review_token is distinct from source->>'reviewToken' then
    raise exception 'The Booking changed. Review the transport Draft again.' using errcode='40001'; end if;
  if expected_source_hash is null or expected_source_hash is distinct from render.source_hash then
    raise exception 'Publish a reviewed transport layout before generating a Draft.' using errcode='22023'; end if;
  if mapped_dataset#>>'{documentIssue,status}' is distinct from 'draft'
    or mapped_dataset#>>'{documentIssue,isLegalOriginal}' is distinct from 'false'
    or mapped_dataset#>>'{meta,transportMappingVersion}' is distinct from '1'
    or mapped_dataset#>>'{job,reference}' is distinct from source#>>'{job,bookingReference}' then
    raise exception 'Only the reviewed Draft transport mapping is supported.' using errcode='22023'; end if;
  if render."DOCBRJ_RenderSettingsJSON" ? 'documentIssue' then
    raise exception 'The Draft has already been frozen.' using errcode='22023'; end if;
  issue:=jsonb_build_object('status','draft','label','DRAFT','selectedAt',now(),'selectedBy',actor_id,'policyVersion',2,'isLegalOriginal',false);
  snapshot:=mapped_dataset||jsonb_build_object('documentIssue',issue,
    'meta',coalesce(render."DOCBRJ_InputSnapshotJSON"->'meta','{}')||(mapped_dataset->'meta'));
  update public."DOCB_RenderJobs" set "DOCBRJ_InputSnapshotJSON"=snapshot,
    "DOCBRJ_RenderSettingsJSON"=coalesce("DOCBRJ_RenderSettingsJSON",'{}')||jsonb_build_object('documentIssue',issue,
      'transportReviewToken',expected_review_token,'transportMappingVersion',1,'transportSourceHash',expected_source_hash)
  where "DOCBRJ_ID"=requested_render_job_id;
  return snapshot;
exception when no_data_found or too_many_rows then
  raise exception 'Transport Draft generation is not authorised.' using errcode='42501';
end $$;
revoke all on function document_api.transport_document_source(uuid,uuid) from public,anon,authenticated;
revoke all on function document_api.freeze_transport_document_draft(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function document_api.transport_document_source(uuid,uuid) to service_role;
grant execute on function document_api.freeze_transport_document_draft(uuid,uuid,text,text,jsonb) to service_role;

alter function booking_api.workspace_documents(uuid,uuid) rename to workspace_documents_before_transport_20261001;
create function booking_api.workspace_documents(caller_auth_user_id uuid, requested_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare existing jsonb; generated jsonb;
begin
  existing:=booking_api.workspace_documents_before_transport_20261001(caller_auth_user_id,requested_job_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d."DOCBGD_ID",'category','job','typeCode','transport_draft','title',t."DOCBT_Name",
    'source','document_builder','status','ready','documentIssueStatus','draft',
    'fileName',d."DOCBGD_FileName",'mimeType',d."DOCBGD_MimeType",'fileSizeBytes',d."DOCBGD_FileSizeBytes",
    'version',d."DOCBGD_VersionNo",'isCurrent',d."DOCBGD_IsCurrentVersion",'createdAt',d."DOCBGD_CreatedAt",
    'sourceRecordId',requested_job_id,'sourceReference',j."Job_BookingReference",
    'metadata',jsonb_build_object('renderJobId',r."DOCBRJ_ID",'templateVersionId',d."DOCBGD_TemplateVersionID",
      'templateCode',t."DOCBT_Code",'templateName',t."DOCBT_Name",'documentIssue',r."DOCBRJ_RenderSettingsJSON"->'documentIssue')
  ) order by d."DOCBGD_CreatedAt" desc,d."DOCBGD_ID" desc),'[]') into generated
  from public."DOCB_GeneratedDocuments" d
  join public."DOCB_RenderJobs" r on r."DOCBRJ_ID"=d."DOCBGD_RenderJobID"
  join public."DOCB_DocumentTemplates" t on t."DOCBT_ID"=d."DOCBGD_TemplateID"
  join public."Job_Header" j on j."Job_ID"=r."DOCBRJ_JobID" and not j."Job_IsDeleted"
  join public."cmp_Offices" o on o."Office_ID"=coalesce(j."Job_OrgOfficeID",j."Job_OfficeID") and o."Office_IsActive"
  join public."cmp_Users" u on u."Company_ID"=o."Company_ID" and u."Auth_User_ID"=caller_auth_user_id and u."User_AccessStatus"='active'
  join public."cmp_Users_Offices" uo on uo."Office_ID"=o."Office_ID" and uo."User_ID"=u."User_ID"
  where r."DOCBRJ_JobID"=requested_job_id and r."DOCBRJ_StatusCode" in ('completed','completed_with_warnings')
    and r."DOCBRJ_RenderSettingsJSON"#>>'{documentIssue,status}'='draft'
    and r."DOCBRJ_RenderSettingsJSON"->>'transportMappingVersion'='1'
    and document_api.has_permission(caller_auth_user_id,'Documents.Read') and booking_api.has_permission(caller_auth_user_id,'Bookings.Read');
  return existing||generated;
end $$;
revoke all on function booking_api.workspace_documents(uuid,uuid) from public,anon,authenticated;
grant execute on function booking_api.workspace_documents(uuid,uuid) to service_role;
commit;
