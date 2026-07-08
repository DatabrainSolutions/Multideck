using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsCustomerProfile
{
    public Guid WmscustomerProfileId { get; set; }

    public Guid WmscustomerProfileCustomerOrgId { get; set; }

    public Guid? WmscustomerProfileOrgOfficeId { get; set; }

    public Guid? WmscustomerProfileDefaultFacilityId { get; set; }

    public string? WmscustomerProfileCustomerCode { get; set; }

    public string WmscustomerProfileDefaultAllocationMethodCode { get; set; } = null!;

    public string WmscustomerProfileDefaultPickMethodCode { get; set; } = null!;

    public bool WmscustomerProfilePortalStockVisible { get; set; }

    public bool WmscustomerProfileAllowsBondedStock { get; set; }

    public bool WmscustomerProfileRequiresAsn { get; set; }

    public string? WmscustomerProfileLabelStandardCode { get; set; }

    public string WmscustomerProfileRulesJson { get; set; } = null!;

    public bool WmscustomerProfileIsActive { get; set; }

    public DateTime WmscustomerProfileCreatedAt { get; set; }

    public Guid? WmscustomerProfileCreatedBy { get; set; }

    public DateTime WmscustomerProfileUpdatedAt { get; set; }

    public virtual ICollection<WmsServiceContract> WmsServiceContracts { get; set; } = new List<WmsServiceContract>();

    public virtual CmpUser? WmscustomerProfileCreatedByNavigation { get; set; }

    public virtual OrgMaster WmscustomerProfileCustomerOrg { get; set; } = null!;

    public virtual WmsFacility? WmscustomerProfileDefaultFacility { get; set; }

    public virtual CmpOffice? WmscustomerProfileOrgOffice { get; set; }
}
