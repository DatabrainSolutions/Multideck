using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobContainer
{
    public Guid JobContainersId { get; set; }

    public Guid? JobId { get; set; }

    public Guid? JobContainerType { get; set; }

    public string? JobContainerNumber { get; set; }

    public decimal? JobContainerHeight { get; set; }

    public decimal? JobContainerWidth { get; set; }

    public decimal? JobContainerLength { get; set; }

    public string? JobContainerTypeCodeSnapshot { get; set; }

    public string JobContainerEquipmentKind { get; set; } = null!;

    public string JobContainerStatus { get; set; } = null!;

    public Guid? JobContainerOwnerOrgId { get; set; }

    public Guid? JobContainerSupplierOrgId { get; set; }

    public decimal? JobContainerTareKilos { get; set; }

    public decimal? JobContainerGrossKilos { get; set; }

    public decimal? JobContainerVgmkilos { get; set; }

    public string? JobContainerVgmmethod { get; set; }

    public decimal? JobContainerReeferSetPoint { get; set; }

    public string? JobContainerReeferUnit { get; set; }

    public bool? JobContainerIsSoc { get; set; }

    public bool? JobContainerIsShipperOwned { get; set; }

    public string? JobContainerNotes { get; set; }

    public string JobContainerJson { get; set; } = null!;

    public DateTime JobContainerCreatedAt { get; set; }

    public DateTime JobContainerUpdatedAt { get; set; }

    public Guid? JobContainerUpdatedBy { get; set; }

    public bool JobContainerIsDeleted { get; set; }

    public virtual ICollection<BlEquipment> BlEquipments { get; set; } = new List<BlEquipment>();

    public virtual ICollection<ClmClaim> ClmClaims { get; set; } = new List<ClmClaim>();

    public virtual ICollection<ClmIncidentCargoItem> ClmIncidentCargoItems { get; set; } = new List<ClmIncidentCargoItem>();

    public virtual ICollection<ClmIncident> ClmIncidents { get; set; } = new List<ClmIncident>();

    public virtual JobHeader? Job { get; set; }

    public virtual ICollection<JobContainerSeal> JobContainerSeals { get; set; } = new List<JobContainerSeal>();

    public virtual ICollection<JobKpiresult> JobKpiresults { get; set; } = new List<JobKpiresult>();

    public virtual ICollection<JobRouteContainer> JobRouteContainers { get; set; } = new List<JobRouteContainer>();

    public virtual ICollection<JobTrackingEvent> JobTrackingEvents { get; set; } = new List<JobTrackingEvent>();

    public virtual ICollection<JobTrackingException> JobTrackingExceptions { get; set; } = new List<JobTrackingException>();

    public virtual ICollection<JobTrackingPrediction> JobTrackingPredictions { get; set; } = new List<JobTrackingPrediction>();

    public virtual ICollection<JobTrackingSubscription> JobTrackingSubscriptions { get; set; } = new List<JobTrackingSubscription>();

    public virtual ICollection<JobCargo> JobCargos { get; set; } = new List<JobCargo>();
}
