using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinAccountingDateOverride
{
    public Guid FinacctDateOvId { get; set; }

    public Guid FinacctDateOvEvaluationId { get; set; }

    public DateOnly FinacctDateOvOldAccountingDate { get; set; }

    public DateOnly FinacctDateOvNewAccountingDate { get; set; }

    public string FinacctDateOvReason { get; set; } = null!;

    public Guid? FinacctDateOvAuthorisationRequestId { get; set; }

    public DateTime? FinacctDateOvApprovedAt { get; set; }

    public Guid? FinacctDateOvApprovedBy { get; set; }

    public DateTime FinacctDateOvCreatedAt { get; set; }

    public Guid? FinacctDateOvCreatedBy { get; set; }

    public virtual CmpUser? FinacctDateOvApprovedByNavigation { get; set; }

    public virtual FinAuthorisationRequest? FinacctDateOvAuthorisationRequest { get; set; }

    public virtual CmpUser? FinacctDateOvCreatedByNavigation { get; set; }

    public virtual FinAccountingDateEvaluation FinacctDateOvEvaluation { get; set; } = null!;
}
