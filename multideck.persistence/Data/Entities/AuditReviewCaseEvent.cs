using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AuditReviewCaseEvent
{
    public Guid AuditReviewEventId { get; set; }

    public Guid AuditReviewEventReviewId { get; set; }

    public Guid? AuditReviewEventAuditEventId { get; set; }

    public string AuditReviewEventAction { get; set; } = null!;

    public string? AuditReviewEventNotes { get; set; }

    public DateTime AuditReviewEventCreatedAt { get; set; }

    public Guid? AuditReviewEventCreatedBy { get; set; }

    public virtual AuditEvent? AuditReviewEventAuditEvent { get; set; }

    public virtual CmpUser? AuditReviewEventCreatedByNavigation { get; set; }

    public virtual AuditReviewCase AuditReviewEventReview { get; set; } = null!;
}
