using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsTaskQueue
{
    public Guid? WmstaskId { get; set; }

    public Guid? WmstaskFacilityId { get; set; }

    public string? WmsfacilityName { get; set; }

    public string? WmstaskTypeCode { get; set; }

    public string? WmstaskStatusCode { get; set; }

    public string? WmstaskPriorityCode { get; set; }

    public string? WmstaskTitle { get; set; }

    public Guid? WmstaskOrderId { get; set; }

    public string? WmsorderOrderNumber { get; set; }

    public Guid? WmstaskJobId { get; set; }

    public Guid? WmstaskSourceLocationId { get; set; }

    public string? SourceLocationCode { get; set; }

    public Guid? WmstaskTargetLocationId { get; set; }

    public string? TargetLocationCode { get; set; }

    public DateTime? WmstaskDueAt { get; set; }

    public DateTime? WmstaskCreatedAt { get; set; }
}
