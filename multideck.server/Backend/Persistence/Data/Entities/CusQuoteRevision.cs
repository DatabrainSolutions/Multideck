using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CusQuoteRevision
{
    public Guid CusQuoteRevId { get; set; }

    public Guid CusQuoteHeaderId { get; set; }

    public int CusQuoteRevNumber { get; set; }

    public int CusQuoteRevStatus { get; set; }

    public int? CusQuoteRevReason { get; set; }

    public Guid? CusQuoteRevPreferredRev { get; set; }

    public Guid? CusQuoteRevPreferredCost { get; set; }

    public int? CusQuoteRevRevenueCount { get; set; }

    public int? CusQuoteRevCostCount { get; set; }

    public int? CusQuoteRevMode { get; set; }

    public int? CusQuoteRevType { get; set; }

    public Guid? CusQuoteRevOriginCtry { get; set; }

    public Guid? CusQuoteRevDestinationCtry { get; set; }

    public Guid? CusQuoteRevOrigin { get; set; }

    public Guid? CusQuoteRevDestination { get; set; }

    public string? CusQuoteRevOriginXtra { get; set; }

    public string? CusQuoteRevDestinationXtra { get; set; }

    public decimal? CusQuoteRevOuterQty { get; set; }

    public int? CusQuoteRevOuterPack { get; set; }

    public decimal? CusQuoteRevInnerQty { get; set; }

    public string? CusQuoteRevInnerPack { get; set; }

    public decimal? CusQuoteRevGrossKilos { get; set; }

    public decimal? CusQuoteRevCubeM3 { get; set; }

    public string? CusQuoteRevNotes { get; set; }

    public Guid? CusQuoteRevBasedOnRevId { get; set; }

    public string? CusQuoteRevLabel { get; set; }

    public string CusQuoteRevStatusCode { get; set; } = null!;

    public string? CusQuoteRevModeCode { get; set; }

    public string? CusQuoteRevShipmentTypeCode { get; set; }

    public string? CusQuoteRevServiceLevel { get; set; }

    public Guid? CusQuoteRevCarrierSummaryOrgId { get; set; }

    public string? CusQuoteRevCarrierSummarySnapshot { get; set; }

    public int? CusQuoteRevTransitDays { get; set; }

    public DateOnly? CusQuoteRevValidFrom { get; set; }

    public DateOnly? CusQuoteRevValidTo { get; set; }

    public bool CusQuoteRevIsCustomerVisible { get; set; }

    public bool CusQuoteRevIsAccepted { get; set; }

    public DateTime? CusQuoteRevAcceptedAt { get; set; }

    public Guid? CusQuoteRevAcceptedBy { get; set; }

    public Guid? CusQuoteRevAcceptedCostOptId { get; set; }

    public Guid? CusQuoteRevAcceptedRevenueOptId { get; set; }

    public Guid? CusQuoteRevAcceptedCostRevenueLinkId { get; set; }

    public Guid? CusQuoteRevConvertedJobId { get; set; }

    public DateTime CusQuoteRevCreatedAt { get; set; }

    public Guid? CusQuoteRevCreatedBy { get; set; }

    public DateTime CusQuoteRevUpdatedAt { get; set; }

    public Guid? CusQuoteRevUpdatedBy { get; set; }

    public virtual ICollection<CrmOpportunityQuoteLink> CrmOpportunityQuoteLinks { get; set; } = new List<CrmOpportunityQuoteLink>();

    public virtual ICollection<CrmQuoteFollowup> CrmQuoteFollowups { get; set; } = new List<CrmQuoteFollowup>();

    public virtual ICollection<CusQuoteCostOption> CusQuoteCostOptions { get; set; } = new List<CusQuoteCostOption>();

    public virtual ICollection<CusQuoteCostRevenueLink> CusQuoteCostRevenueLinks { get; set; } = new List<CusQuoteCostRevenueLink>();

    public virtual CusQuoteHeader CusQuoteHeader { get; set; } = null!;

    public virtual CusQuoteCostOption? CusQuoteRevAcceptedCostOpt { get; set; }

    public virtual CusQuoteCostRevenueLink? CusQuoteRevAcceptedCostRevenueLink { get; set; }

    public virtual CusQuoteRevenueOption? CusQuoteRevAcceptedRevenueOpt { get; set; }

    public virtual CusQuoteRevision? CusQuoteRevBasedOnRev { get; set; }

    public virtual JobHeader? CusQuoteRevConvertedJob { get; set; }

    public virtual SysCusQuoteShipmentMode? CusQuoteRevModeCodeNavigation { get; set; }

    public virtual SysCusQuoteShipmentType? CusQuoteRevShipmentTypeCodeNavigation { get; set; }

    public virtual SysCusQuoteRevisionStatus CusQuoteRevStatusCodeNavigation { get; set; } = null!;

    public virtual ICollection<CusQuoteRevenueOption> CusQuoteRevenueOptions { get; set; } = new List<CusQuoteRevenueOption>();

    public virtual ICollection<CusQuoteRevision> InverseCusQuoteRevBasedOnRev { get; set; } = new List<CusQuoteRevision>();

    public virtual ICollection<JobCostingChargesIn> JobCostingChargesIns { get; set; } = new List<JobCostingChargesIn>();

    public virtual ICollection<JobCostingChargesOut> JobCostingChargesOuts { get; set; } = new List<JobCostingChargesOut>();

    public virtual ICollection<RateQuoteLink> RateQuoteLinks { get; set; } = new List<RateQuoteLink>();

    public virtual ICollection<RateRateRequest> RateRateRequests { get; set; } = new List<RateRateRequest>();
}
