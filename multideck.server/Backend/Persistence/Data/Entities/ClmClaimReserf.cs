using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmClaimReserf
{
    public Guid ClmreserveId { get; set; }

    public Guid ClmreserveClaimId { get; set; }

    public string ClmreserveTypeCode { get; set; } = null!;

    public decimal ClmreservePreviousAmount { get; set; }

    public decimal ClmreserveNewAmount { get; set; }

    public decimal ClmreserveDeltaAmount { get; set; }

    public string ClmreserveCurrencyCodeSnapshot { get; set; } = null!;

    public string? ClmreserveReason { get; set; }

    public Guid? ClmreserveApprovedBy { get; set; }

    public DateTime? ClmreserveApprovedAt { get; set; }

    public DateTime ClmreserveCreatedAt { get; set; }

    public Guid? ClmreserveCreatedBy { get; set; }

    public virtual CmpUser? ClmreserveApprovedByNavigation { get; set; }

    public virtual ClmClaim ClmreserveClaim { get; set; } = null!;

    public virtual CmpUser? ClmreserveCreatedByNavigation { get; set; }

    public virtual SysClmreserveType ClmreserveTypeCodeNavigation { get; set; } = null!;
}
