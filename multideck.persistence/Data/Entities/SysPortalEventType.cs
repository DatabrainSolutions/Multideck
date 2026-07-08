using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysPortalEventType
{
    public string PortalEventTypeCode { get; set; } = null!;

    public string PortalEventTypeName { get; set; } = null!;

    public string? PortalEventTypeDescription { get; set; }

    public bool PortalEventTypeIsSecurityRelevant { get; set; }

    public int PortalEventTypeSortOrder { get; set; }

    public virtual ICollection<PortalAuditEvent> PortalAuditEvents { get; set; } = new List<PortalAuditEvent>();
}
