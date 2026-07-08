using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalDocumentShare
{
    public Guid PortalDocShareId { get; set; }

    public Guid? PortalDocShareRecordShareId { get; set; }

    public Guid? PortalDocShareSiteId { get; set; }

    public Guid? PortalDocShareJobDocumentId { get; set; }

    public Guid? PortalDocShareGeneratedDocumentId { get; set; }

    public Guid? PortalDocShareVerificationTokenId { get; set; }

    public string PortalDocShareTitle { get; set; } = null!;

    public string PortalDocShareStatusCode { get; set; } = null!;

    public bool PortalDocShareCanDownload { get; set; }

    public bool PortalDocShareCanViewOnly { get; set; }

    public bool PortalDocShareWatermarkRequired { get; set; }

    public int? PortalDocShareMaxDownloadCount { get; set; }

    public int PortalDocShareDownloadCount { get; set; }

    public DateTime? PortalDocShareLastDownloadedAt { get; set; }

    public DateTime PortalDocShareValidFrom { get; set; }

    public DateTime? PortalDocShareValidUntil { get; set; }

    public string PortalDocShareFieldPolicyJson { get; set; } = null!;

    public DateTime PortalDocShareCreatedAt { get; set; }

    public Guid? PortalDocShareCreatedBy { get; set; }

    public virtual CmpUser? PortalDocShareCreatedByNavigation { get; set; }

    public virtual DocbGeneratedDocument? PortalDocShareGeneratedDocument { get; set; }

    public virtual JobDocument? PortalDocShareJobDocument { get; set; }

    public virtual PortalRecordShare? PortalDocShareRecordShare { get; set; }

    public virtual PortalSite? PortalDocShareSite { get; set; }

    public virtual SysPortalAccessStatus PortalDocShareStatusCodeNavigation { get; set; } = null!;

    public virtual DocsecVerificationToken? PortalDocShareVerificationToken { get; set; }
}
