using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmAutomationActionQueue
{
    public Guid? CrmautoRunId { get; set; }

    public string? CrmautoRunStatusCode { get; set; }

    public string? CrmautoPlaybookCode { get; set; }

    public string? CrmautoPlaybookName { get; set; }

    public string? CrmautoPlaybookActionTypeCode { get; set; }

    public Guid? CrmautoRunAssignedUserId { get; set; }

    public string? CrmautoRunAssignedUserEmail { get; set; }

    public Guid? CrmautoRunCustomerOrgId { get; set; }

    public string? CrmautoRunCustomerName { get; set; }

    public string? CrmautoRunTargetTable { get; set; }

    public Guid? CrmautoRunTargetId { get; set; }

    public Guid? CrmautoRunQuickTaskId { get; set; }

    public Guid? CrmautoRunJobId { get; set; }

    public long? CrmautoRunDataRequestCount { get; set; }

    public long? CrmautoRunOpenFieldUpdateCount { get; set; }

    public DateTime? CrmautoRunStartedAt { get; set; }
}
