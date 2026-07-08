using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinAuthorisationDecision
{
    public Guid FinauthdecId { get; set; }

    public Guid FinauthdecRequestId { get; set; }

    public string FinauthdecDecisionCode { get; set; } = null!;

    public Guid? FinauthdecDecidedBy { get; set; }

    public DateTime FinauthdecDecidedAt { get; set; }

    public string? FinauthdecComments { get; set; }

    public Guid? FinauthdecDelegatedToUserId { get; set; }

    public string FinauthdecMetadataJson { get; set; } = null!;

    public virtual CmpUser? FinauthdecDecidedByNavigation { get; set; }

    public virtual CmpUser? FinauthdecDelegatedToUser { get; set; }

    public virtual FinAuthorisationRequest FinauthdecRequest { get; set; } = null!;
}
