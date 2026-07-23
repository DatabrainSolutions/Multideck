using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobShipmentSummary
{
    public Guid? JobId { get; set; }

    public int? JobNumber { get; set; }

    public string? JobPeriod { get; set; }

    public string? JobStatus { get; set; }

    public string? JobDirection { get; set; }

    public string? JobTransportModeSummary { get; set; }

    public Guid? JobCustomer { get; set; }

    public Guid? JobOrgOfficeId { get; set; }

    public string? JobOriginUnlocode { get; set; }

    public string? JobOriginNameSnapshot { get; set; }

    public string? JobDestinationUnlocode { get; set; }

    public string? JobDestinationNameSnapshot { get; set; }

    public string? JobTrackingStatus { get; set; }

    public string? JobCurrentLocationUnlocode { get; set; }

    public string? JobCurrentLocationNameSnapshot { get; set; }

    public DateTime? JobLastTrackedAt { get; set; }

    public DateTime? JobPredictedDeliveryAt { get; set; }

    public decimal? JobTrackingRiskScore { get; set; }

    public DateTime? JobCreatedDate { get; set; }

    public int? JobLegCount { get; set; }

    public int? JobCargoLineCount { get; set; }

    public int? JobEquipmentCount { get; set; }

    public int? JobDocumentCount { get; set; }

    public int? JobTrackingEventCount { get; set; }

    public int? JobOpenExceptionCount { get; set; }
}
