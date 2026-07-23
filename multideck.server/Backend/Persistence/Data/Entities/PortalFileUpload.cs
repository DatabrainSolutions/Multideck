using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalFileUpload
{
    public Guid PortalUploadId { get; set; }

    public Guid? PortalUploadSiteId { get; set; }

    public Guid? PortalUploadPortalUserId { get; set; }

    public Guid? PortalUploadOrgId { get; set; }

    public Guid? PortalUploadJobId { get; set; }

    public Guid? PortalUploadWorkflowTaskId { get; set; }

    public string PortalUploadStatusCode { get; set; } = null!;

    public string PortalUploadResourceTypeCode { get; set; } = null!;

    public string? PortalUploadTargetTable { get; set; }

    public Guid? PortalUploadTargetId { get; set; }

    public string PortalUploadRequestedTitle { get; set; } = null!;

    public string? PortalUploadRequestedDescription { get; set; }

    public string? PortalUploadFileName { get; set; }

    public string? PortalUploadMimeType { get; set; }

    public long? PortalUploadFileSizeBytes { get; set; }

    public string? PortalUploadStorageBucket { get; set; }

    public string? PortalUploadStoragePath { get; set; }

    public string? PortalUploadFileHashSha256 { get; set; }

    public string? PortalUploadVirusScanStatus { get; set; }

    public string PortalUploadExtractedDataJson { get; set; } = null!;

    public string? PortalUploadAisummary { get; set; }

    public Guid? PortalUploadLinkedJobDocumentId { get; set; }

    public DateTime PortalUploadRequestedAt { get; set; }

    public Guid? PortalUploadRequestedBy { get; set; }

    public DateTime? PortalUploadUploadedAt { get; set; }

    public DateTime? PortalUploadReviewedAt { get; set; }

    public Guid? PortalUploadReviewedBy { get; set; }

    public string? PortalUploadReviewNotes { get; set; }

    public virtual ICollection<PortalActionResponse> PortalActionResponses { get; set; } = new List<PortalActionResponse>();

    public virtual JobHeader? PortalUploadJob { get; set; }

    public virtual JobDocument? PortalUploadLinkedJobDocument { get; set; }

    public virtual OrgMaster? PortalUploadOrg { get; set; }

    public virtual PortalUser? PortalUploadPortalUser { get; set; }

    public virtual CmpUser? PortalUploadRequestedByNavigation { get; set; }

    public virtual SysPortalResourceType PortalUploadResourceTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? PortalUploadReviewedByNavigation { get; set; }

    public virtual PortalSite? PortalUploadSite { get; set; }

    public virtual SysPortalUploadStatus PortalUploadStatusCodeNavigation { get; set; } = null!;

    public virtual WorkflowTask? PortalUploadWorkflowTask { get; set; }
}
