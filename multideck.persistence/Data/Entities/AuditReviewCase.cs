using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AuditReviewCase
{
    public Guid AuditReviewId { get; set; }

    public string? AuditReviewCaseNumber { get; set; }

    public string AuditReviewTitle { get; set; } = null!;

    public string AuditReviewStatusCode { get; set; } = null!;

    public string AuditReviewPriorityCode { get; set; } = null!;

    public DateTime AuditReviewOpenedAt { get; set; }

    public Guid? AuditReviewOpenedBy { get; set; }

    public Guid? AuditReviewAssignedToUserId { get; set; }

    public DateTime? AuditReviewClosedAt { get; set; }

    public Guid? AuditReviewClosedBy { get; set; }

    public string? AuditReviewDescription { get; set; }

    public string? AuditReviewFindings { get; set; }

    public string AuditReviewMetadataJson { get; set; } = null!;

    public virtual CmpUser? AuditReviewAssignedToUser { get; set; }

    public virtual ICollection<AuditReviewCaseEvent> AuditReviewCaseEvents { get; set; } = new List<AuditReviewCaseEvent>();

    public virtual CmpUser? AuditReviewClosedByNavigation { get; set; }

    public virtual CmpUser? AuditReviewOpenedByNavigation { get; set; }
}
