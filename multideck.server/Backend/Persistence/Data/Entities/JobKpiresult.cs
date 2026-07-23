using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobKpiresult
{
    public Guid JobKpiId { get; set; }

    public Guid JobKpiJobId { get; set; }

    public Guid? JobKpiJobRouteId { get; set; }

    public Guid? JobKpiJobCargoId { get; set; }

    public Guid? JobKpiJobContainerId { get; set; }

    public string JobKpiCode { get; set; } = null!;

    public decimal? JobKpiTargetValue { get; set; }

    public decimal? JobKpiActualValue { get; set; }

    public string? JobKpiUnit { get; set; }

    public DateTime? JobKpiTargetAt { get; set; }

    public DateTime? JobKpiActualAt { get; set; }

    public bool JobKpiBreached { get; set; }

    public string? JobKpiBreachSeverity { get; set; }

    public Guid? JobKpiSourceEventId { get; set; }

    public Guid? JobKpiSourcePredictionId { get; set; }

    public DateTime JobKpiCalculatedAt { get; set; }

    public string JobKpiCalculationJson { get; set; } = null!;

    public DateTime JobKpiCreatedAt { get; set; }

    public virtual SysJobKpidefinition JobKpiCodeNavigation { get; set; } = null!;

    public virtual JobHeader JobKpiJob { get; set; } = null!;

    public virtual JobCargo? JobKpiJobCargo { get; set; }

    public virtual JobContainer? JobKpiJobContainer { get; set; }

    public virtual JobRouting? JobKpiJobRoute { get; set; }

    public virtual JobTrackingEvent? JobKpiSourceEvent { get; set; }

    public virtual JobTrackingPrediction? JobKpiSourcePrediction { get; set; }
}
