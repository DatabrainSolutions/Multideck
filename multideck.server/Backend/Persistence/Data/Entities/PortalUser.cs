using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalUser
{
    public Guid PortalUserId { get; set; }

    public Guid? PortalUserDefaultSiteId { get; set; }

    public string PortalUserAudienceTypeCode { get; set; } = null!;

    public string PortalUserStatusCode { get; set; } = null!;

    public Guid? PortalUserPrimaryOrgId { get; set; }

    public Guid? PortalUserPrimaryContactId { get; set; }

    public string PortalUserDisplayName { get; set; } = null!;

    public string PortalUserEmail { get; set; } = null!;

    public string? PortalUserPhone { get; set; }

    public string PortalUserPreferredLanguageCode { get; set; } = null!;

    public string? PortalUserTimeZone { get; set; }

    public bool PortalUserMfarequired { get; set; }

    public DateTime? PortalUserEmailVerifiedAt { get; set; }

    public DateTime? PortalUserLastLoginAt { get; set; }

    public DateTime? PortalUserLastFailedLoginAt { get; set; }

    public int PortalUserFailedLoginCount { get; set; }

    public DateTime? PortalUserLockedUntil { get; set; }

    public DateTime PortalUserValidFrom { get; set; }

    public DateTime? PortalUserValidUntil { get; set; }

    public string PortalUserPreferencesJson { get; set; } = null!;

    public DateTime PortalUserCreatedAt { get; set; }

    public Guid? PortalUserCreatedBy { get; set; }

    public DateTime PortalUserUpdatedAt { get; set; }

    public Guid? PortalUserUpdatedBy { get; set; }

    public bool PortalUserIsDeleted { get; set; }

    public virtual ICollection<LocProfileScope> LocProfileScopes { get; set; } = new List<LocProfileScope>();

    public virtual ICollection<PortalActionRequest> PortalActionRequests { get; set; } = new List<PortalActionRequest>();

    public virtual ICollection<PortalActionResponse> PortalActionResponses { get; set; } = new List<PortalActionResponse>();

    public virtual ICollection<PortalAuditEvent> PortalAuditEvents { get; set; } = new List<PortalAuditEvent>();

    public virtual ICollection<PortalExternalIdentity> PortalExternalIdentities { get; set; } = new List<PortalExternalIdentity>();

    public virtual ICollection<PortalFileUpload> PortalFileUploads { get; set; } = new List<PortalFileUpload>();

    public virtual ICollection<PortalInvitation> PortalInvitationPortalInviteAcceptedByPortalUsers { get; set; } = new List<PortalInvitation>();

    public virtual ICollection<PortalInvitation> PortalInvitationPortalInvitePortalUsers { get; set; } = new List<PortalInvitation>();

    public virtual ICollection<PortalNotificationSubscription> PortalNotificationSubscriptions { get; set; } = new List<PortalNotificationSubscription>();

    public virtual ICollection<PortalRecordShare> PortalRecordShares { get; set; } = new List<PortalRecordShare>();

    public virtual ICollection<PortalThreadAccess> PortalThreadAccesses { get; set; } = new List<PortalThreadAccess>();

    public virtual SysPortalAudienceType PortalUserAudienceTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? PortalUserCreatedByNavigation { get; set; }

    public virtual PortalSite? PortalUserDefaultSite { get; set; }

    public virtual ICollection<PortalUserOrganisation> PortalUserOrganisations { get; set; } = new List<PortalUserOrganisation>();

    public virtual OrgContact? PortalUserPrimaryContact { get; set; }

    public virtual OrgMaster? PortalUserPrimaryOrg { get; set; }

    public virtual ICollection<PortalUserRole> PortalUserRoles { get; set; } = new List<PortalUserRole>();

    public virtual SysPortalAccessStatus PortalUserStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? PortalUserUpdatedByNavigation { get; set; }
}
