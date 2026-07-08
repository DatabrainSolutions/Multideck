using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobTrackingCurrentStatus
{
    public Guid? JobId { get; set; }

    public int? JobNumber { get; set; }

    public string? JobPeriod { get; set; }

    public string? JobStatus { get; set; }

    public string? JobTrackingStatus { get; set; }

    public string? JobCurrentLocationUnlocode { get; set; }

    public string? JobCurrentLocationNameSnapshot { get; set; }

    public DateTime? JobLastTrackedAt { get; set; }

    public DateTime? JobPredictedDeliveryAt { get; set; }

    public decimal? JobTrackingRiskScore { get; set; }

    public Guid? LatestTrackingEventId { get; set; }

    public string? LatestTrackingEventType { get; set; }

    public string? LatestTrackingSummary { get; set; }

    public DateTime? LatestTrackingEventTime { get; set; }

    public string? LatestTrackingSourceType { get; set; }

    public string? LatestTrackingSourceName { get; set; }

    public int? OpenExceptionCount { get; set; }

    public string? HighestOpenExceptionSeverity { get; set; }
}
