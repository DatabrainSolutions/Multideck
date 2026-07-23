using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobTrackingException
{
    public Guid JobTrackExId { get; set; }

    public Guid JobTrackExJobId { get; set; }

    public Guid? JobTrackExJobRouteId { get; set; }

    public Guid? JobTrackExJobCargoId { get; set; }

    public Guid? JobTrackExJobContainerId { get; set; }

    public Guid? JobTrackExEventId { get; set; }

    public string JobTrackExType { get; set; } = null!;

    public string JobTrackExSeverity { get; set; } = null!;

    public string JobTrackExStatus { get; set; } = null!;

    public string JobTrackExTitle { get; set; } = null!;

    public string? JobTrackExDetail { get; set; }

    public string? JobTrackExImpactSummary { get; set; }

    public string? JobTrackExRecommendedAction { get; set; }

    public DateTime JobTrackExDetectedAt { get; set; }

    public DateTime? JobTrackExDueAt { get; set; }

    public DateTime? JobTrackExResolvedAt { get; set; }

    public Guid? JobTrackExResolvedBy { get; set; }

    public bool JobTrackExIsAirecommended { get; set; }

    public string JobTrackExAirationaleJson { get; set; } = null!;

    public DateTime JobTrackExCreatedAt { get; set; }

    public Guid? JobTrackExCreatedBy { get; set; }

    public DateTime JobTrackExUpdatedAt { get; set; }

    public Guid? JobTrackExUpdatedBy { get; set; }

    public virtual ICollection<ClmIncident> ClmIncidents { get; set; } = new List<ClmIncident>();

    public virtual JobTrackingEvent? JobTrackExEvent { get; set; }

    public virtual JobHeader JobTrackExJob { get; set; } = null!;

    public virtual JobCargo? JobTrackExJobCargo { get; set; }

    public virtual JobContainer? JobTrackExJobContainer { get; set; }

    public virtual JobRouting? JobTrackExJobRoute { get; set; }

    public virtual SysJobTrackingExceptionType JobTrackExTypeNavigation { get; set; } = null!;

    public virtual ICollection<WorkflowExceptionLink> WorkflowExceptionLinks { get; set; } = new List<WorkflowExceptionLink>();
}
