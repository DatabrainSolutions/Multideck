using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CusQuoteCostOption
{
    public Guid CusQuoteCostOptId { get; set; }

    public Guid CusQuoteCostOptRevId { get; set; }

    public int CusQuoteCostOptSubId { get; set; }

    public Guid CusQuoteCostOptCarrierId { get; set; }

    public string? CusQuoteCostOptDescription { get; set; }

    public int? CusQuoteCostOptTransitDays { get; set; }

    public DateTime? CusQuoteCostOptDepartureDate { get; set; }

    public DateTime? CusQuoteCostOptArrivalDate { get; set; }

    public bool CusQuoteCostOptDirect { get; set; }

    public string? CusQuoteCostOptVia { get; set; }

    public string CusQuoteCostOptStatusCode { get; set; } = null!;

    public string? CusQuoteCostOptModeCode { get; set; }

    public string? CusQuoteCostOptShipmentTypeCode { get; set; }

    public string? CusQuoteCostOptServiceLevel { get; set; }

    public string? CusQuoteCostOptCarrierNameSnapshot { get; set; }

    public string? CusQuoteCostOptRoutingSummary { get; set; }

    public string? CusQuoteCostOptEquipmentTypeCode { get; set; }

    public DateOnly? CusQuoteCostOptValidFrom { get; set; }

    public DateOnly? CusQuoteCostOptValidTo { get; set; }

    public string? CusQuoteCostOptExternalReference { get; set; }

    public string CusQuoteCostOptNotesJson { get; set; } = null!;

    public Guid? CusQuoteCostOptSourceRateRequestId { get; set; }

    public Guid? CusQuoteCostOptSourceRateResultId { get; set; }

    public Guid? CusQuoteCostOptSourceRateContractId { get; set; }

    public Guid? CusQuoteCostOptSourceRateContractVerId { get; set; }

    public virtual ICollection<CrmOpportunityQuoteLink> CrmOpportunityQuoteLinks { get; set; } = new List<CrmOpportunityQuoteLink>();

    public virtual ICollection<CusQuoteChargesIn> CusQuoteChargesIns { get; set; } = new List<CusQuoteChargesIn>();

    public virtual SysCusQuoteShipmentMode? CusQuoteCostOptModeCodeNavigation { get; set; }

    public virtual CusQuoteRevision CusQuoteCostOptRev { get; set; } = null!;

    public virtual SysCusQuoteShipmentType? CusQuoteCostOptShipmentTypeCodeNavigation { get; set; }

    public virtual RateContract? CusQuoteCostOptSourceRateContract { get; set; }

    public virtual RateContractVersion? CusQuoteCostOptSourceRateContractVer { get; set; }

    public virtual RateRateRequest? CusQuoteCostOptSourceRateRequest { get; set; }

    public virtual RateRateResult? CusQuoteCostOptSourceRateResult { get; set; }

    public virtual SysCusQuoteOptionStatus CusQuoteCostOptStatusCodeNavigation { get; set; } = null!;

    public virtual ICollection<CusQuoteCostRevenueLink> CusQuoteCostRevenueLinkCqcrlCostOpts { get; set; } = new List<CusQuoteCostRevenueLink>();

    public virtual ICollection<CusQuoteCostRevenueLink> CusQuoteCostRevenueLinkCusQuoteCostOptions { get; set; } = new List<CusQuoteCostRevenueLink>();

    public virtual ICollection<CusQuoteRevision> CusQuoteRevisions { get; set; } = new List<CusQuoteRevision>();

    public virtual ICollection<JobCostingChargesIn> JobCostingChargesIns { get; set; } = new List<JobCostingChargesIn>();

    public virtual ICollection<RateQuoteLink> RateQuoteLinks { get; set; } = new List<RateQuoteLink>();
}
