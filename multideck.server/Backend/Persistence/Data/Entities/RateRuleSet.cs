using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateRuleSet
{
    public Guid RateruleSetId { get; set; }

    public string RateruleSetCode { get; set; } = null!;

    public string RateruleSetName { get; set; } = null!;

    public string? RateruleSetDescription { get; set; }

    public string? RateruleSetModeCode { get; set; }

    public string? RateruleSetShipmentTypeCode { get; set; }

    public string RateruleSetStatusCode { get; set; } = null!;

    public bool RateruleSetIsSystem { get; set; }

    public DateTime RateruleSetCreatedAt { get; set; }

    public Guid? RateruleSetCreatedBy { get; set; }

    public virtual ICollection<RateCalculationRule> RateCalculationRules { get; set; } = new List<RateCalculationRule>();

    public virtual CmpUser? RateruleSetCreatedByNavigation { get; set; }

    public virtual SysJobTransportMode? RateruleSetModeCodeNavigation { get; set; }

    public virtual SysCusQuoteShipmentMode? RateruleSetShipmentTypeCodeNavigation { get; set; }

    public virtual SysRateStatus RateruleSetStatusCodeNavigation { get; set; } = null!;
}
