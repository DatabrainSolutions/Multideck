using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalActionResponse
{
    public Guid PortalResponseId { get; set; }

    public Guid PortalResponseActionId { get; set; }

    public Guid? PortalResponsePortalUserId { get; set; }

    public string PortalResponseResponseStatusCode { get; set; } = null!;

    public string PortalResponseResponsePayloadJson { get; set; } = null!;

    public string? PortalResponseComment { get; set; }

    public Guid? PortalResponseFileUploadId { get; set; }

    public DateTime PortalResponseRespondedAt { get; set; }

    public DateTime? PortalResponseInternalReviewedAt { get; set; }

    public Guid? PortalResponseInternalReviewedBy { get; set; }

    public string? PortalResponseInternalReviewNotes { get; set; }

    public DateTime? PortalResponseAppliedAt { get; set; }

    public Guid? PortalResponseAppliedBy { get; set; }

    public virtual PortalActionRequest PortalResponseAction { get; set; } = null!;

    public virtual CmpUser? PortalResponseAppliedByNavigation { get; set; }

    public virtual PortalFileUpload? PortalResponseFileUpload { get; set; }

    public virtual CmpUser? PortalResponseInternalReviewedByNavigation { get; set; }

    public virtual PortalUser? PortalResponsePortalUser { get; set; }

    public virtual SysPortalActionStatus PortalResponseResponseStatusCodeNavigation { get; set; } = null!;
}
