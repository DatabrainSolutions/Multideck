using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmFieldUpdateReviewQueue
{
    public Guid? CrmfieldUpdateId { get; set; }

    public string? CrmfieldUpdateStatusCode { get; set; }

    public Guid? CrmfieldUpdateRunId { get; set; }

    public Guid? CrmfieldUpdateDataRequestId { get; set; }

    public string? CrmfieldUpdateTargetRecordTypeCode { get; set; }

    public string? CrmfieldUpdateTargetTable { get; set; }

    public string? CrmfieldUpdateTargetPkcolumn { get; set; }

    public string? CrmfieldUpdateTargetColumn { get; set; }

    public Guid? CrmfieldUpdateTargetId { get; set; }

    public string? CrmfieldUpdateFieldTypeCode { get; set; }

    public string? CrmfieldUpdateOldValueText { get; set; }

    public string? CrmfieldUpdateNewValueText { get; set; }

    public string? CrmfieldUpdateNewValueJson { get; set; }

    public decimal? CrmfieldUpdateConfidenceScore { get; set; }

    public bool? CrmfieldUpdateRequiresApproval { get; set; }

    public string? CrmautoFieldLabel { get; set; }

    public string? CrmautoFieldQuestionText { get; set; }

    public Guid? CrmautoRunAssignedUserId { get; set; }

    public string? CrmautoRunAssignedUserEmail { get; set; }

    public Guid? CrmautoRunCustomerOrgId { get; set; }

    public string? CustomerName { get; set; }

    public DateTime? CrmfieldUpdateCreatedAt { get; set; }
}
