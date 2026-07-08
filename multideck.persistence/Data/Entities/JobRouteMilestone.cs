using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobRouteMilestone
{
    public Guid JobRouteMilestoneId { get; set; }

    public Guid JobRouteMilestoneJobRouteId { get; set; }

    public string JobRouteMilestoneType { get; set; } = null!;

    public string JobRouteMilestoneStatus { get; set; } = null!;

    public DateTime? JobRouteMilestonePlannedAt { get; set; }

    public DateTime? JobRouteMilestoneEstimatedAt { get; set; }

    public DateTime? JobRouteMilestoneActualAt { get; set; }

    public string? JobRouteMilestoneLocationUnlocode { get; set; }

    public string? JobRouteMilestoneLocationNameSnapshot { get; set; }

    public string? JobRouteMilestoneExternalReference { get; set; }

    public string? JobRouteMilestoneSource { get; set; }

    public string? JobRouteMilestoneNotes { get; set; }

    public string JobRouteMilestonePayloadJson { get; set; } = null!;

    public DateTime JobRouteMilestoneCreatedAt { get; set; }

    public Guid? JobRouteMilestoneTrackingEventId { get; set; }

    public virtual JobRouting JobRouteMilestoneJobRoute { get; set; } = null!;

    public virtual JobTrackingEvent? JobRouteMilestoneTrackingEvent { get; set; }

    public virtual SysJobMilestoneType JobRouteMilestoneTypeNavigation { get; set; } = null!;
}
