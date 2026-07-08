using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmPolicyRenewal
{
    public Guid ClmrenewalId { get; set; }

    public Guid ClmrenewalPolicyId { get; set; }

    public string ClmrenewalStatusCode { get; set; } = null!;

    public DateOnly ClmrenewalDueDate { get; set; }

    public DateOnly ClmrenewalCurrentExpiryDate { get; set; }

    public DateOnly? ClmrenewalProposedInceptionDate { get; set; }

    public DateOnly? ClmrenewalProposedExpiryDate { get; set; }

    public decimal? ClmrenewalQuotedPremiumAmount { get; set; }

    public string ClmrenewalCurrencyCodeSnapshot { get; set; } = null!;

    public Guid? ClmrenewalAssignedUserId { get; set; }

    public Guid? ClmrenewalWorkflowTaskId { get; set; }

    public string? ClmrenewalNotes { get; set; }

    public DateTime ClmrenewalCreatedAt { get; set; }

    public Guid? ClmrenewalCreatedBy { get; set; }

    public virtual CmpUser? ClmrenewalAssignedUser { get; set; }

    public virtual CmpUser? ClmrenewalCreatedByNavigation { get; set; }

    public virtual ClmInsurancePolicy ClmrenewalPolicy { get; set; } = null!;

    public virtual SysClmapprovalStatus ClmrenewalStatusCodeNavigation { get; set; } = null!;

    public virtual WorkflowTask? ClmrenewalWorkflowTask { get; set; }
}
