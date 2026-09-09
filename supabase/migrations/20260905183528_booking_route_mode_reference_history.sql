-- Shared reference columns must not silently acquire a different mode meaning.
-- This trigger also covers accepted-Quote and older operational save paths.
begin;

create function booking_api.preserve_route_mode_references()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  from_mode text := booking_api.normalise_mode(old."JobRoute_ModeCode");
  to_mode text := booking_api.normalise_mode(new."JobRoute_ModeCode");
  before_refs jsonb;
  after_refs jsonb;
  review jsonb;
  reviewed boolean := false;
  company uuid;
begin
  before_refs := jsonb_build_object(
    'masterTransportReference',nullif(btrim(old."JobRoute_MasterTransportReference"),''),
    'houseTransportReference',nullif(btrim(old."JobRoute_HouseTransportReference"),''),
    'carrierBookingReference',nullif(btrim(old."JobRoute_CarrierBookingReference"),''),
    'transportMeansName',nullif(btrim(old."JobRoute_TransportMeansName"),''));
  review := coalesce(new."JobRoute_RouteJSON"->'modeChangeReview',new."JobRoute_RouteJSON"#>'{routeData,modeChangeReview}');

  if from_mode is distinct from to_mode then
    if review is not null then
      if jsonb_typeof(review) is distinct from 'object'
        or review->>'fromMode' is distinct from from_mode
        or review->>'toMode' is distinct from to_mode
        or review->'beforeReferences' is distinct from before_refs then
        raise exception 'This routing step changed since the mode review. Reload the Booking and review the mode change again.' using errcode='40001';
      end if;
      reviewed := true;
    end if;
    -- Reviewed manual changes start blank in the editor; explicitly re-entered
    -- values can be retained, including a deliberately reused identical value.
    -- Older and accepted-Quote paths must not inherit unchanged references.
    if not reviewed then
      if new."JobRoute_MasterTransportReference" is not distinct from old."JobRoute_MasterTransportReference" then new."JobRoute_MasterTransportReference":=null; end if;
      if new."JobRoute_HouseTransportReference" is not distinct from old."JobRoute_HouseTransportReference" then new."JobRoute_HouseTransportReference":=null; end if;
      if new."JobRoute_CarrierBookingReference" is not distinct from old."JobRoute_CarrierBookingReference" then new."JobRoute_CarrierBookingReference":=null; end if;
      if new."JobRoute_TransportMeansName" is not distinct from old."JobRoute_TransportMeansName" then new."JobRoute_TransportMeansName":=null; end if;
    end if;
  end if;

  after_refs := jsonb_build_object(
    'masterTransportReference',nullif(btrim(new."JobRoute_MasterTransportReference"),''),
    'houseTransportReference',nullif(btrim(new."JobRoute_HouseTransportReference"),''),
    'carrierBookingReference',nullif(btrim(new."JobRoute_CarrierBookingReference"),''),
    'transportMeansName',nullif(btrim(new."JobRoute_TransportMeansName"),''));
  -- A review is one-use request evidence, never a permanent approval flag.
  new."JobRoute_RouteJSON" := (coalesce(new."JobRoute_RouteJSON",'{}'::jsonb)-'modeChangeReview') || after_refs;
  if jsonb_typeof(new."JobRoute_RouteJSON"->'routeData')='object' then
    new."JobRoute_RouteJSON" := jsonb_set(new."JobRoute_RouteJSON",'{routeData}',
      (new."JobRoute_RouteJSON"->'routeData'-'modeChangeReview') || after_refs);
  end if;

  if from_mode is distinct from to_mode or before_refs is distinct from after_refs then
    select office."Company_ID" into company from public."Job_Header" job
      join public."cmp_Offices" office on office."Office_ID"=coalesce(job."Job_OrgOfficeID",job."Job_OfficeID")
      where job."Job_ID"=new."Job_ID";
    if company is null then raise exception 'Routing history needs a valid Booking workspace.' using errcode='42501'; end if;
    insert into booking_api.events(company_id,job_id,event_type,summary,metadata,actor_user_id)
      values(company,new."Job_ID",
        case when from_mode is distinct from to_mode then 'route_mode_changed' else 'route_references_updated' end,
        case when from_mode is distinct from to_mode then format('Routing step %s mode changed from %s to %s; previous references retained in audit history.',new."JobRoute_OrderNo",from_mode,to_mode)
          else format('Routing step %s transport references updated.',new."JobRoute_OrderNo") end,
        jsonb_build_object('routeId',new."JobRoute_ID",'fromMode',from_mode,'toMode',to_mode,
          'beforeReferences',before_refs,'afterReferences',after_refs,'reviewed',reviewed,
          'previousTransport',jsonb_build_object('vessel',old."JobRoute_Vessel",'voyageNumber',old."JobRoute_VoyageNumber",
            'flightNumber',old."JobRoute_FlightNumber",'vehicleRegistration',old."JobRoute_VehicleRegistration",
            'trailerNumber',old."JobRoute_TrailerNumber",'railService',old."JobRoute_RailService")),new."JobRoute_UpdatedBy");
  end if;
  return new;
end;
$$;

revoke all on function booking_api.preserve_route_mode_references() from public,anon,authenticated,service_role;
create trigger preserve_route_mode_references before update on public."Job_Routing"
  for each row execute function booking_api.preserve_route_mode_references();

commit;
