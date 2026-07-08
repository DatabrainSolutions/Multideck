using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalInvitation
{
    public Guid PortalInviteId { get; set; }

    public Guid PortalInviteSiteId { get; set; }

    public Guid? PortalInvitePortalUserId { get; set; }

    public Guid? PortalInviteOrgId { get; set; }

    public Guid? PortalInviteContactId { get; set; }

    public string PortalInviteEmail { get; set; } = null!;

    public string? PortalInviteDisplayName { get; set; }

    public string PortalInviteAudienceTypeCode { get; set; } = null!;

    public Guid? PortalInviteRoleId { get; set; }

    public string PortalInviteStatusCode { get; set; } = null!;

    public string? PortalInviteTokenHashSha256 { get; set; }

    public string? PortalInviteInvitationUrl { get; set; }

    public string? PortalInviteMessage { get; set; }

    public DateTime? PortalInviteExpiresAt { get; set; }

    public DateTime? PortalInviteSentAt { get; set; }

    public DateTime? PortalInviteAcceptedAt { get; set; }

    public Guid? PortalInviteAcceptedByPortalUserId { get; set; }

    public DateTime PortalInviteCreatedAt { get; set; }

    public Guid? PortalInviteCreatedBy { get; set; }

    public virtual PortalUser? PortalInviteAcceptedByPortalUser { get; set; }

    public virtual SysPortalAudienceType PortalInviteAudienceTypeCodeNavigation { get; set; } = null!;

    public virtual OrgContact? PortalInviteContact { get; set; }

    public virtual CmpUser? PortalInviteCreatedByNavigation { get; set; }

    public virtual OrgMaster? PortalInviteOrg { get; set; }

    public virtual PortalUser? PortalInvitePortalUser { get; set; }

    public virtual PortalRole? PortalInviteRole { get; set; }

    public virtual PortalSite PortalInviteSite { get; set; } = null!;

    public virtual SysPortalInvitationStatus PortalInviteStatusCodeNavigation { get; set; } = null!;
}
