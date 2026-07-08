using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAuditActorType
{
    public string AuditActorTypeCode { get; set; } = null!;

    public string AuditActorTypeName { get; set; } = null!;

    public string? AuditActorTypeDescription { get; set; }

    public bool AuditActorTypeIsActive { get; set; }

    public int AuditActorTypeSortOrder { get; set; }

    public virtual ICollection<AuditEvent> AuditEvents { get; set; } = new List<AuditEvent>();

    public virtual ICollection<AuditRequestContext> AuditRequestContexts { get; set; } = new List<AuditRequestContext>();
}
