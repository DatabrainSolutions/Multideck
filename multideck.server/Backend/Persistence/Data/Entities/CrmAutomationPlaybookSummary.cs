using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmAutomationPlaybookSummary
{
    public Guid? CrmautoPlaybookId { get; set; }

    public string? CrmautoPlaybookCode { get; set; }

    public string? CrmautoPlaybookName { get; set; }

    public string? CrmautoPlaybookActionTypeCode { get; set; }

    public string? CrmautoActionTypeName { get; set; }

    public string? CrmautoPlaybookTriggerTypeCode { get; set; }

    public string? CrmautoPlaybookTargetRecordTypeCode { get; set; }

    public string? CrmautoPlaybookTargetTable { get; set; }

    public bool? CrmautoPlaybookRequiresWizard { get; set; }

    public bool? CrmautoPlaybookRequiresExternalRequest { get; set; }

    public bool? CrmautoPlaybookAutoApplyAllowed { get; set; }

    public bool? CrmautoPlaybookRequireApprovalBeforeApply { get; set; }

    public long? CrmautoPlaybookFieldCount { get; set; }

    public long? CrmautoPlaybookStepCount { get; set; }

    public bool? CrmautoPlaybookIsActive { get; set; }
}
