using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceCountryControlRule
{
    public Guid TcecountryRuleId { get; set; }

    public string TcecountryRuleCode { get; set; } = null!;

    public string TcecountryRuleName { get; set; } = null!;

    public string TcecountryRuleControlTypeCode { get; set; } = null!;

    public string TcecountryRuleRiskLevelCode { get; set; } = null!;

    public string TcecountryRuleCountryCode { get; set; } = null!;

    public string? TcecountryRuleDirectionCode { get; set; }

    public string? TcecountryRuleModeCode { get; set; }

    public string? TcecountryRuleOriginCountryCode { get; set; }

    public string? TcecountryRuleDestinationCountryCode { get; set; }

    public string? TcecountryRuleTransitCountryCode { get; set; }

    public string TcecountryRuleActionTypeCode { get; set; } = null!;

    public string? TcecountryRuleRegimeName { get; set; }

    public DateOnly TcecountryRuleEffectiveFrom { get; set; }

    public DateOnly? TcecountryRuleEffectiveTo { get; set; }

    public string? TcecountryRuleNotes { get; set; }

    public bool TcecountryRuleIsActive { get; set; }

    public DateTime TcecountryRuleCreatedAt { get; set; }

    public Guid? TcecountryRuleCreatedBy { get; set; }

    public virtual SysTceactionType TcecountryRuleActionTypeCodeNavigation { get; set; } = null!;

    public virtual SysTcecontrolType TcecountryRuleControlTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? TcecountryRuleCreatedByNavigation { get; set; }

    public virtual SysTceriskLevel TcecountryRuleRiskLevelCodeNavigation { get; set; } = null!;
}
