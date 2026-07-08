using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmBookingEngagementQueue
{
    public Guid? CrmquickTaskId { get; set; }

    public Guid? CrmquickTaskJobId { get; set; }

    public int? JobNumber { get; set; }

    public Guid? CrmquickTaskCustomerOrgId { get; set; }

    public string? CustomerName { get; set; }

    public Guid? CrmquickTaskAssignedUserId { get; set; }

    public string? CrmquickTaskTitle { get; set; }

    public DateTime? CrmquickTaskDueAt { get; set; }

    public long? DraftCount { get; set; }

    public long? OptionCount { get; set; }
}
