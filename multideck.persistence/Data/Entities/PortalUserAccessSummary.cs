using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalUserAccessSummary
{
    public Guid? PortalUserId { get; set; }

    public string? PortalUserDisplayName { get; set; }

    public string? PortalUserEmail { get; set; }

    public string? PortalUserAudienceTypeCode { get; set; }

    public string? PortalUserStatusCode { get; set; }

    public Guid? PortalUserPrimaryOrgId { get; set; }

    public string? PortalUserPrimaryOrgName { get; set; }

    public Guid? PortalUserDefaultSiteId { get; set; }

    public string? PortalSiteName { get; set; }

    public bool? PortalUserMfarequired { get; set; }

    public DateTime? PortalUserEmailVerifiedAt { get; set; }

    public DateTime? PortalUserLastLoginAt { get; set; }

    public long? PortalUserRoleCount { get; set; }

    public long? PortalUserDirectShareCount { get; set; }
}
