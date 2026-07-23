using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsTask
{
    public Guid WmstaskId { get; set; }

    public Guid WmstaskFacilityId { get; set; }

    public Guid? WmstaskOrderId { get; set; }

    public Guid? WmstaskOrderLineId { get; set; }

    public Guid? WmstaskJobId { get; set; }

    public Guid? WmstaskWorkflowTaskId { get; set; }

    public string WmstaskTypeCode { get; set; } = null!;

    public string WmstaskStatusCode { get; set; } = null!;

    public string WmstaskPriorityCode { get; set; } = null!;

    public string WmstaskTitle { get; set; } = null!;

    public string? WmstaskInstructions { get; set; }

    public Guid? WmstaskSourceLocationId { get; set; }

    public Guid? WmstaskTargetLocationId { get; set; }

    public Guid? WmstaskItemId { get; set; }

    public Guid? WmstaskBalanceId { get; set; }

    public Guid? WmstaskHuId { get; set; }

    public decimal? WmstaskQuantity { get; set; }

    public string? WmstaskUomcode { get; set; }

    public DateTime? WmstaskDueAt { get; set; }

    public DateTime? WmstaskStartedAt { get; set; }

    public DateTime? WmstaskCompletedAt { get; set; }

    public Guid? WmstaskCompletedBy { get; set; }

    public string WmstaskMetadataJson { get; set; } = null!;

    public DateTime WmstaskCreatedAt { get; set; }

    public Guid? WmstaskCreatedBy { get; set; }

    public virtual ICollection<WmsException> WmsExceptions { get; set; } = new List<WmsException>();

    public virtual ICollection<WmsInventoryTransaction> WmsInventoryTransactions { get; set; } = new List<WmsInventoryTransaction>();

    public virtual ICollection<WmsPackTask> WmsPackTasks { get; set; } = new List<WmsPackTask>();

    public virtual ICollection<WmsPickTask> WmsPickTasks { get; set; } = new List<WmsPickTask>();

    public virtual ICollection<WmsScanEvent> WmsScanEvents { get; set; } = new List<WmsScanEvent>();

    public virtual ICollection<WmsScanSession> WmsScanSessions { get; set; } = new List<WmsScanSession>();

    public virtual ICollection<WmsTaskAssignment> WmsTaskAssignments { get; set; } = new List<WmsTaskAssignment>();

    public virtual ICollection<WmsTaskEvent> WmsTaskEvents { get; set; } = new List<WmsTaskEvent>();

    public virtual WmsInventoryBalance? WmstaskBalance { get; set; }

    public virtual CmpUser? WmstaskCompletedByNavigation { get; set; }

    public virtual CmpUser? WmstaskCreatedByNavigation { get; set; }

    public virtual WmsFacility WmstaskFacility { get; set; } = null!;

    public virtual WmsHandlingUnit? WmstaskHu { get; set; }

    public virtual WmsItem? WmstaskItem { get; set; }

    public virtual JobHeader? WmstaskJob { get; set; }

    public virtual WmsOrder? WmstaskOrder { get; set; }

    public virtual WmsOrderLine? WmstaskOrderLine { get; set; }

    public virtual WmsLocation? WmstaskSourceLocation { get; set; }

    public virtual SysWmstaskStatus WmstaskStatusCodeNavigation { get; set; } = null!;

    public virtual WmsLocation? WmstaskTargetLocation { get; set; }

    public virtual SysWmstaskType WmstaskTypeCodeNavigation { get; set; } = null!;

    public virtual WorkflowTask? WmstaskWorkflowTask { get; set; }
}
