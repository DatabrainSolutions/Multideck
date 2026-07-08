using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCommissionAdjustment
{
    public Guid FincommAdjId { get; set; }

    public Guid FincommAdjItemId { get; set; }

    public decimal FincommAdjAdjustmentAmount { get; set; }

    public string FincommAdjReason { get; set; } = null!;

    public Guid? FincommAdjAuthorisationRequestId { get; set; }

    public DateTime FincommAdjCreatedAt { get; set; }

    public Guid? FincommAdjCreatedBy { get; set; }

    public virtual FinAuthorisationRequest? FincommAdjAuthorisationRequest { get; set; }

    public virtual CmpUser? FincommAdjCreatedByNavigation { get; set; }

    public virtual FinCommissionItem FincommAdjItem { get; set; } = null!;
}
