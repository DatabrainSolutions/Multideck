using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateRateRequest
{
    public Guid RaterequestId { get; set; }

    public string RaterequestCode { get; set; } = null!;

    public string RaterequestStatusCode { get; set; } = null!;

    public string RaterequestSourceTypeCode { get; set; } = null!;

    public Guid? RaterequestOrgOfficeId { get; set; }

    public Guid? RaterequestLegalEntityId { get; set; }

    public Guid? RaterequestBrandId { get; set; }

    public Guid? RaterequestCustomerOrgId { get; set; }

    public Guid? RaterequestCarrierOrgId { get; set; }

    public Guid? RaterequestJobId { get; set; }

    public Guid? RaterequestCusQuoteRevId { get; set; }

    public string? RaterequestModeCode { get; set; }

    public string? RaterequestShipmentTypeCode { get; set; }

    public string RaterequestDirectionCode { get; set; } = null!;

    public string? RaterequestOriginUnlocode { get; set; }

    public string? RaterequestOriginNameSnapshot { get; set; }

    public string? RaterequestDestinationUnlocode { get; set; }

    public string? RaterequestDestinationNameSnapshot { get; set; }

    public string? RaterequestPickupPostcode { get; set; }

    public string? RaterequestDeliveryPostcode { get; set; }

    public DateOnly? RaterequestReadyDate { get; set; }

    public DateOnly? RaterequestRequiredDeliveryDate { get; set; }

    public Guid? RaterequestCurrencyId { get; set; }

    public string? RaterequestCurrencyCodeSnapshot { get; set; }

    public string? RaterequestIncotermsCode { get; set; }

    public string? RaterequestCommoditySummary { get; set; }

    public bool RaterequestDangerousGoods { get; set; }

    public bool RaterequestTemperatureControlled { get; set; }

    public string RaterequestRequestJson { get; set; } = null!;

    public string? RaterequestNotes { get; set; }

    public DateTime RaterequestCreatedAt { get; set; }

    public Guid? RaterequestCreatedBy { get; set; }

    public DateTime RaterequestUpdatedAt { get; set; }

    public Guid? RaterequestUpdatedBy { get; set; }

    public virtual ICollection<CusQuoteCostOption> CusQuoteCostOptions { get; set; } = new List<CusQuoteCostOption>();

    public virtual ICollection<CusQuoteRevenueOption> CusQuoteRevenueOptions { get; set; } = new List<CusQuoteRevenueOption>();

    public virtual ICollection<JobCostingChargesIn> JobCostingChargesIns { get; set; } = new List<JobCostingChargesIn>();

    public virtual ICollection<JobCostingChargesOut> JobCostingChargesOuts { get; set; } = new List<JobCostingChargesOut>();

    public virtual ICollection<RateAuditEvent> RateAuditEvents { get; set; } = new List<RateAuditEvent>();

    public virtual ICollection<RateJobCostingLink> RateJobCostingLinks { get; set; } = new List<RateJobCostingLink>();

    public virtual ICollection<RateQuoteLink> RateQuoteLinks { get; set; } = new List<RateQuoteLink>();

    public virtual ICollection<RateRateResult> RateRateResults { get; set; } = new List<RateRateResult>();

    public virtual ICollection<RateRequestCargo> RateRequestCargos { get; set; } = new List<RateRequestCargo>();

    public virtual ICollection<RateRequestEquipment> RateRequestEquipments { get; set; } = new List<RateRequestEquipment>();

    public virtual CmpBrand? RaterequestBrand { get; set; }

    public virtual OrgMaster? RaterequestCarrierOrg { get; set; }

    public virtual CmpUser? RaterequestCreatedByNavigation { get; set; }

    public virtual SysCurrency? RaterequestCurrency { get; set; }

    public virtual CusQuoteRevision? RaterequestCusQuoteRev { get; set; }

    public virtual OrgMaster? RaterequestCustomerOrg { get; set; }

    public virtual SysRateDirection RaterequestDirectionCodeNavigation { get; set; } = null!;

    public virtual JobHeader? RaterequestJob { get; set; }

    public virtual CmpLegalEntity? RaterequestLegalEntity { get; set; }

    public virtual SysJobTransportMode? RaterequestModeCodeNavigation { get; set; }

    public virtual CmpOffice? RaterequestOrgOffice { get; set; }

    public virtual SysCusQuoteShipmentMode? RaterequestShipmentTypeCodeNavigation { get; set; }

    public virtual SysRateSourceType RaterequestSourceTypeCodeNavigation { get; set; } = null!;

    public virtual SysRateRequestStatus RaterequestStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? RaterequestUpdatedByNavigation { get; set; }
}
