using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateRateResultLine
{
    public Guid RateresultLineId { get; set; }

    public Guid RateresultLineResultId { get; set; }

    public int RateresultLineLineNo { get; set; }

    public string RateresultLineApplicabilityCode { get; set; } = null!;

    public Guid? RateresultLineRateLineId { get; set; }

    public Guid? RateresultLineSurchargeId { get; set; }

    public Guid? RateresultLineSpotLineId { get; set; }

    public Guid RateresultLineChargeId { get; set; }

    public string RateresultLineChargeCodeSnapshot { get; set; } = null!;

    public string? RateresultLineDescription { get; set; }

    public string RateresultLineBasisCode { get; set; } = null!;

    public decimal RateresultLineQuantity { get; set; }

    public decimal? RateresultLineUnitRate { get; set; }

    public Guid? RateresultLineCurrencyId { get; set; }

    public string? RateresultLineCurrencyCodeSnapshot { get; set; }

    public decimal RateresultLineNetAmount { get; set; }

    public decimal RateresultLineTaxAmount { get; set; }

    public decimal RateresultLineTotalAmount { get; set; }

    public decimal? RateresultLineRoe { get; set; }

    public decimal? RateresultLineLocalAmount { get; set; }

    public bool RateresultLineIsMinimumApplied { get; set; }

    public bool RateresultLineIsManualOverride { get; set; }

    public string RateresultLineCalculationJson { get; set; } = null!;

    public virtual ICollection<CusQuoteChargesIn> CusQuoteChargesIns { get; set; } = new List<CusQuoteChargesIn>();

    public virtual ICollection<CusQuoteChargesOut> CusQuoteChargesOuts { get; set; } = new List<CusQuoteChargesOut>();

    public virtual ICollection<JobCostingChargesIn> JobCostingChargesIns { get; set; } = new List<JobCostingChargesIn>();

    public virtual ICollection<JobCostingChargesOut> JobCostingChargesOuts { get; set; } = new List<JobCostingChargesOut>();

    public virtual ICollection<RateJobCostingLink> RateJobCostingLinks { get; set; } = new List<RateJobCostingLink>();

    public virtual ICollection<RateQuoteLink> RateQuoteLinks { get; set; } = new List<RateQuoteLink>();

    public virtual ICollection<RateResultAdjustment> RateResultAdjustments { get; set; } = new List<RateResultAdjustment>();

    public virtual SysRateApplicabilityType RateresultLineApplicabilityCodeNavigation { get; set; } = null!;

    public virtual SysRateBasisType RateresultLineBasisCodeNavigation { get; set; } = null!;

    public virtual RateChargeCode RateresultLineCharge { get; set; } = null!;

    public virtual SysCurrency? RateresultLineCurrency { get; set; }

    public virtual RateRateLine? RateresultLineRateLine { get; set; }

    public virtual RateRateResult RateresultLineResult { get; set; } = null!;

    public virtual RateSpotQuoteLine? RateresultLineSpotLine { get; set; }

    public virtual RateSurcharge? RateresultLineSurcharge { get; set; }
}
