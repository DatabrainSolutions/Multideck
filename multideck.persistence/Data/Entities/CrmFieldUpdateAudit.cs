using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmFieldUpdateAudit
{
    public Guid CrmfieldAuditId { get; set; }

    public Guid CrmfieldAuditFieldUpdateId { get; set; }

    public string CrmfieldAuditAction { get; set; } = null!;

    public string? CrmfieldAuditFromStatusCode { get; set; }

    public string? CrmfieldAuditToStatusCode { get; set; }

    public string? CrmfieldAuditOldValueText { get; set; }

    public string? CrmfieldAuditNewValueText { get; set; }

    public string? CrmfieldAuditReason { get; set; }

    public DateTime CrmfieldAuditCreatedAt { get; set; }

    public Guid? CrmfieldAuditCreatedBy { get; set; }

    public virtual CmpUser? CrmfieldAuditCreatedByNavigation { get; set; }

    public virtual CrmFieldUpdateQueue CrmfieldAuditFieldUpdate { get; set; } = null!;
}
