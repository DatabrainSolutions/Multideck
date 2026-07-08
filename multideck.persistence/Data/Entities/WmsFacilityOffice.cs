using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsFacilityOffice
{
    public Guid WmsfacilityOfficeId { get; set; }

    public Guid WmsfacilityOfficeFacilityId { get; set; }

    public Guid WmsfacilityOfficeOrgOfficeId { get; set; }

    public string WmsfacilityOfficeRoleCode { get; set; } = null!;

    public bool WmsfacilityOfficeIsDefault { get; set; }

    public DateTime WmsfacilityOfficeCreatedAt { get; set; }

    public Guid? WmsfacilityOfficeCreatedBy { get; set; }

    public virtual CmpUser? WmsfacilityOfficeCreatedByNavigation { get; set; }

    public virtual WmsFacility WmsfacilityOfficeFacility { get; set; } = null!;

    public virtual CmpOffice WmsfacilityOfficeOrgOffice { get; set; } = null!;
}
