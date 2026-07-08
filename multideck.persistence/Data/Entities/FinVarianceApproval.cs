using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinVarianceApproval
{
    public Guid FinvarApprId { get; set; }

    public Guid FinvarApprCaseId { get; set; }

    public Guid? FinvarApprAuthorisationRequestId { get; set; }

    public string FinvarApprDecisionCode { get; set; } = null!;

    public DateTime FinvarApprDecidedAt { get; set; }

    public Guid? FinvarApprDecidedBy { get; set; }

    public string? FinvarApprComments { get; set; }

    public virtual FinAuthorisationRequest? FinvarApprAuthorisationRequest { get; set; }

    public virtual FinVarianceCase FinvarApprCase { get; set; } = null!;

    public virtual CmpUser? FinvarApprDecidedByNavigation { get; set; }
}
