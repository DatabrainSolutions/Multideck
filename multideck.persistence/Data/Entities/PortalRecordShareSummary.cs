using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalRecordShareSummary
{
    public Guid? PortalShareId { get; set; }

    public Guid? PortalShareSiteId { get; set; }

    public string? PortalSiteName { get; set; }

    public string? PortalShareResourceTypeCode { get; set; }

    public string? PortalShareTargetTable { get; set; }

    public Guid? PortalShareTargetId { get; set; }

    public Guid? PortalShareJobId { get; set; }

    public int? PortalShareJobNumber { get; set; }

    public Guid? PortalShareOrgId { get; set; }

    public string? PortalShareOrgName { get; set; }

    public Guid? PortalShareContactId { get; set; }

    public Guid? PortalSharePortalUserId { get; set; }

    public string? PortalUserDisplayName { get; set; }

    public string? PortalUserEmail { get; set; }

    public Guid? PortalShareRoleId { get; set; }

    public string? PortalRoleName { get; set; }

    public string? PortalShareStatusCode { get; set; }

    public string? PortalShareAllowedActionsJson { get; set; }

    public DateTime? PortalShareValidFrom { get; set; }

    public DateTime? PortalShareValidUntil { get; set; }

    public DateTime? PortalShareCreatedAt { get; set; }
}
