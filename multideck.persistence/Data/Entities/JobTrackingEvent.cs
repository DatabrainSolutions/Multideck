using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobTrackingEvent
{
    public Guid JobTrackEventId { get; set; }

    public Guid JobTrackEventJobId { get; set; }

    public Guid? JobTrackEventJobRouteId { get; set; }

    public Guid? JobTrackEventJobCargoId { get; set; }

    public Guid? JobTrackEventJobContainerId { get; set; }

    public Guid? JobTrackEventSubscriptionId { get; set; }

    public string JobTrackEventSourceType { get; set; } = null!;

    public string? JobTrackEventSourceName { get; set; }

    public string? JobTrackEventSourceEventId { get; set; }

    public string? JobTrackEventSourceEventCode { get; set; }

    public string? JobTrackEventNormalizedEventType { get; set; }

    public string? JobTrackEventEventStatus { get; set; }

    public string? JobTrackEventEventSummary { get; set; }

    public DateTime JobTrackEventEventTime { get; set; }

    public DateTime? JobTrackEventReportedAt { get; set; }

    public DateTime JobTrackEventReceivedAt { get; set; }

    public string? JobTrackEventLocationUnlocode { get; set; }

    public string? JobTrackEventLocationIatacode { get; set; }

    public string? JobTrackEventLocationNameSnapshot { get; set; }

    public string? JobTrackEventCountryCodeSnapshot { get; set; }

    public decimal? JobTrackEventLatitude { get; set; }

    public decimal? JobTrackEventLongitude { get; set; }

    public decimal? JobTrackEventConfidenceScore { get; set; }

    public bool JobTrackEventIsException { get; set; }

    public bool JobTrackEventIsCustomerVisible { get; set; }

    public string? JobTrackEventDedupeHash { get; set; }

    public string JobTrackEventRawPayloadJson { get; set; } = null!;

    public string JobTrackEventNormalizedPayloadJson { get; set; } = null!;

    public DateTime JobTrackEventCreatedAt { get; set; }

    public virtual ICollection<ClmIncident> ClmIncidents { get; set; } = new List<ClmIncident>();

    public virtual ICollection<JobKpiresult> JobKpiresults { get; set; } = new List<JobKpiresult>();

    public virtual ICollection<JobRouteMilestone> JobRouteMilestones { get; set; } = new List<JobRouteMilestone>();

    public virtual JobHeader JobTrackEventJob { get; set; } = null!;

    public virtual JobCargo? JobTrackEventJobCargo { get; set; }

    public virtual JobContainer? JobTrackEventJobContainer { get; set; }

    public virtual JobRouting? JobTrackEventJobRoute { get; set; }

    public virtual SysJobTrackingEventType? JobTrackEventNormalizedEventTypeNavigation { get; set; }

    public virtual SysJobTrackingSourceType JobTrackEventSourceTypeNavigation { get; set; } = null!;

    public virtual JobTrackingSubscription? JobTrackEventSubscription { get; set; }

    public virtual ICollection<JobTrackingEventLink> JobTrackingEventLinks { get; set; } = new List<JobTrackingEventLink>();

    public virtual ICollection<JobTrackingException> JobTrackingExceptions { get; set; } = new List<JobTrackingException>();
}
