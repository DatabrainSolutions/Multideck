using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobRouting
{
    public Guid JobRouteId { get; set; }

    public Guid JobId { get; set; }

    public int? JobRouteLegType { get; set; }

    public DateTime? JobRouteLegEtd { get; set; }

    public DateTime? JobRouteLegEta { get; set; }

    public int? JobRouteOrderNo { get; set; }

    public string? JobRouteOriginUnlocode { get; set; }

    public string? JobRouteDestinationUnlocode { get; set; }

    public Guid? JobRouteCarrier { get; set; }

    public Guid? JobRouteMode { get; set; }

    public string? JobRouteVessel { get; set; }

    public string? JobRouteVoyageNumber { get; set; }

    public bool? JobRouteTracked { get; set; }

    public string? JobRouteLegTypeCode { get; set; }

    public string JobRouteStatus { get; set; } = null!;

    public string? JobRouteModeCode { get; set; }

    public string? JobRouteOriginNameSnapshot { get; set; }

    public Guid? JobRouteOriginAddressId { get; set; }

    public string? JobRouteOriginAddressSnapshot { get; set; }

    public string? JobRouteOriginTerminal { get; set; }

    public string? JobRouteDestinationNameSnapshot { get; set; }

    public Guid? JobRouteDestinationAddressId { get; set; }

    public string? JobRouteDestinationAddressSnapshot { get; set; }

    public string? JobRouteDestinationTerminal { get; set; }

    public DateTime? JobRoutePlannedPickupAt { get; set; }

    public DateTime? JobRouteEstimatedPickupAt { get; set; }

    public DateTime? JobRouteActualPickupAt { get; set; }

    public DateTime? JobRoutePlannedDepartureAt { get; set; }

    public DateTime? JobRouteEstimatedDepartureAt { get; set; }

    public DateTime? JobRouteActualDepartureAt { get; set; }

    public DateTime? JobRoutePlannedArrivalAt { get; set; }

    public DateTime? JobRouteEstimatedArrivalAt { get; set; }

    public DateTime? JobRouteActualArrivalAt { get; set; }

    public DateTime? JobRoutePlannedDeliveryAt { get; set; }

    public DateTime? JobRouteEstimatedDeliveryAt { get; set; }

    public DateTime? JobRouteActualDeliveryAt { get; set; }

    public string? JobRouteCarrierBookingReference { get; set; }

    public string? JobRouteMasterTransportReference { get; set; }

    public string? JobRouteHouseTransportReference { get; set; }

    public string? JobRouteServiceLevel { get; set; }

    public string? JobRouteTransportMeansName { get; set; }

    public string? JobRouteFlightNumber { get; set; }

    public string? JobRouteVehicleRegistration { get; set; }

    public string? JobRouteTrailerNumber { get; set; }

    public string? JobRouteRailService { get; set; }

    public decimal? JobRouteDistanceKm { get; set; }

    public bool JobRouteIsMainCarriage { get; set; }

    public string JobRouteRouteJson { get; set; } = null!;

    public string? JobRouteInternalNotes { get; set; }

    public DateTime JobRouteUpdatedAt { get; set; }

    public Guid? JobRouteUpdatedBy { get; set; }

    public virtual ICollection<ClmClaim> ClmClaims { get; set; } = new List<ClmClaim>();

    public virtual ICollection<ClmIncident> ClmIncidents { get; set; } = new List<ClmIncident>();

    public virtual JobHeader Job { get; set; } = null!;

    public virtual ICollection<JobKpiresult> JobKpiresults { get; set; } = new List<JobKpiresult>();

    public virtual ICollection<JobRouteCargo> JobRouteCargos { get; set; } = new List<JobRouteCargo>();

    public virtual ICollection<JobRouteContainer> JobRouteContainers { get; set; } = new List<JobRouteContainer>();

    public virtual SysJobLegType? JobRouteLegTypeCodeNavigation { get; set; }

    public virtual ICollection<JobRouteMilestone> JobRouteMilestones { get; set; } = new List<JobRouteMilestone>();

    public virtual SysJobTransportMode? JobRouteModeCodeNavigation { get; set; }

    public virtual ICollection<JobRouteParty> JobRouteParties { get; set; } = new List<JobRouteParty>();

    public virtual SysJobLegStatus JobRouteStatusNavigation { get; set; } = null!;

    public virtual ICollection<JobTrackingEvent> JobTrackingEvents { get; set; } = new List<JobTrackingEvent>();

    public virtual ICollection<JobTrackingException> JobTrackingExceptions { get; set; } = new List<JobTrackingException>();

    public virtual ICollection<JobTrackingPrediction> JobTrackingPredictions { get; set; } = new List<JobTrackingPrediction>();

    public virtual ICollection<JobTrackingSubscription> JobTrackingSubscriptions { get; set; } = new List<JobTrackingSubscription>();
}
