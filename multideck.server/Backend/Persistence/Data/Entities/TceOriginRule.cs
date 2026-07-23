using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceOriginRule
{
    public Guid TceoriginRuleId { get; set; }

    public Guid? TceoriginRuleFtaid { get; set; }

    public string TceoriginRuleCode { get; set; } = null!;

    public string? TceoriginRuleHsprefix { get; set; }

    public string? TceoriginRuleOriginCountryCode { get; set; }

    public string? TceoriginRuleDestinationCountryCode { get; set; }

    public string TceoriginRuleRuleText { get; set; } = null!;

    public decimal? TceoriginRuleRvcpercent { get; set; }

    public bool TceoriginRuleCtcrequired { get; set; }

    public decimal? TceoriginRuleDeMinimisPercent { get; set; }

    public DateOnly? TceoriginRuleEffectiveFrom { get; set; }

    public DateOnly? TceoriginRuleEffectiveTo { get; set; }

    public bool TceoriginRuleIsActive { get; set; }

    public string TceoriginRuleMetadataJson { get; set; } = null!;

    public virtual ICollection<TcePreferenceClaim> TcePreferenceClaims { get; set; } = new List<TcePreferenceClaim>();

    public virtual TceFtaagreement? TceoriginRuleFta { get; set; }
}
