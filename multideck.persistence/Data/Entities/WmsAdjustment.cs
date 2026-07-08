using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsAdjustment
{
    public Guid WmsadjustId { get; set; }

    public Guid WmsadjustFacilityId { get; set; }

    public string WmsadjustAdjustmentNumber { get; set; } = null!;

    public string WmsadjustStatusCode { get; set; } = null!;

    public string WmsadjustReasonCode { get; set; } = null!;

    public Guid? WmsadjustCycleCountPlanId { get; set; }

    public Guid? WmsadjustJobId { get; set; }

    public bool WmsadjustRequiresApproval { get; set; }

    public Guid? WmsadjustWorkflowTaskId { get; set; }

    public string? WmsadjustNotes { get; set; }

    public DateTime WmsadjustCreatedAt { get; set; }

    public Guid? WmsadjustCreatedBy { get; set; }

    public DateTime? WmsadjustPostedAt { get; set; }

    public Guid? WmsadjustPostedBy { get; set; }

    public virtual ICollection<WmsAdjustmentLine> WmsAdjustmentLines { get; set; } = new List<WmsAdjustmentLine>();

    public virtual CmpUser? WmsadjustCreatedByNavigation { get; set; }

    public virtual WmsCycleCountPlan? WmsadjustCycleCountPlan { get; set; }

    public virtual WmsFacility WmsadjustFacility { get; set; } = null!;

    public virtual JobHeader? WmsadjustJob { get; set; }

    public virtual CmpUser? WmsadjustPostedByNavigation { get; set; }

    public virtual SysWmsadjustmentStatus WmsadjustStatusCodeNavigation { get; set; } = null!;

    public virtual WorkflowTask? WmsadjustWorkflowTask { get; set; }
}
