using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmClaimApproval
{
    public Guid ClmapprovalId { get; set; }

    public Guid ClmapprovalClaimId { get; set; }

    public string ClmapprovalTypeCode { get; set; } = null!;

    public string ClmapprovalStatusCode { get; set; } = null!;

    public decimal ClmapprovalAmount { get; set; }

    public string ClmapprovalCurrencyCodeSnapshot { get; set; } = null!;

    public string? ClmapprovalReason { get; set; }

    public Guid? ClmapprovalRequestedBy { get; set; }

    public DateTime ClmapprovalRequestedAt { get; set; }

    public Guid? ClmapprovalApproverUserId { get; set; }

    public DateTime? ClmapprovalDecidedAt { get; set; }

    public string? ClmapprovalDecisionNotes { get; set; }

    public Guid? ClmapprovalWorkflowTaskId { get; set; }

    public string ClmapprovalMetadataJson { get; set; } = null!;

    public virtual CmpUser? ClmapprovalApproverUser { get; set; }

    public virtual ClmClaim ClmapprovalClaim { get; set; } = null!;

    public virtual CmpUser? ClmapprovalRequestedByNavigation { get; set; }

    public virtual SysClmapprovalStatus ClmapprovalStatusCodeNavigation { get; set; } = null!;

    public virtual SysClmapprovalType ClmapprovalTypeCodeNavigation { get; set; } = null!;

    public virtual WorkflowTask? ClmapprovalWorkflowTask { get; set; }
}
