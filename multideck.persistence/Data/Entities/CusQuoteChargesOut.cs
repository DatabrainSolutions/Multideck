using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CusQuoteChargesOut
{
    public Guid CusQuoteChargesOutId { get; set; }

    public Guid CusQuoteRevenueOptId { get; set; }

    public int? CusQuoteChargesOutCostId { get; set; }

    public Guid? CusQuoteChargesOutTo { get; set; }

    public Guid? CusQuoteChargesOutChargeCode { get; set; }

    public string? CusQuoteChargesOutDescription { get; set; }

    public string? CusQuoteChargesOutIntNotes { get; set; }

    public int? CusQuoteChargesOutToCurr { get; set; }

    public decimal? CusQuoteChargesOutToRoe { get; set; }

    public decimal? CusQuoteChargesOutRevenueCurr { get; set; }

    public decimal? CusQuoteChargesOutRevenueLocal { get; set; }

    public int? CusQuoteChargesOutLineNo { get; set; }

    public bool CusQuoteChargesOutShowToCustomer { get; set; }

    public Guid? CusQuoteChargesOutSourceRateResultLineId { get; set; }

    public Guid? CusQuoteChargesOutSourceRateLineId { get; set; }

    public Guid? CusQuoteChargesOutSourceMarginRuleId { get; set; }

    public virtual RateMarginRule? CusQuoteChargesOutSourceMarginRule { get; set; }

    public virtual RateRateLine? CusQuoteChargesOutSourceRateLine { get; set; }

    public virtual RateRateResultLine? CusQuoteChargesOutSourceRateResultLine { get; set; }

    public virtual CusQuoteRevenueOption CusQuoteRevenueOpt { get; set; } = null!;

    public virtual ICollection<JobCostingChargesOut> JobCostingChargesOuts { get; set; } = new List<JobCostingChargesOut>();

    public virtual ICollection<RateQuoteLink> RateQuoteLinks { get; set; } = new List<RateQuoteLink>();
}
