using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobTrackingSubscription
{
    public Guid JobTrackSubId { get; set; }

    public Guid JobTrackSubJobId { get; set; }

    public Guid? JobTrackSubJobRouteId { get; set; }

    public Guid? JobTrackSubJobCargoId { get; set; }

    public Guid? JobTrackSubJobContainerId { get; set; }

    public Guid? JobTrackSubConnectionId { get; set; }

    public string JobTrackSubSourceType { get; set; } = null!;

    public string JobTrackSubStatus { get; set; } = null!;

    public string JobTrackSubReferenceType { get; set; } = null!;

    public string JobTrackSubReferenceValue { get; set; } = null!;

    public string? JobTrackSubProviderReference { get; set; }

    public int? JobTrackSubPollFrequencyMinutes { get; set; }

    public DateTime? JobTrackSubLastPolledAt { get; set; }

    public DateTime? JobTrackSubNextPollAt { get; set; }

    public DateTime? JobTrackSubLastEventAt { get; set; }

    public DateTime? JobTrackSubLastErrorAt { get; set; }

    public string? JobTrackSubLastErrorCode { get; set; }

    public string? JobTrackSubLastErrorMessage { get; set; }

    public string JobTrackSubSettingsJson { get; set; } = null!;

    public DateTime JobTrackSubCreatedAt { get; set; }

    public Guid? JobTrackSubCreatedBy { get; set; }

    public DateTime JobTrackSubUpdatedAt { get; set; }

    public Guid? JobTrackSubUpdatedBy { get; set; }

    public virtual JobTrackingApiConnection? JobTrackSubConnection { get; set; }

    public virtual JobHeader JobTrackSubJob { get; set; } = null!;

    public virtual JobCargo? JobTrackSubJobCargo { get; set; }

    public virtual JobContainer? JobTrackSubJobContainer { get; set; }

    public virtual JobRouting? JobTrackSubJobRoute { get; set; }

    public virtual SysJobTrackingSourceType JobTrackSubSourceTypeNavigation { get; set; } = null!;

    public virtual SysJobTrackingSubscriptionStatus JobTrackSubStatusNavigation { get; set; } = null!;

    public virtual ICollection<JobTrackingEvent> JobTrackingEvents { get; set; } = new List<JobTrackingEvent>();
}
