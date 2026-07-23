using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceProductControlRule
{
    public Guid TceproductRuleId { get; set; }

    public string TceproductRuleCode { get; set; } = null!;

    public string TceproductRuleName { get; set; } = null!;

    public string TceproductRuleControlTypeCode { get; set; } = null!;

    public string TceproductRuleRiskLevelCode { get; set; } = null!;

    public string? TceproductRuleHsprefix { get; set; }

    public string? TceproductRuleEccncode { get; set; }

    public string? TceproductRuleControlCode { get; set; }

    public string? TceproductRuleOriginCountryCode { get; set; }

    public string? TceproductRuleDestinationCountryCode { get; set; }

    public string TceproductRuleEndUseKeywordsJson { get; set; } = null!;

    public bool TceproductRuleLicenseRequired { get; set; }

    public string TceproductRuleActionTypeCode { get; set; } = null!;

    public string? TceproductRuleAuthorityName { get; set; }

    public DateOnly TceproductRuleEffectiveFrom { get; set; }

    public DateOnly? TceproductRuleEffectiveTo { get; set; }

    public string? TceproductRuleNotes { get; set; }

    public bool TceproductRuleIsActive { get; set; }

    public DateTime TceproductRuleCreatedAt { get; set; }

    public Guid? TceproductRuleCreatedBy { get; set; }

    public virtual SysTceactionType TceproductRuleActionTypeCodeNavigation { get; set; } = null!;

    public virtual SysTcecontrolType TceproductRuleControlTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? TceproductRuleCreatedByNavigation { get; set; }

    public virtual SysTceriskLevel TceproductRuleRiskLevelCodeNavigation { get; set; } = null!;
}
