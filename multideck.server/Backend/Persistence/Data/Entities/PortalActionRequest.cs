using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalActionRequest
{
    public Guid PortalActionId { get; set; }

    public Guid? PortalActionSiteId { get; set; }

    public string PortalActionActionTypeCode { get; set; } = null!;

    public string PortalActionStatusCode { get; set; } = null!;

    public string PortalActionResourceTypeCode { get; set; } = null!;

    public string PortalActionTargetTable { get; set; } = null!;

    public Guid PortalActionTargetId { get; set; }

    public Guid? PortalActionJobId { get; set; }

    public Guid? PortalActionWorkflowTaskId { get; set; }

    public Guid? PortalActionCommThreadId { get; set; }

    public Guid? PortalActionAssignedPortalUserId { get; set; }

    public Guid? PortalActionAssignedOrgId { get; set; }

    public string PortalActionTitle { get; set; } = null!;

    public string? PortalActionDescription { get; set; }

    public string PortalActionRequestPayloadJson { get; set; } = null!;

    public DateTime? PortalActionDueAt { get; set; }

    public DateTime? PortalActionExpiresAt { get; set; }

    public bool PortalActionRequiresInternalReview { get; set; }

    public DateTime PortalActionCreatedAt { get; set; }

    public Guid? PortalActionCreatedBy { get; set; }

    public DateTime PortalActionUpdatedAt { get; set; }

    public Guid? PortalActionUpdatedBy { get; set; }

    public virtual SysPortalActionType PortalActionActionTypeCodeNavigation { get; set; } = null!;

    public virtual OrgMaster? PortalActionAssignedOrg { get; set; }

    public virtual PortalUser? PortalActionAssignedPortalUser { get; set; }

    public virtual CommThread? PortalActionCommThread { get; set; }

    public virtual CmpUser? PortalActionCreatedByNavigation { get; set; }

    public virtual JobHeader? PortalActionJob { get; set; }

    public virtual SysPortalResourceType PortalActionResourceTypeCodeNavigation { get; set; } = null!;

    public virtual ICollection<PortalActionResponse> PortalActionResponses { get; set; } = new List<PortalActionResponse>();

    public virtual PortalSite? PortalActionSite { get; set; }

    public virtual SysPortalActionStatus PortalActionStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? PortalActionUpdatedByNavigation { get; set; }

    public virtual WorkflowTask? PortalActionWorkflowTask { get; set; }
}
