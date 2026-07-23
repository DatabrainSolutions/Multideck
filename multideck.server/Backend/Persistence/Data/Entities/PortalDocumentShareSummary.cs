using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalDocumentShareSummary
{
    public Guid? PortalDocShareId { get; set; }

    public Guid? PortalDocShareRecordShareId { get; set; }

    public Guid? PortalDocShareSiteId { get; set; }

    public string? PortalSiteName { get; set; }

    public Guid? PortalDocShareJobDocumentId { get; set; }

    public Guid? JobDocJobId { get; set; }

    public string? JobDocumentTitle { get; set; }

    public string? JobDocStatus { get; set; }

    public Guid? PortalDocShareGeneratedDocumentId { get; set; }

    public Guid? PortalDocShareVerificationTokenId { get; set; }

    public string? VerificationPublicCode { get; set; }

    public string? PortalDocShareTitle { get; set; }

    public string? PortalDocShareStatusCode { get; set; }

    public bool? PortalDocShareCanDownload { get; set; }

    public bool? PortalDocShareCanViewOnly { get; set; }

    public bool? PortalDocShareWatermarkRequired { get; set; }

    public int? PortalDocShareDownloadCount { get; set; }

    public DateTime? PortalDocShareLastDownloadedAt { get; set; }

    public DateTime? PortalDocShareValidUntil { get; set; }
}
