using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTcecheckType
{
    public string TcecheckTypeCode { get; set; } = null!;

    public string TcecheckTypeName { get; set; } = null!;

    public string? TcecheckTypeDescription { get; set; }

    public string? TcecheckTypeDefaultActionTypeCode { get; set; }

    public bool TcecheckTypeIsBlockingCandidate { get; set; }

    public bool TcecheckTypeIsActive { get; set; }

    public int TcecheckTypeSortOrder { get; set; }

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceScreeningTouchpointRule> TceScreeningTouchpointRules { get; set; } = new List<TceScreeningTouchpointRule>();

    public virtual SysTceactionType? TcecheckTypeDefaultActionTypeCodeNavigation { get; set; }
}
