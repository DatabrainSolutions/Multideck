using System;
using System.Collections.Generic;
using System.Net;

namespace Multideck.Persistence.Entities;

public partial class PortalAuditEvent
{
    public Guid PortalAuditId { get; set; }

    public string PortalAuditEventTypeCode { get; set; } = null!;

    public Guid? PortalAuditSiteId { get; set; }

    public Guid? PortalAuditPortalUserId { get; set; }

    public Guid? PortalAuditApiclientId { get; set; }

    public Guid? PortalAuditOrgId { get; set; }

    public string? PortalAuditResourceTypeCode { get; set; }

    public string? PortalAuditTargetTable { get; set; }

    public Guid? PortalAuditTargetId { get; set; }

    public Guid? PortalAuditCommThreadId { get; set; }

    public Guid? PortalAuditWorkflowTaskId { get; set; }

    public IPAddress? PortalAuditIpaddress { get; set; }

    public string? PortalAuditUserAgent { get; set; }

    public string? PortalAuditRequestId { get; set; }

    public string? PortalAuditResultCode { get; set; }

    public string? PortalAuditMessage { get; set; }

    public string PortalAuditMetadataJson { get; set; } = null!;

    public DateTime PortalAuditCreatedAt { get; set; }

    public virtual PortalApiclient? PortalAuditApiclient { get; set; }

    public virtual CommThread? PortalAuditCommThread { get; set; }

    public virtual SysPortalEventType PortalAuditEventTypeCodeNavigation { get; set; } = null!;

    public virtual OrgMaster? PortalAuditOrg { get; set; }

    public virtual PortalUser? PortalAuditPortalUser { get; set; }

    public virtual SysPortalResourceType? PortalAuditResourceTypeCodeNavigation { get; set; }

    public virtual PortalSite? PortalAuditSite { get; set; }

    public virtual WorkflowTask? PortalAuditWorkflowTask { get; set; }
}
