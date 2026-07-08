using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmAutomationFieldDefinition
{
    public Guid CrmautoFieldId { get; set; }

    public Guid CrmautoFieldPlaybookId { get; set; }

    public string CrmautoFieldCode { get; set; } = null!;

    public string CrmautoFieldLabel { get; set; } = null!;

    public string CrmautoFieldFieldTypeCode { get; set; } = null!;

    public string CrmautoFieldSensitivityCode { get; set; } = null!;

    public string CrmautoFieldTargetTable { get; set; } = null!;

    public string CrmautoFieldTargetPkcolumn { get; set; } = null!;

    public string CrmautoFieldTargetColumn { get; set; } = null!;

    public string? CrmautoFieldTargetRecordTypeCode { get; set; }

    public string CrmautoFieldQuestionText { get; set; } = null!;

    public string? CrmautoFieldHelpText { get; set; }

    public string? CrmautoFieldExtractionHint { get; set; }

    public string? CrmautoFieldEnumTable { get; set; }

    public string? CrmautoFieldEnumCodeColumn { get; set; }

    public string? CrmautoFieldEnumLabelColumn { get; set; }

    public bool CrmautoFieldIsRequired { get; set; }

    public bool CrmautoFieldAutoQueueUpdate { get; set; }

    public bool CrmautoFieldAutoApplyAllowed { get; set; }

    public string CrmautoFieldValidationJson { get; set; } = null!;

    public int CrmautoFieldSortOrder { get; set; }

    public bool CrmautoFieldIsActive { get; set; }

    public DateTime CrmautoFieldCreatedAt { get; set; }

    public virtual ICollection<CrmDataCaptureResponse> CrmDataCaptureResponses { get; set; } = new List<CrmDataCaptureResponse>();

    public virtual ICollection<CrmDataRequestField> CrmDataRequestFields { get; set; } = new List<CrmDataRequestField>();

    public virtual ICollection<CrmFieldUpdateQueue> CrmFieldUpdateQueues { get; set; } = new List<CrmFieldUpdateQueue>();

    public virtual SysCrmdataFieldType CrmautoFieldFieldTypeCodeNavigation { get; set; } = null!;

    public virtual CrmAutomationPlaybook CrmautoFieldPlaybook { get; set; } = null!;

    public virtual SysCrmdataSensitivityLevel CrmautoFieldSensitivityCodeNavigation { get; set; } = null!;

    public virtual SysWorkflowRecordType? CrmautoFieldTargetRecordTypeCodeNavigation { get; set; }
}
