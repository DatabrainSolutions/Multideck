using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateRateResult
{
    public Guid RateresultId { get; set; }

    public Guid RateresultRequestId { get; set; }

    public string RateresultStatusCode { get; set; } = null!;

    public string RateresultSourceTypeCode { get; set; } = null!;

    public Guid? RateresultContractId { get; set; }

    public Guid? RateresultContractVerId { get; set; }

    public Guid? RateresultRateSheetId { get; set; }

    public Guid? RateresultSpotId { get; set; }

    public Guid? RateresultServiceId { get; set; }

    public Guid? RateresultCarrierOrgId { get; set; }

    public string? RateresultCarrierNameSnapshot { get; set; }

    public string? RateresultServiceLevel { get; set; }

    public string? RateresultRoutingSummary { get; set; }

    public int? RateresultTransitDays { get; set; }

    public bool? RateresultDirect { get; set; }

    public Guid? RateresultCurrencyId { get; set; }

    public string? RateresultCurrencyCodeSnapshot { get; set; }

    public decimal RateresultBuyTotal { get; set; }

    public decimal RateresultSellTotal { get; set; }

    public decimal RateresultMarginAmount { get; set; }

    public decimal? RateresultMarginPercent { get; set; }

    public DateTime? RateresultValidUntil { get; set; }

    public decimal? RateresultConfidenceScore { get; set; }

    public string? RateresultAiexplanation { get; set; }

    public string RateresultResultJson { get; set; } = null!;

    public DateTime RateresultCreatedAt { get; set; }

    public Guid? RateresultCreatedBy { get; set; }

    public DateTime? RateresultSelectedAt { get; set; }

    public Guid? RateresultSelectedBy { get; set; }

    public virtual ICollection<CusQuoteCostOption> CusQuoteCostOptions { get; set; } = new List<CusQuoteCostOption>();

    public virtual ICollection<CusQuoteRevenueOption> CusQuoteRevenueOptions { get; set; } = new List<CusQuoteRevenueOption>();

    public virtual ICollection<JobCostingChargesIn> JobCostingChargesIns { get; set; } = new List<JobCostingChargesIn>();

    public virtual ICollection<JobCostingChargesOut> JobCostingChargesOuts { get; set; } = new List<JobCostingChargesOut>();

    public virtual ICollection<RateAuditEvent> RateAuditEvents { get; set; } = new List<RateAuditEvent>();

    public virtual ICollection<RateJobCostingLink> RateJobCostingLinks { get; set; } = new List<RateJobCostingLink>();

    public virtual ICollection<RateQuoteLink> RateQuoteLinks { get; set; } = new List<RateQuoteLink>();

    public virtual ICollection<RateRateResultLine> RateRateResultLines { get; set; } = new List<RateRateResultLine>();

    public virtual ICollection<RateResultAdjustment> RateResultAdjustments { get; set; } = new List<RateResultAdjustment>();

    public virtual OrgMaster? RateresultCarrierOrg { get; set; }

    public virtual RateContract? RateresultContract { get; set; }

    public virtual RateContractVersion? RateresultContractVer { get; set; }

    public virtual CmpUser? RateresultCreatedByNavigation { get; set; }

    public virtual SysCurrency? RateresultCurrency { get; set; }

    public virtual RateRateSheet? RateresultRateSheet { get; set; }

    public virtual RateRateRequest RateresultRequest { get; set; } = null!;

    public virtual CmpUser? RateresultSelectedByNavigation { get; set; }

    public virtual RateServiceProduct? RateresultService { get; set; }

    public virtual SysRateSourceType RateresultSourceTypeCodeNavigation { get; set; } = null!;

    public virtual RateSpotQuote? RateresultSpot { get; set; }

    public virtual SysRateResultStatus RateresultStatusCodeNavigation { get; set; } = null!;

    public virtual ICollection<WmsBillingEvent> WmsBillingEvents { get; set; } = new List<WmsBillingEvent>();
}
