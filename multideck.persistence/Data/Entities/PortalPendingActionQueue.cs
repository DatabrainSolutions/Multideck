using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalPendingActionQueue
{
    public Guid? PortalActionId { get; set; }

    public Guid? PortalActionSiteId { get; set; }

    public string? PortalSiteName { get; set; }

    public string? PortalActionActionTypeCode { get; set; }

    public string? PortalActionStatusCode { get; set; }

    public string? PortalActionResourceTypeCode { get; set; }

    public string? PortalActionTargetTable { get; set; }

    public Guid? PortalActionTargetId { get; set; }

    public Guid? PortalActionJobId { get; set; }

    public int? PortalActionJobNumber { get; set; }

    public Guid? PortalActionWorkflowTaskId { get; set; }

    public Guid? PortalActionAssignedPortalUserId { get; set; }

    public string? PortalUserDisplayName { get; set; }

    public string? PortalUserEmail { get; set; }

    public Guid? PortalActionAssignedOrgId { get; set; }

    public string? PortalActionAssignedOrgName { get; set; }

    public string? PortalActionTitle { get; set; }

    public DateTime? PortalActionDueAt { get; set; }

    public DateTime? PortalActionExpiresAt { get; set; }

    public bool? PortalActionRequiresInternalReview { get; set; }

    public DateTime? PortalActionCreatedAt { get; set; }
}
