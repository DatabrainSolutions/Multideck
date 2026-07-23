using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateTariffAssignment
{
    public Guid RatetariffAssignId { get; set; }

    public Guid RatetariffAssignContractId { get; set; }

    public Guid? RatetariffAssignContractVerId { get; set; }

    public Guid? RatetariffAssignCustomerOrgId { get; set; }

    public Guid? RatetariffAssignCarrierOrgId { get; set; }

    public Guid? RatetariffAssignOrgOfficeId { get; set; }

    public Guid? RatetariffAssignLegalEntityId { get; set; }

    public Guid? RatetariffAssignBrandId { get; set; }

    public string? RatetariffAssignModeCode { get; set; }

    public Guid? RatetariffAssignLaneId { get; set; }

    public int RatetariffAssignPriority { get; set; }

    public DateOnly? RatetariffAssignValidFrom { get; set; }

    public DateOnly? RatetariffAssignValidTo { get; set; }

    public bool RatetariffAssignIsActive { get; set; }

    public DateTime RatetariffAssignCreatedAt { get; set; }

    public Guid? RatetariffAssignCreatedBy { get; set; }

    public virtual CmpBrand? RatetariffAssignBrand { get; set; }

    public virtual OrgMaster? RatetariffAssignCarrierOrg { get; set; }

    public virtual RateContract RatetariffAssignContract { get; set; } = null!;

    public virtual RateContractVersion? RatetariffAssignContractVer { get; set; }

    public virtual CmpUser? RatetariffAssignCreatedByNavigation { get; set; }

    public virtual OrgMaster? RatetariffAssignCustomerOrg { get; set; }

    public virtual RateLane? RatetariffAssignLane { get; set; }

    public virtual CmpLegalEntity? RatetariffAssignLegalEntity { get; set; }

    public virtual SysJobTransportMode? RatetariffAssignModeCodeNavigation { get; set; }

    public virtual CmpOffice? RatetariffAssignOrgOffice { get; set; }
}
