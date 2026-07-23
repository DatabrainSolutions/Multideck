using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmAppliedFieldUpdateAudit
{
    public Guid? CrmfieldAuditId { get; set; }

    public Guid? CrmfieldAuditFieldUpdateId { get; set; }

    public string? CrmfieldUpdateTargetTable { get; set; }

    public string? CrmfieldUpdateTargetColumn { get; set; }

    public Guid? CrmfieldUpdateTargetId { get; set; }

    public string? CrmfieldAuditAction { get; set; }

    public string? CrmfieldAuditFromStatusCode { get; set; }

    public string? CrmfieldAuditToStatusCode { get; set; }

    public string? CrmfieldAuditOldValueText { get; set; }

    public string? CrmfieldAuditNewValueText { get; set; }

    public DateTime? CrmfieldAuditCreatedAt { get; set; }

    public Guid? CrmfieldAuditCreatedBy { get; set; }
}
