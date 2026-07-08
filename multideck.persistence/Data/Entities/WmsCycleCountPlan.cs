using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsCycleCountPlan
{
    public Guid WmscountPlanId { get; set; }

    public Guid WmscountPlanFacilityId { get; set; }

    public string WmscountPlanName { get; set; } = null!;

    public string WmscountPlanStatusCode { get; set; } = null!;

    public string WmscountPlanCountTypeCode { get; set; } = null!;

    public Guid? WmscountPlanCustomerOrgId { get; set; }

    public Guid? WmscountPlanZoneId { get; set; }

    public DateTime? WmscountPlanPlannedStartAt { get; set; }

    public DateTime? WmscountPlanPlannedEndAt { get; set; }

    public DateTime WmscountPlanCreatedAt { get; set; }

    public Guid? WmscountPlanCreatedBy { get; set; }

    public virtual ICollection<WmsAdjustment> WmsAdjustments { get; set; } = new List<WmsAdjustment>();

    public virtual ICollection<WmsCycleCountLine> WmsCycleCountLines { get; set; } = new List<WmsCycleCountLine>();

    public virtual CmpUser? WmscountPlanCreatedByNavigation { get; set; }

    public virtual OrgMaster? WmscountPlanCustomerOrg { get; set; }

    public virtual WmsFacility WmscountPlanFacility { get; set; } = null!;

    public virtual SysWmscycleCountStatus WmscountPlanStatusCodeNavigation { get; set; } = null!;

    public virtual WmsZone? WmscountPlanZone { get; set; }
}
