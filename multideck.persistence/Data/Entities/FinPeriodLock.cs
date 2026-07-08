using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinPeriodLock
{
    public Guid FinperiodLockId { get; set; }

    public Guid FinperiodLockPeriodId { get; set; }

    public string FinperiodLockLedgerTypeCode { get; set; } = null!;

    public DateTime FinperiodLockLockedAt { get; set; }

    public Guid? FinperiodLockLockedBy { get; set; }

    public string? FinperiodLockReason { get; set; }

    public bool FinperiodLockIsActive { get; set; }

    public virtual SysFinanceLedgerType FinperiodLockLedgerTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? FinperiodLockLockedByNavigation { get; set; }

    public virtual FinPeriod FinperiodLockPeriod { get; set; } = null!;
}
