using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalAuditEventSummary
{
    public Guid? PortalAuditId { get; set; }

    public string? PortalAuditEventTypeCode { get; set; }

    public bool? PortalEventTypeIsSecurityRelevant { get; set; }

    public Guid? PortalAuditSiteId { get; set; }

    public string? PortalSiteName { get; set; }

    public Guid? PortalAuditPortalUserId { get; set; }

    public string? PortalUserDisplayName { get; set; }

    public string? PortalUserEmail { get; set; }

    public Guid? PortalAuditApiclientId { get; set; }

    public string? PortalApiclientName { get; set; }

    public Guid? PortalAuditOrgId { get; set; }

    public string? PortalAuditOrgName { get; set; }

    public string? PortalAuditResourceTypeCode { get; set; }

    public string? PortalAuditTargetTable { get; set; }

    public Guid? PortalAuditTargetId { get; set; }

    public string? PortalAuditResultCode { get; set; }

    public string? PortalAuditMessage { get; set; }

    public DateTime? PortalAuditCreatedAt { get; set; }
}
