using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsFacilityCapability
{
    public Guid WmsfacilityCapId { get; set; }

    public Guid WmsfacilityCapFacilityId { get; set; }

    public string WmsfacilityCapCapabilityCode { get; set; } = null!;

    public string? WmsfacilityCapAuthorisationReference { get; set; }

    public DateOnly? WmsfacilityCapValidFrom { get; set; }

    public DateOnly? WmsfacilityCapValidTo { get; set; }

    public string WmsfacilityCapDetailsJson { get; set; } = null!;

    public bool WmsfacilityCapIsActive { get; set; }

    public DateTime WmsfacilityCapCreatedAt { get; set; }

    public virtual SysWmsfacilityCapability WmsfacilityCapCapabilityCodeNavigation { get; set; } = null!;

    public virtual WmsFacility WmsfacilityCapFacility { get; set; } = null!;
}
