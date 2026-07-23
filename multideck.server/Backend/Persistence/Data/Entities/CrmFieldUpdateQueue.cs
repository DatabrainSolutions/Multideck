using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmFieldUpdateQueue
{
    public Guid CrmfieldUpdateId { get; set; }

    public Guid? CrmfieldUpdateRunId { get; set; }

    public Guid? CrmfieldUpdateDataRequestId { get; set; }

    public Guid? CrmfieldUpdateDataRequestFieldId { get; set; }

    public Guid? CrmfieldUpdateCaptureResponseId { get; set; }

    public Guid? CrmfieldUpdateResponseId { get; set; }

    public Guid? CrmfieldUpdateFieldDefId { get; set; }

    public string CrmfieldUpdateStatusCode { get; set; } = null!;

    public string? CrmfieldUpdateTargetRecordTypeCode { get; set; }

    public string CrmfieldUpdateTargetTable { get; set; } = null!;

    public string CrmfieldUpdateTargetPkcolumn { get; set; } = null!;

    public string CrmfieldUpdateTargetColumn { get; set; } = null!;

    public Guid CrmfieldUpdateTargetId { get; set; }

    public string CrmfieldUpdateFieldTypeCode { get; set; } = null!;

    public string? CrmfieldUpdateOldValueText { get; set; }

    public string? CrmfieldUpdateNewValueText { get; set; }

    public string? CrmfieldUpdateNewValueJson { get; set; }

    public decimal? CrmfieldUpdateConfidenceScore { get; set; }

    public bool CrmfieldUpdateRequiresApproval { get; set; }

    public string? CrmfieldUpdateReason { get; set; }

    public string? CrmfieldUpdateErrorMessage { get; set; }

    public DateTime CrmfieldUpdateCreatedAt { get; set; }

    public Guid? CrmfieldUpdateCreatedBy { get; set; }

    public DateTime? CrmfieldUpdateReviewedAt { get; set; }

    public Guid? CrmfieldUpdateReviewedBy { get; set; }

    public DateTime? CrmfieldUpdateAppliedAt { get; set; }

    public Guid? CrmfieldUpdateAppliedBy { get; set; }

    public virtual ICollection<CrmDataCaptureResponse> CrmDataCaptureResponses { get; set; } = new List<CrmDataCaptureResponse>();

    public virtual ICollection<CrmDataRequestField> CrmDataRequestFields { get; set; } = new List<CrmDataRequestField>();

    public virtual ICollection<CrmFieldUpdateAudit> CrmFieldUpdateAudits { get; set; } = new List<CrmFieldUpdateAudit>();

    public virtual CmpUser? CrmfieldUpdateAppliedByNavigation { get; set; }

    public virtual CrmDataCaptureResponse? CrmfieldUpdateCaptureResponse { get; set; }

    public virtual CmpUser? CrmfieldUpdateCreatedByNavigation { get; set; }

    public virtual CrmDataRequest? CrmfieldUpdateDataRequest { get; set; }

    public virtual CrmDataRequestField? CrmfieldUpdateDataRequestField { get; set; }

    public virtual CrmAutomationFieldDefinition? CrmfieldUpdateFieldDef { get; set; }

    public virtual SysCrmdataFieldType CrmfieldUpdateFieldTypeCodeNavigation { get; set; } = null!;

    public virtual CrmDataRequestResponse? CrmfieldUpdateResponse { get; set; }

    public virtual CmpUser? CrmfieldUpdateReviewedByNavigation { get; set; }

    public virtual CrmAutomationRun? CrmfieldUpdateRun { get; set; }

    public virtual SysCrmfieldUpdateStatus CrmfieldUpdateStatusCodeNavigation { get; set; } = null!;

    public virtual SysWorkflowRecordType? CrmfieldUpdateTargetRecordTypeCodeNavigation { get; set; }
}
