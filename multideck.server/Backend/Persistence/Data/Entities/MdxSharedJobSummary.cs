using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MdxSharedJobSummary
{
    public Guid? MdxsharedJobId { get; set; }

    public Guid? MdxsharedJobAgreementId { get; set; }

    public string? MdxagreementCode { get; set; }

    public string? MdxagreementName { get; set; }

    public Guid? MdxsharedJobPeerId { get; set; }

    public string? MdxsharedJobPeerName { get; set; }

    public Guid? MdxsharedJobLocalJobId { get; set; }

    public string? MdxsharedJobLocalJobNumberSnapshot { get; set; }

    public string? MdxsharedJobRemoteJobId { get; set; }

    public string? MdxsharedJobRemoteJobNumber { get; set; }

    public string? MdxsharedJobStatusCode { get; set; }

    public string? MdxsharedJobDirectionCode { get; set; }

    public string? MdxsharedJobLocalRoleCode { get; set; }

    public string? MdxsharedJobRemoteRoleCode { get; set; }

    public string? MdxsharedJobPrimaryReference { get; set; }

    public string? MdxsharedJobTransportModeCode { get; set; }

    public string? MdxsharedJobOriginUnlocode { get; set; }

    public string? MdxsharedJobOriginNameSnapshot { get; set; }

    public string? MdxsharedJobDestinationUnlocode { get; set; }

    public string? MdxsharedJobDestinationNameSnapshot { get; set; }

    public string? MdxsharedJobCurrentLocationUnlocode { get; set; }

    public string? MdxsharedJobCurrentLocationNameSnapshot { get; set; }

    public DateTime? MdxsharedJobPredictedDeliveryAt { get; set; }

    public string? MdxsharedJobTrackingStatus { get; set; }

    public DateTime? MdxsharedJobLastOutboundSyncAt { get; set; }

    public DateTime? MdxsharedJobLastInboundSyncAt { get; set; }

    public int? MdxsharedJobRouteLegCount { get; set; }

    public int? MdxsharedJobMilestoneCount { get; set; }

    public int? MdxsharedJobPendingReviewCount { get; set; }

    public int? MdxsharedJobOpenConflictCount { get; set; }
}
