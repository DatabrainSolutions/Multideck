using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinJobRoeset
{
    public Guid FinjobRoeId { get; set; }

    public Guid FinjobRoeJobId { get; set; }

    public string? FinjobRoeCode { get; set; }

    public string FinjobRoeSourceTypeCode { get; set; } = null!;

    public string FinjobRoeStatusCode { get; set; } = null!;

    public DateOnly FinjobRoeEffectiveDate { get; set; }

    public string FinjobRoeUsageTypeCode { get; set; } = null!;

    public bool FinjobRoeIsLocked { get; set; }

    public DateTime? FinjobRoeApprovedAt { get; set; }

    public Guid? FinjobRoeApprovedBy { get; set; }

    public DateTime FinjobRoeCreatedAt { get; set; }

    public Guid? FinjobRoeCreatedBy { get; set; }

    public virtual ICollection<FinJobRoeline> FinJobRoelines { get; set; } = new List<FinJobRoeline>();

    public virtual CmpUser? FinjobRoeApprovedByNavigation { get; set; }

    public virtual CmpUser? FinjobRoeCreatedByNavigation { get; set; }

    public virtual JobHeader FinjobRoeJob { get; set; } = null!;

    public virtual SysFinanceRoeusageType FinjobRoeUsageTypeCodeNavigation { get; set; } = null!;
}
