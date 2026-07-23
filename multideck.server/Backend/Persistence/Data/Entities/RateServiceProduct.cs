using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateServiceProduct
{
    public Guid RateserviceId { get; set; }

    public Guid? RateserviceContractId { get; set; }

    public Guid? RateserviceCarrierOrgId { get; set; }

    public string RateserviceCode { get; set; } = null!;

    public string RateserviceName { get; set; } = null!;

    public string? RateserviceModeCode { get; set; }

    public string? RateserviceShipmentTypeCode { get; set; }

    public string? RateserviceServiceLevel { get; set; }

    public bool? RateserviceDirect { get; set; }

    public int? RateserviceTransitDaysMin { get; set; }

    public int? RateserviceTransitDaysMax { get; set; }

    public string? RateserviceFrequency { get; set; }

    public string RateserviceCutoffRulesJson { get; set; } = null!;

    public bool RateserviceIsActive { get; set; }

    public DateTime RateserviceCreatedAt { get; set; }

    public Guid? RateserviceCreatedBy { get; set; }

    public virtual ICollection<RateRateResult> RateRateResults { get; set; } = new List<RateRateResult>();

    public virtual ICollection<RateRateSheet> RateRateSheets { get; set; } = new List<RateRateSheet>();

    public virtual OrgMaster? RateserviceCarrierOrg { get; set; }

    public virtual RateContract? RateserviceContract { get; set; }

    public virtual CmpUser? RateserviceCreatedByNavigation { get; set; }

    public virtual SysJobTransportMode? RateserviceModeCodeNavigation { get; set; }

    public virtual SysCusQuoteShipmentMode? RateserviceShipmentTypeCodeNavigation { get; set; }
}
