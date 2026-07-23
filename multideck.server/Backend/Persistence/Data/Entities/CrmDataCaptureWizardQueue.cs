using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmDataCaptureWizardQueue
{
    public Guid? CrmdataCapSessionId { get; set; }

    public Guid? CrmdataCapSessionRunId { get; set; }

    public Guid? CrmautoRunAssignedUserId { get; set; }

    public string? CrmautoPlaybookCode { get; set; }

    public string? CrmautoPlaybookName { get; set; }

    public string? CrmautoRunTargetTable { get; set; }

    public Guid? CrmautoRunTargetId { get; set; }

    public Guid? CrmautoRunCustomerOrgId { get; set; }

    public string? CustomerName { get; set; }

    public string? CrmdataCapSessionStatusCode { get; set; }

    public long? FieldCount { get; set; }

    public long? CapturedCount { get; set; }

    public DateTime? CrmdataCapSessionStartedAt { get; set; }
}
