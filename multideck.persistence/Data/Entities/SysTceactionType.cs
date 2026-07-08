using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTceactionType
{
    public string TceactionTypeCode { get; set; } = null!;

    public string TceactionTypeName { get; set; } = null!;

    public string? TceactionTypeDescription { get; set; }

    public bool TceactionTypeIsBlockingCandidate { get; set; }

    public bool TceactionTypeIsActive { get; set; }

    public int TceactionTypeSortOrder { get; set; }

    public virtual ICollection<SysTcecheckType> SysTcecheckTypes { get; set; } = new List<SysTcecheckType>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceComplianceHold> TceComplianceHolds { get; set; } = new List<TceComplianceHold>();

    public virtual ICollection<TceCountryControlRule> TceCountryControlRules { get; set; } = new List<TceCountryControlRule>();

    public virtual ICollection<TceProductControlRule> TceProductControlRules { get; set; } = new List<TceProductControlRule>();

    public virtual ICollection<TceScreeningTouchpointRule> TceScreeningTouchpointRules { get; set; } = new List<TceScreeningTouchpointRule>();
}
