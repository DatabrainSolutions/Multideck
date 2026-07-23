using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalSite
{
    public Guid PortalSiteId { get; set; }

    public string PortalSiteCode { get; set; } = null!;

    public string PortalSiteName { get; set; } = null!;

    public string? PortalSiteDescription { get; set; }

    public string PortalSiteSiteTypeCode { get; set; } = null!;

    public string? PortalSiteDefaultAudienceTypeCode { get; set; }

    public Guid? PortalSiteOrgOfficeId { get; set; }

    public Guid? PortalSiteLegalEntityId { get; set; }

    public Guid? PortalSiteBrandId { get; set; }

    public Guid? PortalSiteCustomerOrgId { get; set; }

    public string PortalSiteDefaultLanguageCode { get; set; } = null!;

    public string PortalSiteDefaultTimeZone { get; set; } = null!;

    public string? PortalSiteSupportEmail { get; set; }

    public Guid? PortalSiteLogoAssetId { get; set; }

    public Guid? PortalSiteDocBuilderThemeId { get; set; }

    public string PortalSiteAllowedAuthMethodsJson { get; set; } = null!;

    public string PortalSiteFieldPolicyJson { get; set; } = null!;

    public string PortalSiteFeatureFlagsJson { get; set; } = null!;

    public bool PortalSiteIsActive { get; set; }

    public DateTime PortalSiteCreatedAt { get; set; }

    public Guid? PortalSiteCreatedBy { get; set; }

    public DateTime PortalSiteUpdatedAt { get; set; }

    public Guid? PortalSiteUpdatedBy { get; set; }

    public bool PortalSiteIsDeleted { get; set; }

    public virtual ICollection<PortalActionRequest> PortalActionRequests { get; set; } = new List<PortalActionRequest>();

    public virtual ICollection<PortalApiclient> PortalApiclients { get; set; } = new List<PortalApiclient>();

    public virtual ICollection<PortalAuditEvent> PortalAuditEvents { get; set; } = new List<PortalAuditEvent>();

    public virtual ICollection<PortalDocumentShare> PortalDocumentShares { get; set; } = new List<PortalDocumentShare>();

    public virtual ICollection<PortalFileUpload> PortalFileUploads { get; set; } = new List<PortalFileUpload>();

    public virtual ICollection<PortalInvitation> PortalInvitations { get; set; } = new List<PortalInvitation>();

    public virtual ICollection<PortalNotificationSubscription> PortalNotificationSubscriptions { get; set; } = new List<PortalNotificationSubscription>();

    public virtual ICollection<PortalPublicLink> PortalPublicLinks { get; set; } = new List<PortalPublicLink>();

    public virtual ICollection<PortalRecordShare> PortalRecordShares { get; set; } = new List<PortalRecordShare>();

    public virtual ICollection<PortalRole> PortalRoles { get; set; } = new List<PortalRole>();

    public virtual CmpBrand? PortalSiteBrand { get; set; }

    public virtual CmpUser? PortalSiteCreatedByNavigation { get; set; }

    public virtual OrgMaster? PortalSiteCustomerOrg { get; set; }

    public virtual SysPortalAudienceType? PortalSiteDefaultAudienceTypeCodeNavigation { get; set; }

    public virtual DocbTheme? PortalSiteDocBuilderTheme { get; set; }

    public virtual ICollection<PortalSiteDomain> PortalSiteDomains { get; set; } = new List<PortalSiteDomain>();

    public virtual CmpLegalEntity? PortalSiteLegalEntity { get; set; }

    public virtual DocbAssetLibrary? PortalSiteLogoAsset { get; set; }

    public virtual CmpOffice? PortalSiteOrgOffice { get; set; }

    public virtual SysPortalSiteType PortalSiteSiteTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? PortalSiteUpdatedByNavigation { get; set; }

    public virtual ICollection<PortalThreadAccess> PortalThreadAccesses { get; set; } = new List<PortalThreadAccess>();

    public virtual ICollection<PortalUserRole> PortalUserRoles { get; set; } = new List<PortalUserRole>();

    public virtual ICollection<PortalUser> PortalUsers { get; set; } = new List<PortalUser>();
}
