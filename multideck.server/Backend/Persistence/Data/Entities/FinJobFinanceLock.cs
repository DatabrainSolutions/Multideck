using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinJobFinanceLock
{
    public Guid FinjobLockId { get; set; }

    public Guid FinjobLockJobId { get; set; }

    public Guid? FinjobLockChargeInId { get; set; }

    public Guid? FinjobLockChargeOutId { get; set; }

    public string FinjobLockLockTypeCode { get; set; } = null!;

    public string? FinjobLockReason { get; set; }

    public DateTime FinjobLockLockedAt { get; set; }

    public Guid? FinjobLockLockedBy { get; set; }

    public DateTime? FinjobLockReleasedAt { get; set; }

    public Guid? FinjobLockReleasedBy { get; set; }

    public bool FinjobLockIsActive { get; set; }

    public virtual JobCostingChargesIn? FinjobLockChargeIn { get; set; }

    public virtual JobCostingChargesOut? FinjobLockChargeOut { get; set; }

    public virtual JobHeader FinjobLockJob { get; set; } = null!;

    public virtual CmpUser? FinjobLockLockedByNavigation { get; set; }

    public virtual CmpUser? FinjobLockReleasedByNavigation { get; set; }
}
