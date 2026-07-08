using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateChargeCode
{
    public Guid RatechargeId { get; set; }

    public string RatechargeCode { get; set; } = null!;

    public string RatechargeName { get; set; } = null!;

    public string? RatechargeDescription { get; set; }

    public string RatechargeCategoryCode { get; set; } = null!;

    public string? RatechargeDefaultBasisCode { get; set; }

    public string RatechargeDefaultApplicabilityCode { get; set; } = null!;

    public string? RatechargeDefaultTaxCode { get; set; }

    public bool RatechargeIsFreight { get; set; }

    public bool RatechargeIsSurcharge { get; set; }

    public bool RatechargeIsPassThrough { get; set; }

    public bool RatechargeIsActive { get; set; }

    public int RatechargeSortOrder { get; set; }

    public string RatechargeMetadataJson { get; set; } = null!;

    public DateTime RatechargeCreatedAt { get; set; }

    public Guid? RatechargeCreatedBy { get; set; }

    public DateTime RatechargeUpdatedAt { get; set; }

    public Guid? RatechargeUpdatedBy { get; set; }

    public virtual ICollection<FinChargeAccountingRule> FinChargeAccountingRules { get; set; } = new List<FinChargeAccountingRule>();

    public virtual ICollection<FinCommissionRule> FinCommissionRules { get; set; } = new List<FinCommissionRule>();

    public virtual ICollection<FinDocumentLine> FinDocumentLines { get; set; } = new List<FinDocumentLine>();

    public virtual ICollection<FinProfitShareRule> FinProfitShareRules { get; set; } = new List<FinProfitShareRule>();

    public virtual ICollection<FinVarianceTolerance> FinVarianceTolerances { get; set; } = new List<FinVarianceTolerance>();

    public virtual ICollection<RateMarginRule> RateMarginRules { get; set; } = new List<RateMarginRule>();

    public virtual ICollection<RateRateLine> RateRateLines { get; set; } = new List<RateRateLine>();

    public virtual ICollection<RateRateResultLine> RateRateResultLines { get; set; } = new List<RateRateResultLine>();

    public virtual ICollection<RateSpotQuoteLine> RateSpotQuoteLines { get; set; } = new List<RateSpotQuoteLine>();

    public virtual ICollection<RateSurcharge> RateSurcharges { get; set; } = new List<RateSurcharge>();

    public virtual SysRateChargeCategory RatechargeCategoryCodeNavigation { get; set; } = null!;

    public virtual CmpUser? RatechargeCreatedByNavigation { get; set; }

    public virtual SysRateApplicabilityType RatechargeDefaultApplicabilityCodeNavigation { get; set; } = null!;

    public virtual SysRateBasisType? RatechargeDefaultBasisCodeNavigation { get; set; }

    public virtual CmpUser? RatechargeUpdatedByNavigation { get; set; }
}
