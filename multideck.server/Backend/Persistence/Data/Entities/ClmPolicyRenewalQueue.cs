using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmPolicyRenewalQueue
{
    public Guid? ClmrenewalId { get; set; }

    public Guid? ClmrenewalPolicyId { get; set; }

    public string? ClmpolicyNumber { get; set; }

    public string? ClmpolicyName { get; set; }

    public string? ClmpolicyTypeCode { get; set; }

    public string? ClmpolicyStatusCode { get; set; }

    public string? ClmrenewalStatusCode { get; set; }

    public string? ClmrenewalStatusName { get; set; }

    public DateOnly? ClmrenewalDueDate { get; set; }

    public DateOnly? ClmrenewalCurrentExpiryDate { get; set; }

    public DateOnly? ClmrenewalProposedInceptionDate { get; set; }

    public DateOnly? ClmrenewalProposedExpiryDate { get; set; }

    public decimal? ClmrenewalQuotedPremiumAmount { get; set; }

    public string? ClmrenewalCurrencyCodeSnapshot { get; set; }

    public Guid? ClmrenewalAssignedUserId { get; set; }

    public Guid? ClmrenewalWorkflowTaskId { get; set; }
}
