using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsExceptionQueue
{
    public Guid? WmsexceptionId { get; set; }

    public Guid? WmsexceptionFacilityId { get; set; }

    public string? WmsfacilityName { get; set; }

    public string? WmsexceptionTypeCode { get; set; }

    public string? WmsexceptionStatusCode { get; set; }

    public string? WmsexceptionSeverityCode { get; set; }

    public string? WmsexceptionTitle { get; set; }

    public Guid? WmsexceptionOrderId { get; set; }

    public string? WmsorderOrderNumber { get; set; }

    public Guid? WmsexceptionJobId { get; set; }

    public Guid? WmsexceptionWorkflowTaskId { get; set; }

    public DateTime? WmsexceptionRaisedAt { get; set; }

    public DateTime? WmsexceptionResolvedAt { get; set; }
}
