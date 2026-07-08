using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CusQuoteRevenueOption
{
    public Guid CusQuoteRevenueOptId { get; set; }

    public Guid CusQuoteRevId { get; set; }

    public int CusQuoteRevenueOptSubId { get; set; }

    public string CusQuoteRevenueOptDescription { get; set; } = null!;

    public string? CusQuoteRevenueOptNotesforCustomer { get; set; }

    public string CusQuoteRevenueOptStatusCode { get; set; } = null!;

    public string? CusQuoteRevenueOptCustomerLabel { get; set; }

    public DateOnly? CusQuoteRevenueOptValidFrom { get; set; }

    public DateOnly? CusQuoteRevenueOptValidTo { get; set; }

    public decimal? CusQuoteRevenueOptTargetMarginAmountLocal { get; set; }

    public decimal? CusQuoteRevenueOptTargetMarginPercent { get; set; }

    public bool CusQuoteRevenueOptIsPreferred { get; set; }

    public bool CusQuoteRevenueOptIsAccepted { get; set; }

    public DateTime? CusQuoteRevenueOptAcceptedAt { get; set; }

    public Guid? CusQuoteRevenueOptAcceptedBy { get; set; }

    public string CusQuoteRevenueOptNotesJson { get; set; } = null!;

    public Guid? CusQuoteRevenueOptSourceRateRequestId { get; set; }

    public Guid? CusQuoteRevenueOptSourceRateResultId { get; set; }

    public Guid? CusQuoteRevenueOptSourceMarginProfileId { get; set; }

    public virtual ICollection<CrmOpportunityQuoteLink> CrmOpportunityQuoteLinks { get; set; } = new List<CrmOpportunityQuoteLink>();

    public virtual ICollection<CusQuoteChargesOut> CusQuoteChargesOuts { get; set; } = new List<CusQuoteChargesOut>();

    public virtual ICollection<CusQuoteCostRevenueLink> CusQuoteCostRevenueLinkCqcrlRevenueOpts { get; set; } = new List<CusQuoteCostRevenueLink>();

    public virtual ICollection<CusQuoteCostRevenueLink> CusQuoteCostRevenueLinkCusQuoteRevenueOptions { get; set; } = new List<CusQuoteCostRevenueLink>();

    public virtual CusQuoteRevision CusQuoteRev { get; set; } = null!;

    public virtual RateMarginProfile? CusQuoteRevenueOptSourceMarginProfile { get; set; }

    public virtual RateRateRequest? CusQuoteRevenueOptSourceRateRequest { get; set; }

    public virtual RateRateResult? CusQuoteRevenueOptSourceRateResult { get; set; }

    public virtual SysCusQuoteOptionStatus CusQuoteRevenueOptStatusCodeNavigation { get; set; } = null!;

    public virtual ICollection<CusQuoteRevision> CusQuoteRevisions { get; set; } = new List<CusQuoteRevision>();

    public virtual ICollection<JobCostingChargesOut> JobCostingChargesOuts { get; set; } = new List<JobCostingChargesOut>();

    public virtual ICollection<RateQuoteLink> RateQuoteLinks { get; set; } = new List<RateQuoteLink>();
}
