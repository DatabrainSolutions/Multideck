using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTcescreeningRunType
{
    public string TcerunTypeCode { get; set; } = null!;

    public string TcerunTypeName { get; set; } = null!;

    public string? TcerunTypeDescription { get; set; }

    public bool TcerunTypeIsActive { get; set; }

    public int TcerunTypeSortOrder { get; set; }

    public virtual ICollection<TceScreeningPolicy> TceScreeningPolicies { get; set; } = new List<TceScreeningPolicy>();

    public virtual ICollection<TceScreeningRun> TceScreeningRuns { get; set; } = new List<TceScreeningRun>();

    public virtual ICollection<TceScreeningTouchpointRule> TceScreeningTouchpointRules { get; set; } = new List<TceScreeningTouchpointRule>();
}
