using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateSpotQuote
{
    public Guid RatespotId { get; set; }

    public string RatespotCode { get; set; } = null!;

    public string RatespotStatusCode { get; set; } = null!;

    public string RatespotSourceTypeCode { get; set; } = null!;

    public Guid? RatespotCarrierOrgId { get; set; }

    public Guid? RatespotSupplierOrgId { get; set; }

    public Guid? RatespotCustomerOrgId { get; set; }

    public Guid? RatespotOrgOfficeId { get; set; }

    public string? RatespotModeCode { get; set; }

    public string? RatespotShipmentTypeCode { get; set; }

    public Guid? RatespotLaneId { get; set; }

    public DateTime? RatespotValidUntil { get; set; }

    public string? RatespotExternalReference { get; set; }

    public string? RatespotNotes { get; set; }

    public string RatespotRawResponseJson { get; set; } = null!;

    public DateTime RatespotCreatedAt { get; set; }

    public Guid? RatespotCreatedBy { get; set; }

    public virtual ICollection<RateRateResult> RateRateResults { get; set; } = new List<RateRateResult>();

    public virtual ICollection<RateSpotQuoteLine> RateSpotQuoteLines { get; set; } = new List<RateSpotQuoteLine>();

    public virtual OrgMaster? RatespotCarrierOrg { get; set; }

    public virtual CmpUser? RatespotCreatedByNavigation { get; set; }

    public virtual OrgMaster? RatespotCustomerOrg { get; set; }

    public virtual RateLane? RatespotLane { get; set; }

    public virtual SysJobTransportMode? RatespotModeCodeNavigation { get; set; }

    public virtual CmpOffice? RatespotOrgOffice { get; set; }

    public virtual SysCusQuoteShipmentMode? RatespotShipmentTypeCodeNavigation { get; set; }

    public virtual SysRateSourceType RatespotSourceTypeCodeNavigation { get; set; } = null!;

    public virtual SysRateStatus RatespotStatusCodeNavigation { get; set; } = null!;

    public virtual OrgMaster? RatespotSupplierOrg { get; set; }
}
