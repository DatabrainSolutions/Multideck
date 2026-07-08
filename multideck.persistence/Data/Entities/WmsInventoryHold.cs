using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsInventoryHold
{
    public Guid WmsholdId { get; set; }

    public Guid WmsholdFacilityId { get; set; }

    public Guid? WmsholdBalanceId { get; set; }

    public Guid? WmsholdItemId { get; set; }

    public Guid? WmsholdLotId { get; set; }

    public Guid? WmsholdHuId { get; set; }

    public Guid? WmsholdOrderId { get; set; }

    public Guid? WmsholdJobId { get; set; }

    public string WmsholdTypeCode { get; set; } = null!;

    public string WmsholdStatusCode { get; set; } = null!;

    public decimal? WmsholdQuantity { get; set; }

    public string WmsholdUomcode { get; set; } = null!;

    public string WmsholdReason { get; set; } = null!;

    public Guid? WmsholdTceholdId { get; set; }

    public Guid? WmsholdTcegateId { get; set; }

    public Guid? WmsholdWorkflowTaskId { get; set; }

    public DateTime WmsholdPlacedAt { get; set; }

    public Guid? WmsholdPlacedBy { get; set; }

    public DateTime? WmsholdReleasedAt { get; set; }

    public Guid? WmsholdReleasedBy { get; set; }

    public string? WmsholdReleaseReason { get; set; }

    public virtual WmsInventoryBalance? WmsholdBalance { get; set; }

    public virtual WmsFacility WmsholdFacility { get; set; } = null!;

    public virtual WmsHandlingUnit? WmsholdHu { get; set; }

    public virtual WmsItem? WmsholdItem { get; set; }

    public virtual JobHeader? WmsholdJob { get; set; }

    public virtual WmsInventoryLot? WmsholdLot { get; set; }

    public virtual WmsOrder? WmsholdOrder { get; set; }

    public virtual CmpUser? WmsholdPlacedByNavigation { get; set; }

    public virtual CmpUser? WmsholdReleasedByNavigation { get; set; }

    public virtual SysWmsholdStatus WmsholdStatusCodeNavigation { get; set; } = null!;

    public virtual TceReleaseGate? WmsholdTcegate { get; set; }

    public virtual TceComplianceHold? WmsholdTcehold { get; set; }

    public virtual SysWmsholdType WmsholdTypeCodeNavigation { get; set; } = null!;

    public virtual WorkflowTask? WmsholdWorkflowTask { get; set; }
}
